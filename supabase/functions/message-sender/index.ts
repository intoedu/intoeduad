// 알림 발송 — 대기열(message_logs, status = queued)을 처리한다
// - 학부모 알림톡(솔라피 ATA): 상담 접수·등록 납부 안내·대기 접수·납부 정정 (1회성, 실패 시 문자 대체발송은 솔라피 설정)
// - 직원 알림: 문자(SMS/LMS) 또는 이메일(Resend) — 학부모 개인정보 없이 "신규 신청 1건" 형태
// - 호출: 매분 예약 작업(x-runner-token) / 신청 직후 공개 함수 / 직원 화면(로그인)
// - 솔라피·이메일을 꺼 두거나 설정하지 않으면 "보내지 않음(skipped)"으로 기록하고 끝낸다(시스템은 그대로 동작)
// - SOLAPI_DRY_RUN=true 이면 실제로 보내지 않고 요청만 만들어 본다(로컬 테스트)
import { withSupabase } from "@supabase/server";
import {
  kstDateTime,
  maskPhone,
  paymentNoticeVariables,
  smsType,
  solapiAuthHeader,
  STAFF_TEXT,
  toSolapiVariables,
  type ScheduleLine,
} from "./build.ts";

const SOLAPI_URL = (Deno.env.get("SOLAPI_BASE_URL") ?? "https://api.solapi.com") + "/messages/v4/send-many/detail";
const DRY_RUN = Deno.env.get("SOLAPI_DRY_RUN") === "true";

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

function sameToken(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function phoneHash(phone: string): Promise<string> {
  const pepper = Deno.env.get("PHONE_HASH_PEPPER") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`message:${phone}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

class Skip extends Error {}
class Permanent extends Error {}

type Ctx = {
  message: { id: string; channel: string; purpose: string; template_code: string | null; related_id: string | null; attempts: number };
  data: Record<string, unknown>;
  settings: Record<string, any>;
};

async function sendSolapi(messages: Record<string, unknown>[]): Promise<string | null> {
  if (DRY_RUN) return "dry-run";
  const apiKey = Deno.env.get("SOLAPI_API_KEY");
  const apiSecret = Deno.env.get("SOLAPI_API_SECRET");
  if (!apiKey || !apiSecret) throw new Skip("솔라피 API 키가 설정되지 않음(Edge Function 시크릿)");
  const res = await fetch(SOLAPI_URL, {
    method: "POST",
    headers: { Authorization: await solapiAuthHeader(apiKey, apiSecret), "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const text = await res.text();
  if (!res.ok) {
    // 4xx는 다시 보내도 같은 결과 → 실패로 끝냄, 5xx·네트워크는 재시도
    if (res.status >= 400 && res.status < 500) throw new Permanent(`솔라피 ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`솔라피 ${res.status}: ${text.slice(0, 300)}`);
  }
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    // 본문이 JSON이 아니면 그룹 ID 없이 성공으로 본다
  }
  const failed = json?.failedMessageList;
  if (Array.isArray(failed) && failed.length > 0) {
    throw new Permanent(`솔라피 접수 실패: ${failed.map((f: any) => `${f.statusCode ?? ""} ${f.statusMessage ?? ""}`).join(", ").slice(0, 300)}`);
  }
  return json?.groupInfo?._id ?? json?.groupId ?? null;
}

async function sendEmail(to: string, subject: string, text: string, from: string): Promise<string | null> {
  if (DRY_RUN) return "dry-run";
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Skip("이메일 API 키가 설정되지 않음(RESEND_API_KEY)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) throw new Permanent(`이메일 ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`이메일 ${res.status}: ${body.slice(0, 300)}`);
  }
  try {
    return JSON.parse(body)?.id ?? null;
  } catch {
    return null;
  }
}

