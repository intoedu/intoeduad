// 학부모 여권 사진 제출 (비로그인, 링크 토큰으로 대상 확인)
// - action=info(JSON): 대상 학생·프로그램·고유식별정보 동의 문구
// - 업로드(multipart): token, consent, file → 형식 확인(매직 바이트) → AES-256-GCM 암호화 → 비공개 버킷 저장 → 기록
// - 원본(평문)은 어디에도 저장하지 않는다. 실패하면 올린 암호문도 지운다.
// 여권 업로드 직원 알림(개인정보 없이 "여권 업로드 1건")은 DB가 발송 대기열에 넣는다
import { withSupabase } from "@supabase/server";
import { clientIp, detectMime, encryptFile, MAX_BYTES } from "./passport-crypto.ts";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

type Target = {
  registration_id: string;
  student_name: string;
  program_name: string;
  passport_status: string;
  allowed: boolean;
  consent: { kind: string; version: number; title: string; body: string } | null;
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
    const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");

    let token = "";
    let form: FormData | null = null;
    if (isForm) {
      try {
        form = await req.formData();
      } catch {
        return reply(400, { error: "파일을 받지 못했습니다. 다시 시도해 주세요." });
      }
      token = String(form.get("token") ?? "");
    } else {
      try {
        token = String((await req.json()).token ?? "");
      } catch {
        return reply(400, { error: "요청 형식이 올바르지 않습니다." });
      }
    }
    if (!TOKEN_RE.test(token)) return reply(404, { error: "링크가 올바르지 않거나 만료되었습니다." });

    const { data: targetData, error: targetErr } = await ctx.supabaseAdmin.rpc("passport_upload_target", { p_token: token });
    if (targetErr) {
      console.error("passport_upload_target failed", targetErr.message);
      return reply(500, { error: "잠시 후 다시 시도해 주세요." });
    }
    const target = targetData as Target | null;
    if (!target) return reply(404, { error: "링크가 올바르지 않거나 만료되었습니다." });

    if (!form) {
      return reply(200, {
        student_name: target.student_name,
        program_name: target.program_name,
        passport_status: target.passport_status,
        allowed: target.allowed,
        consent: target.consent,
      });
    }

    if (!target.allowed) return reply(409, { error: "이 신청은 여권 사진을 받지 않거나 제출 기간이 지났습니다. 카카오톡으로 문의해 주세요." });
    if (form.get("consent") !== "true") return reply(400, { error: "고유식별정보 수집·이용에 동의해 주세요.", code: "CONSENT_REQUIRED" });

    // 같은 링크로 1시간에 10번까지
    const tokenHash = await sha256Hex(`passport:${token}`);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await ctx.supabaseAdmin
      .from("submission_throttle")
      .select("id", { count: "exact", head: true })
      .eq("kind", "passport")
      .eq("phone_hash", tokenHash)
      .gt("created_at", since);
    if ((count ?? 0) >= 10) return reply(429, { error: "잠시 후 다시 시도해 주세요." });
    await ctx.supabaseAdmin.from("submission_throttle").insert({ kind: "passport", phone_hash: tokenHash });

    const file = form.get("file");
    if (!(file instanceof File)) return reply(400, { error: "파일을 선택해 주세요." });
    if (file.size === 0 || file.size > MAX_BYTES) return reply(400, { error: "10MB 이하의 파일만 올릴 수 있습니다." });
    const plain = new Uint8Array(await file.arrayBuffer());
    const mime = detectMime(plain);
    if (!mime) return reply(400, { error: "JPG·PNG·HEIC·PDF 파일만 올릴 수 있습니다." });

    let encrypted;
    try {
      encrypted = await encryptFile(plain, target.registration_id);
    } catch (e) {
      console.error("encrypt failed", (e as Error).message);
      return reply(500, { error: "파일을 안전하게 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    plain.fill(0);

    const path = `reg/${target.registration_id}/${crypto.randomUUID()}.bin`;
    const bucket = ctx.supabaseAdmin.storage.from("passports");
    const { error: upErr } = await bucket.upload(path, encrypted.cipher, { contentType: "application/octet-stream", upsert: false });
    if (upErr) {
      console.error("storage upload failed", upErr.message);
      return reply(500, { error: "파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }

    const { data: rec, error: recErr } = await ctx.supabaseAdmin.rpc("record_passport_upload", {
      p_registration_id: target.registration_id,
      p_path: path,
      p_iv: encrypted.iv,
      p_key_version: encrypted.keyVersion,
      p_mime: mime,
      p_size: encrypted.cipher.length,
      p_ip: clientIp(req),
      p_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      p_consent: true,
    });
    if (recErr) {
      await bucket.remove([path]);
      console.error("record_passport_upload failed", recErr.message);
      return reply(recErr.hint === "NOT_ALLOWED" ? 409 : 500, { error: "여권 사진을 저장하지 못했습니다. 카카오톡으로 문의해 주세요." });
    }

    // 교체된 이전 파일은 실제로 지운다
    const replaced = ((rec as { replaced_paths?: string[] })?.replaced_paths ?? []).filter(Boolean);
    if (replaced.length) {
      const { error: rmErr } = await bucket.remove(replaced);
      if (rmErr) console.error("replaced file remove failed", rmErr.message);
    }

    kickMessageSender(req);
    return reply(200, { ok: true });
  }),
};
