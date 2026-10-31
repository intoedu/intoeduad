// 학부모 상담 신청 접수 (비로그인 공개 폼)
// - 공개 키(publishable)로만 호출 가능, 저장은 submit_lead()가 한 트랜잭션으로 처리
// - 허니팟·입력 검증·같은 번호 단시간 중복 제출 제한(번호는 해시로만 비교)
// 접수 확인 알림톡·직원 알림은 DB가 발송 대기열에 넣고 message-sender가 보낸다
import { withSupabase } from "@supabase/server";

const GRADES = new Set([
  "초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3", "기타",
]);
const INTERESTS = new Set(["study_abroad", "camp"]);
const TOPICS = new Set(["camp", "study_abroad", "cost", "schedule", "other"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

function text(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function list(value: unknown, allowed: Set<string>): string[] {
  return Array.isArray(value) ? [...new Set(value.map(String).filter((v) => allowed.has(v)))] : [];
}

function uuidOrNull(value: unknown): string | null {
  const v = String(value ?? "");
  return UUID_RE.test(v) ? v : null;
}

// 전화번호는 원문 대신 비밀값을 섞은 해시로만 중복 제출을 비교한다
async function phoneHash(phone: string): Promise<string> {
  const pepper = Deno.env.get("PHONE_HASH_PEPPER") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(phone));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// 신청 직후 알림 발송 함수를 깨운다(실패해도 매분 예약 작업이 다시 처리)
function kickMessageSender(req: Request) {
  const token = Deno.env.get("MESSAGE_RUNNER_TOKEN");
  const base = Deno.env.get("SUPABASE_URL");
  const apikey = req.headers.get("apikey") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || !base || !apikey) return;
  const p = fetch(`${base}/functions/v1/message-sender`, {
    method: "POST",
    headers: { apikey, Authorization: `Bearer ${apikey}`, "x-runner-token": token, "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {});
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(p);
}

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") return reply(405, { error: "허용되지 않은 요청입니다." });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return reply(400, { error: "요청 형식이 올바르지 않습니다." });
    }

    // 허니팟: 사람에게는 보이지 않는 칸이 채워져 있으면 저장하지 않고 성공처럼 응답
    if (text(body.website, 200)) return reply(200, { ok: true, scheduled_at: null });

    const phone = String(body.parent_phone ?? "").replace(/\D/g, "");
    const studentName = text(body.student_name, 50);
    const parentName = text(body.parent_name, 50);
    const grade = text(body.student_grade, 10);

    if (!studentName || !parentName) return reply(400, { error: "자녀와 학부모 이름을 입력해 주세요." });
    if (!/^01[0-9]{8,9}$/.test(phone)) return reply(400, { error: "휴대폰 번호를 확인해 주세요." });
    if (grade && !GRADES.has(grade)) return reply(400, { error: "학년을 다시 선택해 주세요." });
    if (body.agree_privacy !== true || body.agree_guardian !== true) {
      return reply(400, { error: "필수 동의 항목에 동의해 주세요." });
    }

    const programIds = Array.isArray(body.program_ids)
      ? body.program_ids.map(uuidOrNull).filter((v): v is string => v !== null).slice(0, 20)
      : [];

    const payload = {
      partner_code: text(body.partner_code, 40).toLowerCase() || null,
      contact_code: text(body.contact_code, 30).toLowerCase() || null,
      partner_id: uuidOrNull(body.partner_id),
      contact_id: uuidOrNull(body.contact_id),
      source_other: text(body.source_other, 100) || null,
      student_name: studentName,
      student_grade: grade || null,
      interests: list(body.interests, INTERESTS),
      program_ids: programIds,
      parent_name: parentName,
      parent_phone: phone,
      relation: text(body.relation, 20) || null,
      topics: list(body.topics, TOPICS),
      message: text(body.message, 2000) || null,
      slot_id: uuidOrNull(body.slot_id),
      agree_privacy: true,
      agree_guardian: true,
      phone_hash: await phoneHash(phone),
    };

    const { data, error } = await ctx.supabaseAdmin.rpc("submit_lead", { p: payload });
    if (error) {
      const code = error.hint ?? "";
      if (code === "SLOT_UNAVAILABLE") {
        return reply(409, { error: "선택하신 상담 시간이 방금 마감되었습니다. 다른 시간을 선택해 주세요.", code });
      }
      if (code === "TOO_MANY_REQUESTS") {
        return reply(429, { error: "같은 번호로 방금 신청하셨습니다. 잠시 후 다시 시도해 주세요.", code });
      }
      if (code === "INVALID_INPUT" || code === "CONSENT_REQUIRED") {
        return reply(400, { error: "입력하신 내용을 다시 확인해 주세요.", code });
      }
      console.error("submit_lead failed", error.message);
      return reply(500, { error: "신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }

    kickMessageSender(req);
    const result = data as { scheduled_at: string | null };
    return reply(200, { ok: true, scheduled_at: result.scheduled_at });
  }),
};
