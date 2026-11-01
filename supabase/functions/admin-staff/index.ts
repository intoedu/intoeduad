// 직원 초대·계정 만들기·활성/비활성 처리 (관리자 전용)
// - 초대: Supabase Auth 초대 메일 발송 + 직원 프로필 생성 (재발송 포함)
// - 아이디로 만들기: 아이디 + 임시 비밀번호로 바로 계정 생성(메일 없음), 첫 로그인 때 비밀번호 변경 강제
// - 임시 비밀번호 재발급: 비밀번호를 잊은 직원(특히 아이디 계정)용, 다음 로그인 때 변경 강제
// - 활성/비활성: 프로필 active 변경(관리자 권한으로 → 감사 기록) + 로그인 차단(ban) 동기화
import { withSupabase } from "@supabase/server";

const ROLES = ["admin", "staff", "viewer"] as const;
type Role = (typeof ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 아이디 계정의 내부 로그인 주소(.invalid = 존재할 수 없는 도메인, 메일 발송 없음) — src/domain/loginId.ts 와 같은 규칙
const LOGIN_ID_DOMAIN = "staff.intoedu.invalid";
const LOGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
// 헷갈리는 글자(0/O, 1/l/I) 없이 12자 — 전화로 불러 줘도 틀리지 않게
const PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function tempPassword(): string {
  const limit = 256 - (256 % PASSWORD_CHARS.length); // 치우침 없는 추출
  // 비밀번호 규칙(영문·숫자 등)을 항상 통과하도록 소문자·대문자·숫자를 모두 포함할 때까지 다시 뽑는다
  for (;;) {
    const out: string[] = [];
    while (out.length < 12) {
      for (const b of crypto.getRandomValues(new Uint8Array(32))) {
        if (b < limit && out.length < 12) out.push(PASSWORD_CHARS[b % PASSWORD_CHARS.length]);
      }
    }
    const pw = out.join("");
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) return pw;
  }
}
// 약 100년 — 비활성 직원의 로그인 차단
const BAN_FOREVER = "876000h";

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return error(405, "허용되지 않은 요청입니다.");

    // 호출자가 활성 관리자인지 DB 함수로 확인 (RLS와 같은 기준)
    const { data: isAdmin, error: adminErr } = await ctx.supabase.rpc("is_admin");
    if (adminErr) return error(500, "권한 확인에 실패했습니다.");
    if (!isAdmin) return error(403, "관리자만 사용할 수 있습니다.");

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return error(400, "요청 형식이 올바르지 않습니다.");
    }

    switch (body.action) {
      case "invite":
        return await invite(body, ctx);
      case "resend_invite":
        return await resendInvite(body, ctx);
      case "create_account":
        return await createAccount(body, ctx);
      case "reset_password":
        return await resetPassword(body, ctx);
      case "set_active":
        return await setActive(body, ctx);
      default:
        return error(400, "알 수 없는 요청입니다.");
    }
  }),
};

type Ctx = Parameters<Parameters<typeof withSupabase>[1]>[1];

async function invite(body: Record<string, unknown>, ctx: Ctx) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const role = String(body.role ?? "") as Role;
  const team = String(body.team ?? "").trim();
  const canViewPassport = role !== "viewer" && body.can_view_passport === true;
  const redirectTo = String(body.redirect_to ?? "");

  if (!EMAIL_RE.test(email)) return error(400, "이메일 형식이 올바르지 않습니다.");
  if (!name) return error(400, "이름을 입력해 주세요.");
  if (!ROLES.includes(role)) return error(400, "역할이 올바르지 않습니다.");

  // 이미 직원으로 등록된 이메일이면 중단 (초대 API는 미가입 계정에 재발송하므로 미리 확인)
  const { data: existing } = await ctx.supabase
    .from("staff_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) return error(409, "이미 등록된 이메일입니다. 초대 메일 재발송을 이용해 주세요.");

  const startedAt = Date.now();
  const { data: invited, error: inviteErr } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: redirectTo || undefined },
  );
  if (inviteErr || !invited?.user) {
    const msg = inviteErr?.message ?? "";
    if (/already been registered|already exists/i.test(msg)) {
      return error(409, "이미 등록된 이메일입니다.");
    }
    console.error("invite failed", msg);
    return error(500, "초대 메일 발송에 실패했습니다.");
  }

  // 관리자 본인 권한으로 프로필 생성 → 감사 기록에 초대한 관리자가 남음
  const { error: profileErr } = await ctx.supabase.rpc("admin_create_staff_profile", {
    p_id: invited.user.id,
    p_name: name,
    p_email: email,
    p_role: role,
    p_team: team,
    p_can_view_passport: canViewPassport,
  });
  if (profileErr) {
    // 이번 요청으로 새로 만든 계정만 되돌린다 (프로필 없는 계정은 로그인해도 아무것도 못 함)
    const createdAt = Date.parse(invited.user.created_at);
    if (createdAt >= startedAt - 5_000) {
      await ctx.supabaseAdmin.auth.admin.deleteUser(invited.user.id);
    }
    console.error("profile create failed", profileErr.message);
    return error(500, "직원 정보 저장에 실패했습니다.");
  }

  return Response.json({ id: invited.user.id });
}

