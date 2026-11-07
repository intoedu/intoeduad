// 고객(학부모) 회원 탈퇴 — 로그인한 본인만. 계정을 지우면 회원 정보(customer_profiles·customer_students)도 함께 삭제된다.
// 이미 접수된 상담·캠프 신청 기록은 각 신청서 동의의 보유 기간을 따르므로 지우지 않는다.
// 직원 계정은 이 기능으로 지울 수 없다(직원 관리 화면에서 비활성화).
import { withSupabase } from "@supabase/server";

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return reply(405, { error: "허용되지 않은 요청입니다." });
    const uid = ctx.userClaims?.id;
    if (!uid) return reply(401, { error: "로그인이 필요합니다." });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return reply(400, { error: "요청 형식이 올바르지 않습니다." });
    }
    if (body.action !== "delete") return reply(400, { error: "요청 형식이 올바르지 않습니다." });

    const { data: staff, error: staffErr } = await ctx.supabaseAdmin.from("staff_profiles").select("id").eq("id", uid).maybeSingle();
    if (staffErr) return reply(500, { error: "확인하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    if (staff) return reply(403, { error: "직원 계정은 여기서 탈퇴할 수 없습니다." });

    const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) {
      console.error("customer delete failed", error.message);
      return reply(500, { error: "탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return reply(200, { ok: true });
  }),
};
