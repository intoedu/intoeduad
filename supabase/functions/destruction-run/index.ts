// 개인정보 파기 실행 — 관리자가 승인했고 예정일이 된 요청만 처리한다(같은 요청을 다시 호출해도 안전)
// - 호출: 매일 예약 작업(pg_cron + pg_net, 헤더 x-runner-token) 또는 관리자 화면의 [지금 실행](로그인 + 관리자 확인)
// - 순서: 승인 대기 생성 → 요청마다 여권 파일을 저장소에서 실제 삭제(자동 파기 접근 기록) → DB 개인정보 파기 → 결과 기록
// 미승인 기한 초과 관리자 알림은 매일 예약 작업(enqueue_daily_staff_alerts)이 발송 대기열에 넣는다
import { withSupabase } from "@supabase/server";

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

function sameToken(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  fetch: withSupabase({ auth: ["user", "publishable"] }, async (req, ctx) => {
    if (req.method !== "POST") return reply(405, { error: "허용되지 않은 요청입니다." });

    if (ctx.authMode === "user") {
      const { data: isAdmin } = await ctx.supabase.rpc("is_admin");
      if (!isAdmin) return reply(403, { error: "관리자만 실행할 수 있습니다." });
    } else {
      const expected = Deno.env.get("DESTRUCTION_RUNNER_TOKEN") ?? "";
      if (!sameToken(req.headers.get("x-runner-token") ?? "", expected)) return reply(403, { error: "허용되지 않은 요청입니다." });
    }

    const admin = ctx.supabaseAdmin;
    const { data: queued } = await admin.rpc("queue_destruction_requests");
    const { data: due, error: dueErr } = await admin.rpc("destruction_due_requests");
    if (dueErr) {
      console.error("destruction_due_requests failed", dueErr.message);
      return reply(500, { error: "파기 대상을 불러오지 못했습니다." });
    }

    let executed = 0;
    let failed = 0;
    for (const d of (due ?? []) as Array<{ id: string; registration_id: string | null }>) {
      try {
        if (d.registration_id) {
          const { data: files } = await admin
            .from("passport_files")
            .select("id, storage_path")
            .eq("registration_id", d.registration_id)
            .is("deleted_at", null);
          for (const f of files ?? []) {
            const { error: rmErr } = await admin.storage.from("passports").remove([f.storage_path]);
            if (rmErr) throw new Error(`여권 파일 삭제 실패: ${rmErr.message}`);
            const { error: markErr } = await admin.rpc("mark_passport_deleted", {
              p_file_id: f.id,
              p_actor: null,
              p_reason: "destruction",
              p_ip: null,
              p_user_agent: "destruction-run",
            });
            if (markErr) throw new Error(`여권 파일 기록 실패: ${markErr.message}`);
          }
        }
        const { error: exErr } = await admin.rpc("execute_destruction", { p_request_id: d.id });
        if (exErr) throw new Error(exErr.message);
        executed += 1;
      } catch (e) {
        failed += 1;
        const message = (e as Error).message;
        console.error("destruction failed", d.id, message);
        await admin.rpc("mark_destruction_failed", { p_request_id: d.id, p_error: message });
      }
    }
    return reply(200, { ok: true, queued: queued ?? 0, executed, failed });
  }),
};
