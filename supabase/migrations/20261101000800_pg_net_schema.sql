-- 보안 점검(Advisors 0014 extension_in_public) 조치: pg_net을 public이 아닌 extensions 스키마에 등록
-- pg_net은 스키마 이동(alter extension ... set schema)을 지원하지 않아 다시 만든다(Supabase 안내 방식).
-- 함수 본체(net.http_post 등)는 어느 경우든 net 스키마에 만들어지므로 호출 코드는 바뀌지 않는다.
-- 주의: 다시 만드는 순간 처리 중이던 HTTP 요청 기록(net 스키마의 대기열·응답)은 사라진다 → 발송·파기는 다음 예약 작업에서 다시 처리된다.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
