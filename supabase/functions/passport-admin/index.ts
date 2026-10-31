// 직원 여권 사진 열람·다운로드·삭제
// - 열람: 여권 열람 권한(can_view_passport) 직원만 / 다운로드: 관리자만 / 삭제: 여권 열람 권한 직원
// - 모든 동작은 passport_access_logs에 남는다(열람자·IP·브라우저). 복호화한 원본은 응답으로만 보내고 저장하지 않는다.
import { withSupabase } from "@supabase/server";
import { clientIp, decryptFile, toBase64 } from "./passport-crypto.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELETE_REASONS = new Set(["manual", "consent_withdrawn", "canceled"]);

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return reply(405, { error: "허용되지 않은 요청입니다." });
    const actor = ctx.userClaims?.id;
    if (!actor) return reply(401, { error: "다시 로그인해 주세요." });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return reply(400, { error: "요청 형식이 올바르지 않습니다." });
    }
    const action = String(body.action ?? "");
    const fileId = String(body.file_id ?? "");
    if (!UUID_RE.test(fileId)) return reply(400, { error: "파일을 찾을 수 없습니다." });

    // 권한은 RLS와 같은 DB 함수로 확인(비활성 직원·현지 팀 차단)
    const [{ data: canView }, { data: isAdmin }] = await Promise.all([
      ctx.supabase.rpc("can_view_passport"),
      ctx.supabase.rpc("is_admin"),
    ]);
    if (!canView) return reply(403, { error: "여권 열람 권한이 없습니다." });
    if (action === "download" && !isAdmin) return reply(403, { error: "다운로드는 관리자만 할 수 있습니다." });

    const ip = clientIp(req);
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);

    const { data: file } = await ctx.supabaseAdmin
      .from("passport_files")
      .select("id, registration_id, storage_path, iv, key_version, mime_type, deleted_at")
      .eq("id", fileId)
      .maybeSingle();
    if (!file || file.deleted_at) return reply(404, { error: "파일이 없거나 이미 삭제되었습니다." });

    if (action === "delete") {
      const reason = String(body.reason ?? "manual");
      if (!DELETE_REASONS.has(reason)) return reply(400, { error: "삭제 사유를 선택해 주세요." });
      const { data: path, error } = await ctx.supabaseAdmin.rpc("mark_passport_deleted", {
        p_file_id: fileId,
        p_actor: actor,
        p_reason: reason,
        p_ip: ip,
        p_user_agent: ua,
      });
      if (error) {
        console.error("mark_passport_deleted failed", error.message);
        return reply(500, { error: "삭제하지 못했습니다." });
      }
      if (path) {
        const { error: rmErr } = await ctx.supabaseAdmin.storage.from("passports").remove([path as string]);
        if (rmErr) {
          console.error("storage remove failed", rmErr.message);
          return reply(500, { error: "기록은 삭제 처리했지만 파일 삭제에 실패했습니다. 관리자에게 알려 주세요." });
        }
      }
      return reply(200, { ok: true });
    }

    if (action !== "view" && action !== "download") return reply(400, { error: "알 수 없는 요청입니다." });

    const { data: blob, error: dlErr } = await ctx.supabaseAdmin.storage.from("passports").download(file.storage_path);
    if (dlErr || !blob) {
      console.error("storage download failed", dlErr?.message);
      return reply(500, { error: "파일을 불러오지 못했습니다." });
    }
    let plain: Uint8Array;
    try {
      plain = await decryptFile(new Uint8Array(await blob.arrayBuffer()), file.iv, file.key_version, file.registration_id);
    } catch (e) {
      console.error("decrypt failed", (e as Error).message);
      return reply(500, { error: "파일을 복호화하지 못했습니다. 관리자에게 알려 주세요." });
    }

    await ctx.supabaseAdmin.rpc("log_passport_access", {
      p_file_id: fileId,
      p_actor: actor,
      p_action: action,
      p_ip: ip,
      p_user_agent: ua,
    });
    const { data: me } = await ctx.supabaseAdmin.from("staff_profiles").select("name").eq("id", actor).maybeSingle();

    return reply(200, {
      mime: file.mime_type,
      data: toBase64(plain),
      viewer: me?.name ?? "직원",
      at: new Date().toISOString(),
    });
  }),
};
