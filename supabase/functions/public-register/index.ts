// 학부모 캠프 등록 신청 (비로그인 공개 신청서 /register/:slug)
// - 공개 키(publishable)로만 호출. 개인정보를 다루는 DB 함수는 service role로만 실행한다.
// - action: "prefill"(상담 기록 링크로 미리 채움) / "submit"(신청 저장) / "my"(고객용 신청 내용 확인)
// - 저장은 submit_registration()이 한 트랜잭션으로 처리(정원·납부 일정·동의 기록·확인 링크)
// 여권 사진은 신청 저장 뒤 passport-upload로 따로 올린다(M8)
// 납부 안내 알림톡(대기 접수는 대기 안내)·직원 알림은 DB가 발송 대기열에 넣고 message-sender가 보낸다(문안: docs/alimtalk-templates.md)
import { withSupabase } from "@supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const CONSENT_KINDS = [
  "reg_privacy", "reg_passport", "reg_third_party", "reg_health", "reg_guardian",
  "reg_partner_share", "refund", "destruction_notice",
];

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

function text(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function uuidOrNull(value: unknown): string | null {
  const v = String(value ?? "");
  return UUID_RE.test(v) ? v : null;
}

function tokenOrNull(value: unknown): string | null {
  const v = String(value ?? "");
  return TOKEN_RE.test(v) ? v : null;
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
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`registration:${phone}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

const ERRORS: Record<string, [number, string]> = {
  NOT_FOUND: [404, "신청서를 찾을 수 없습니다. 링크를 다시 확인해 주세요."],
  NOT_OPEN: [409, "지금은 이 프로그램의 신청을 받지 않습니다."],
  FULL: [409, "정원이 마감되었습니다. 카카오톡으로 문의해 주세요."],
  DUPLICATE: [409, "이미 신청된 학생입니다. 신청 내용 확인이나 변경은 카카오톡으로 문의해 주세요."],
  TOO_MANY_REQUESTS: [429, "같은 번호로 방금 신청하셨습니다. 잠시 후 다시 시도해 주세요."],
  CONSENT_REQUIRED: [400, "필수 동의 항목에 모두 동의해 주세요."],
  INVALID_INPUT: [400, "입력하신 내용을 다시 확인해 주세요."],
};

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

    const action = String(body.action ?? "submit");

    // 상담 기록 링크로 미리 채움
    if (action === "prefill") {
      const token = tokenOrNull(body.token);
      if (!token) return reply(200, { prefill: null });
      const { data, error } = await ctx.supabaseAdmin.rpc("registration_prefill", { p_token: token });
      if (error) {
        console.error("registration_prefill failed", error.message);
        return reply(200, { prefill: null });
      }
      return reply(200, { prefill: data ?? null });
    }

    // 고객용 신청 내용 확인
    if (action === "my") {
      const token = tokenOrNull(body.token);
      if (!token) return reply(404, { error: "링크가 올바르지 않거나 만료되었습니다." });
      const { data, error } = await ctx.supabaseAdmin.rpc("registration_summary_by_token", { p_token: token });
      if (error) {
        console.error("registration_summary_by_token failed", error.message);
        return reply(500, { error: "신청 내용을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." });
      }
      if (!data) return reply(404, { error: "링크가 올바르지 않거나 만료되었습니다." });
      return reply(200, { summary: data });
    }

    if (action !== "submit") return reply(400, { error: "요청 형식이 올바르지 않습니다." });

    // 허니팟: 사람에게는 보이지 않는 칸이 채워져 있으면 저장하지 않고 성공처럼 응답
    if (text(body.website, 200)) return reply(200, { ok: true, status: "received", my_token: null });

    const slug = text(body.slug, 60).toLowerCase();
    if (!SLUG_RE.test(slug)) return reply(404, { error: ERRORS.NOT_FOUND[1], code: "NOT_FOUND" });

    const phone = String(body.parent_phone ?? "").replace(/\D/g, "");
    if (!text(body.student_name_ko, 50) || !text(body.parent_name, 50)) {
      return reply(400, { error: "학생과 학부모 이름을 입력해 주세요." });
    }
    if (!/^01[0-9]{8,9}$/.test(phone)) return reply(400, { error: "휴대폰 번호를 확인해 주세요." });

    const rawAgree = (body.agree && typeof body.agree === "object" ? body.agree : {}) as Record<string, unknown>;
    const agree = Object.fromEntries(CONSENT_KINDS.map((k) => [k, rawAgree[k] === true]));

    const payload = {
      slug,
      token: tokenOrNull(body.token),
      partner_code: text(body.partner_code, 40).toLowerCase() || null,
      contact_code: text(body.contact_code, 30).toLowerCase() || null,
      partner_id: uuidOrNull(body.partner_id),
      contact_id: uuidOrNull(body.contact_id),
      source_other: text(body.source_other, 100) || null,
      student_name_ko: text(body.student_name_ko, 50),
      student_name_en: text(body.student_name_en, 60),
      birth_date: text(body.birth_date, 10),
      gender: text(body.gender, 10),
      school: text(body.school, 60),
      grade: text(body.grade, 10),
      english_level: text(body.english_level, 20),
      parent_name: text(body.parent_name, 50),
      parent_phone: phone,
      parent_email: text(body.parent_email, 120),
      address: text(body.address, 200),
      emergency_name: text(body.emergency_name, 50),
      emergency_relation: text(body.emergency_relation, 20),
      emergency_phone: String(body.emergency_phone ?? "").replace(/\D/g, "").slice(0, 11),
      special_notes: text(body.special_notes, 2000),
      health_notes: text(body.health_notes, 2000),
      agree,
      phone_hash: await phoneHash(phone),
    };

    const { data, error } = await ctx.supabaseAdmin.rpc("submit_registration", { p: payload });
    if (error) {
      const code = error.hint ?? "";
      const known = ERRORS[code];
      if (known) return reply(known[0], { error: known[1], code });
      console.error("submit_registration failed", error.message);
      return reply(500, { error: "신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }

    kickMessageSender(req);
    const result = data as { status: string; my_token: string };
    // 완료 화면용 요약(납부 일정·계좌·파기 예정일). 확인 링크 원문은 이번 응답에서만 돌려준다.
    const { data: summary } = await ctx.supabaseAdmin.rpc("registration_summary_by_token", { p_token: result.my_token });
    return reply(200, { ok: true, status: result.status, my_token: result.my_token, summary: summary ?? null });
  }),
};