// 아이디 + 임시 비밀번호로 계정 만들기 (메일 없이 바로 사용, 첫 로그인 때 비밀번호 변경)
async function createAccount(body: Record<string, unknown>, ctx: Ctx) {
  const loginId = String(body.login_id ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const role = String(body.role ?? "") as Role;
  const team = String(body.team ?? "").trim();
  const canViewPassport = role !== "viewer" && body.can_view_passport === true;

  if (!LOGIN_ID_RE.test(loginId)) {
    return error(400, "아이디는 영문 소문자·숫자로 시작하는 3~30자(. _ - 사용 가능)로 정해 주세요.");
  }
  if (!name) return error(400, "이름을 입력해 주세요.");
  if (!ROLES.includes(role)) return error(400, "역할이 올바르지 않습니다.");

  const email = `${loginId}@${LOGIN_ID_DOMAIN}`;
  const { data: existing } = await ctx.supabase.from("staff_profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return error(409, "이미 사용 중인 아이디입니다.");

  const password = tempPassword();
  const { data: created, error: createErr } = await ctx.supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? "";
    if (/already been registered|already exists/i.test(msg)) return error(409, "이미 사용 중인 아이디입니다.");
    console.error("create user failed", msg);
    return error(500, "계정을 만들지 못했습니다.");
  }

  // 관리자 본인 권한으로 프로필 생성·변경 → 감사 기록에 만든 관리자가 남음
  const { error: profileErr } = await ctx.supabase.rpc("admin_create_staff_profile", {
    p_id: created.user.id,
    p_name: name,
    p_email: email,
    p_role: role,
    p_team: team,
    p_can_view_passport: canViewPassport,
  });
  const { error: flagErr } = profileErr
    ? { error: null }
    : await ctx.supabase.from("staff_profiles").update({ must_change_password: true }).eq("id", created.user.id);
  if (profileErr || flagErr) {
    await ctx.supabaseAdmin.auth.admin.deleteUser(created.user.id);
    console.error("profile create failed", (profileErr ?? flagErr)?.message);
    return error(500, "직원 정보 저장에 실패했습니다.");
  }

  // 임시 비밀번호는 이 응답에서만 한 번 돌려준다(어디에도 저장하지 않음)
  return Response.json({ id: created.user.id, login_id: loginId, temp_password: password });
}

// 임시 비밀번호 재발급 (다음 로그인 때 변경 강제)
async function resetPassword(body: Record<string, unknown>, ctx: Ctx) {
  const id = String(body.id ?? "");
  if (!id) return error(400, "직원을 선택해 주세요.");
  if (id === ctx.userClaims?.id) return error(400, "본인 비밀번호는 비밀번호 변경 화면에서 바꿔 주세요.");

  const { data: profile } = await ctx.supabase.from("staff_profiles").select("id, active").eq("id", id).maybeSingle();
  if (!profile) return error(404, "직원을 찾을 수 없습니다.");
  if (!profile.active) return error(400, "비활성 직원은 먼저 다시 활성화해 주세요.");

  const password = tempPassword();
  const { error: pwErr } = await ctx.supabaseAdmin.auth.admin.updateUserById(id, { password });
  if (pwErr) {
    console.error("password reset failed", pwErr.message);
    return error(500, "임시 비밀번호를 만들지 못했습니다.");
  }
  const { error: flagErr } = await ctx.supabase.from("staff_profiles").update({ must_change_password: true }).eq("id", id);
  if (flagErr) console.error("must_change flag failed", flagErr.message);
  return Response.json({ id, temp_password: password });
}

// 아직 비밀번호를 설정하지 않은 직원에게 초대 메일 재발송
async function resendInvite(body: Record<string, unknown>, ctx: Ctx) {
  const id = String(body.id ?? "");
  const redirectTo = String(body.redirect_to ?? "");

  const { data: profile } = await ctx.supabase
    .from("staff_profiles")
    .select("email, active")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return error(404, "직원을 찾을 수 없습니다.");
  if (!profile.active) return error(400, "비활성 직원에게는 초대 메일을 보낼 수 없습니다.");
  if (profile.email.endsWith(`@${LOGIN_ID_DOMAIN}`)) return error(400, "아이디로 만든 계정은 메일을 받을 수 없습니다. 임시 비밀번호 재발급을 이용해 주세요.");

  const { data: user } = await ctx.supabaseAdmin.auth.admin.getUserById(id);
  if (user?.user?.last_sign_in_at) {
    return error(400, "이미 로그인한 적이 있는 직원입니다. 비밀번호 찾기를 안내해 주세요.");
  }

  const { error: inviteErr } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(
    profile.email,
    { redirectTo: redirectTo || undefined },
  );
  if (inviteErr) {
    console.error("resend invite failed", inviteErr.message);
    return error(500, "초대 메일 재발송에 실패했습니다.");
  }
  return Response.json({ id });
}

async function setActive(body: Record<string, unknown>, ctx: Ctx) {
  const id = String(body.id ?? "");
  const active = body.active === true;
  if (!id) return error(400, "직원을 선택해 주세요.");
  if (id === ctx.userClaims?.id && !active) {
    return error(400, "본인 계정은 비활성화할 수 없습니다.");
  }

  const { data: updated, error: updateErr } = await ctx.supabase
    .from("staff_profiles")
    .update({ active })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (updateErr) {
    return error(400, updateErr.message.includes("최소 1명") ? updateErr.message : "변경에 실패했습니다.");
  }
  if (!updated) return error(404, "직원을 찾을 수 없습니다.");

  const { error: banErr } = await ctx.supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (banErr) {
    // DB 권한은 이미 차단됨(active=false). 로그인 차단만 실패한 경우 알림
    console.error("ban sync failed", banErr.message);
    return error(500, "권한은 변경되었으나 로그인 차단 처리에 실패했습니다. 다시 시도해 주세요.");
  }

  return Response.json({ id, active });
}
