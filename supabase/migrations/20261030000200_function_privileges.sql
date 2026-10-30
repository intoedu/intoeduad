-- 함수 실행 권한 정리 (Supabase 보안 점검 결과 반영)
-- 원칙: 기본은 아무도 실행 못 하게 회수하고, 로그인 직원에게 필요한 함수만 명시적으로 허용한다.
-- 트리거 함수는 호출자 권한과 무관하게 실행되므로 실행 권한이 필요 없다.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.kst_today(),
  public.current_staff_role(),
  public.is_admin(),
  public.is_staff_or_admin(),
  public.is_active_staff(),
  public.can_view_passport(),
  public.viewer_has_program(uuid),
  public.viewer_has_registration(uuid),
  public.viewer_list_registrations(uuid),
  public.admin_create_staff_profile(uuid, text, text, text, text, boolean),
  public.agreement_effective_end(date, boolean, date, date),
  public.partner_referral_counts()
to authenticated;