// 한 건 처리 → [상태, 공급자 ID, 오류, 마스킹 번호, 해시]
async function processOne(admin: any, c: Ctx): Promise<[string, string | null, string | null, string | null, string | null]> {
  const m = c.message;
  const d = c.data ?? {};
  const s = c.settings ?? {};
  const solapi = s.solapi ?? {};

  // 직원 알림
  if (m.purpose.startsWith("staff_")) {
    const text = STAFF_TEXT[m.purpose];
    if (!text) throw new Permanent(`알 수 없는 알림: ${m.purpose}`);
    if (!d.active) throw new Skip("비활성 직원");
    if (m.channel === "email") {
      const email = s.email ?? {};
      if (!email.enabled || !email.from) throw new Skip("이메일 알림 사용 안 함(설정)");
      const id = await sendEmail(String(d.email), text.split(".")[0], text, String(email.from));
      return ["sent", id, null, String(d.email).replace(/^(.).*(@.*)$/, "$1***$2"), null];
    }
    const phone = String(d.phone ?? "");
    if (!phone) throw new Skip("직원 휴대폰 번호 없음");
    if (!solapi.enabled || !solapi.sender_number) throw new Skip("문자 알림 사용 안 함(솔라피 설정)");
    const id = await sendSolapi([{ to: phone, from: solapi.sender_number, text, type: smsType(text) }]);
    return ["sent", id, null, maskPhone(phone), await phoneHash(phone)];
  }

  // 학부모 알림톡
  if (d.destroyed) throw new Skip("개인정보가 파기된 신청");
  const phone = String(d.phone ?? "");
  if (!phone) throw new Skip("연락처 없음");
  const template = m.template_code ?? m.purpose;
  if (!solapi.enabled) throw new Skip("알림톡 사용 안 함(설정)");
  const templateId = solapi.templates?.[template];
  if (!templateId || !solapi.pf_id || !solapi.sender_number) throw new Skip("솔라피 채널·발신번호·템플릿 ID 미설정");
  const kakaoUrl = String(s.kakao_channel_url ?? "");
  if (!kakaoUrl) throw new Skip("카카오톡 채널 주소 미설정");

  let values: Record<string, string>;
  if (template === "lead_received") {
    values = {
      학부모명: String(d.parent_name),
      자녀명: String(d.student_name),
      상담일시: d.scheduled_at ? kstDateTime(String(d.scheduled_at)) : "담당자가 연락드려 정합니다",
      카카오채널: kakaoUrl,
    };
  } else {
    const site = String(s.public_site_url ?? "").replace(/\/+$/, "");
    if (!site) throw new Skip("사이트 주소(기본 설정) 미설정");
    const { data: token, error } = await admin.rpc("issue_my_token", { p_registration_id: m.related_id });
    if (error || !token) throw new Error("신청 내용 확인 링크를 만들지 못함");
    values = {
      ...paymentNoticeVariables({
        parentName: String(d.parent_name),
        studentName: String(d.student_name),
        programName: String(d.program_name),
        startDate: String(d.start_date),
        endDate: String(d.end_date),
        destroyDate: String(d.destroy_date),
        schedule: (d.schedule as ScheduleLine[]) ?? [],
        bank: s.bank_account ?? null,
        myUrl: `${site}/my/${token}`,
        kakaoUrl,
      }),
      변경내용: String(d.change_reasons ?? "") || "납부 금액·기한 변경",
    };
  }
  const variables = toSolapiVariables(template, values);
  const id = await sendSolapi([
    {
      to: phone,
      from: solapi.sender_number,
      type: "ATA",
      kakaoOptions: { pfId: solapi.pf_id, templateId, variables, disableSms: solapi.sms_fallback === false },
    },
  ]);
  return ["sent", id, null, maskPhone(phone), await phoneHash(phone)];
}

export default {
  fetch: withSupabase({ auth: ["user", "publishable"] }, async (req, ctx) => {
    if (req.method !== "POST") return reply(405, { error: "허용되지 않은 요청입니다." });
    if (ctx.authMode === "user") {
      const { data: ok } = await ctx.supabase.rpc("is_staff_or_admin");
      if (!ok) return reply(403, { error: "권한이 없습니다." });
    } else if (!sameToken(req.headers.get("x-runner-token") ?? "", Deno.env.get("MESSAGE_RUNNER_TOKEN") ?? "")) {
      return reply(403, { error: "허용되지 않은 요청입니다." });
    }

    const admin = ctx.supabaseAdmin;
    const { data: claimed, error } = await admin.rpc("claim_messages", { p_limit: 20 });
    if (error) {
      console.error("claim_messages failed", error.message);
      return reply(500, { error: "발송 대기열을 읽지 못했습니다." });
    }
    const counts = { sent: 0, skipped: 0, failed: 0, retry: 0 };
    for (const row of (claimed ?? []) as Array<{ id: string; attempts: number }>) {
      const { data: c } = await admin.rpc("message_context", { p_log_id: row.id });
      let result: [string, string | null, string | null, string | null, string | null];
      try {
        result = await processOne(admin, c as Ctx);
      } catch (e) {
        const msg = (e as Error).message;
        if (e instanceof Skip) result = ["skipped", null, msg, null, null];
        else if (e instanceof Permanent || row.attempts >= 3) result = ["failed", null, msg, null, null];
        else result = ["queued", null, msg, null, null];
      }
      const [status, provider, err, masked, hash] = result;
      await admin.rpc("complete_message", { p_log_id: row.id, p_status: status, p_provider_id: provider, p_error: err, p_to_masked: masked, p_to_hash: hash });
      counts[status === "queued" ? "retry" : (status as "sent" | "skipped" | "failed")] += 1;
    }
    return reply(200, { ok: true, ...counts });
  }),
};
