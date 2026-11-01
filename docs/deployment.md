# 운영 반영·배포 안내

> 2026-11-01 기준 운영 Supabase 프로젝트 `intoedu-crm`(ref `ezroctoaeqqmjgnzwfpb`, 조직 "intoedu AD") 상태
> - **완료**: 1장 DB 마이그레이션 전부(+ `pg_net_schema`), 2장 Edge Function 6개 배포, 4장 Vault 4개(실행 토큰 2개는 DB 안에서 무작위 생성)
> - **남음(사람이 입력)**: 3장 Edge Function 시크릿, 5~8장
> - 확인한 것: 함수 6개 기동·입력 검증 응답, 예약 작업 → Vault → pg_net → `destruction-run` 호출 도달(시크릿 입력 전이라 403 — 예상한 결과)

## 1. DB 마이그레이션 (순서대로, 하나씩)

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `20261031000500_registrations_m7.sql` | 등록 신청서·납부 일정·동의 기록·대기 접수 |
| 2 | `20261101000100_passport_m8.sql` | 여권 비공개 버킷·암호화 파일 기록·접근 기록 |
| 3 | `20261101000200_registrations_admin_m9.sql` | 등록 상태 자동 갱신(pg_cron)·납부·환불 |
| 4 | `20261101000300_commissions_m10.sql` | 커미션·공휴일·특별 합의 금액 |
| 5 | `20261101000400_destruction_m11.sql` | 개인정보 파기(pg_net·예약 작업) |
| 6 | `20261101000500_calendar_m12.sql` | 통합 캘린더·D-Day·대시보드 |
| 7 | `20261101000600_messages_m13.sql` | 알림 발송 대기열·예약 작업 |
| 8 | `20261101000700_partner_stats_m14.sql` | 학원별 통계 |
| 9 | `20261101000800_pg_net_schema.sql` | 보안 점검 조치: pg_net을 extensions 스키마로(다시 설치) |

- `pg_cron`, `pg_net` 확장을 사용합니다(마이그레이션이 켭니다).
- 반영 후 보안 점검(Advisors)을 다시 확인합니다.

## 2. Edge Function 배포

| 함수 | 비고 |
|---|---|
| `public-lead-submit` | 다시 배포(알림 발송 호출 추가) |
| `public-register` | 신규 |
| `passport-upload` · `passport-admin` | 신규(같은 `passport-crypto.ts` 포함) |
| `destruction-run` | 신규 |
| `message-sender` | 신규(`build.ts` 포함) |

모두 `verify_jwt = false`(함수 안에서 인증 확인). 배포용 import는 `deno.deploy.json`(`npm:@supabase/server`)을 `deno.json` 이름으로 올립니다.
이미 있는 함수를 다시 배포할 때는 import map 경로를 `deno.json`으로 꼭 지정합니다(지정하지 않으면 이전 배포의 임시 경로를 찾다가 실패).

## 3. Edge Function 시크릿

입력 위치: Supabase 대시보드 → Edge Functions → Secrets (`https://supabase.com/dashboard/project/ezroctoaeqqmjgnzwfpb/functions/secrets`). 이름·값을 넣고 저장하면 다시 배포하지 않아도 바로 적용됩니다(Supabase 공식 문서).

| 이름 | 값 | 주의 |
|---|---|---|
| `PASSPORT_KEY_V1` | `openssl rand -base64 32` 결과(32바이트) | **잃어버리면 모든 여권 사진을 복호화할 수 없습니다.** 안전한 곳(비밀번호 관리자 등)에 따로 보관 |
| `PHONE_HASH_PEPPER` | 임의의 긴 문자열 | 중복 제출 제한·발송 기록 번호 해시용(없으면 service role 키 사용) |
| `DESTRUCTION_RUNNER_TOKEN` | Vault의 `destruction_runner_token` 값 그대로 | 운영 Vault에 이미 만들어 둠 — 아래 SQL로 꺼내 복사 |
| `MESSAGE_RUNNER_TOKEN` | Vault의 `message_runner_token` 값 그대로 | 위와 같음 |
| `SOLAPI_API_KEY` · `SOLAPI_API_SECRET` | 솔라피 콘솔 발급 | 알림톡·문자 |
| `RESEND_API_KEY` | Resend 발급 | 직원 이메일 알림(도메인 인증 필요) |

`SOLAPI_DRY_RUN`은 운영에 넣지 않습니다(로컬 테스트 전용).

컴퓨터에 openssl이 없으면 Supabase SQL Editor에서 값을 만들 수 있습니다(실행 결과는 저장되지 않음).

```sql
select encode(extensions.gen_random_bytes(32), 'base64') as passport_key_v1;   -- PASSPORT_KEY_V1
select encode(extensions.gen_random_bytes(32), 'hex')    as phone_hash_pepper; -- PHONE_HASH_PEPPER
-- 실행 토큰(이미 Vault에 있음) 꺼내기
select name, decrypted_secret from vault.decrypted_secrets where name like '%runner_token';
```

입력 후 확인: SQL Editor에서 `select public.invoke_destruction_runner();` 실행 → 몇 초 뒤
`select status_code, content from net._http_response order by id desc limit 1;` 결과가 **200**이면 연결 완료(403이면 토큰 불일치).

## 4. Vault 시크릿 (예약 작업이 함수를 부를 때 사용 — Supabase 공식 "Scheduling Edge Functions" 방식)

운영에는 2026-11-01에 만들어 두었습니다. 새 프로젝트에 다시 만들 때만 아래를 씁니다.

```sql
select vault.create_secret('https://ezroctoaeqqmjgnzwfpb.supabase.co', 'project_url');
select vault.create_secret('<publishable key>', 'publishable_key');
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'destruction_runner_token');
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'message_runner_token');
```

없으면 예약 작업은 아무것도 호출하지 않습니다(등록 상태 갱신·파기 대기 생성은 DB 안에서 그대로 동작, 파기 실행·알림 발송만 멈춤).

## 5. 화면 배포 (Cloudflare Pages)

- 순서(Cloudflare 공식 문서): Workers & Pages → Create application → Pages → Connect to Git → GitHub 저장소 `intoedu/intoeduad` 선택 → Begin setup
- 빌드 명령 `npm run build`, 출력 폴더 `dist` (Pages 기본 Node 22 — 로컬 빌드와 같은 버전대라 별도 지정 불필요)
- 환경 변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PUBLIC_SITE_URL`(Pages 주소 또는 연결한 도메인)
- `404.html`이 없으면 Pages가 SPA로 보고 모든 경로에 `/`를 응답합니다(공식 문서 확인) → 별도 설정 불필요
- `public/_headers`로 보안 헤더(X-Frame-Options, nosniff, Referrer-Policy, CSP)가 적용됩니다. CSP는 `https://*.supabase.co`만 허용하므로 Supabase 주소를 바꾸면 함께 고칩니다.
- 배포 전 확인: Cloudflare Self-Serve Subscription Agreement 2.2.1(무료 플랜 상업적 사용) 원문 — PLAN.md 1장

## 6. Supabase Auth 설정 (대시보드)

- Site URL·Redirect URLs를 Pages 주소로(직원 초대·비밀번호 재설정 링크)
- "Allow new users to sign up" 끄기(직원은 초대로만)
- 유출된 비밀번호 차단(Leaked password protection) — 사용 가능한 요금제인지 확인
- 이메일: 운영 전 사용자 지정 SMTP(예: Resend) 연결

## 7. 관리자 화면에서 입력할 것

1. 설정 → 기본 설정: 카카오톡 채널 주소, **학부모용 사이트 주소**, 입금 계좌
2. 설정 → 알림: 솔라피 발신번호·pfId·템플릿 ID 4개(카카오 승인 후), 직원 알림 받을 사람·번호
3. 커미션 정산 → 요율·특별 합의·학원 간 소개 요율 (2027 공휴일은 2026-11-01 우주항공청 「2027년 월력요항」 보도자료 원문 공휴일 표로 전부 확인 완료 — 어린이날 5/5(수), 부처님 오신 날 5/13(목))
4. 각 캠프: 1인당 커미션, 제3자 제공 대상(발권처·현지 학교·숙소), 환불 규정

## 8. 운영 전 사람이 확인해야 할 것

- 동의서·환불 규정·개인정보 파기 안내 문구 법률 검토(설정 → 동의·안내 문구에서 새 버전으로 수정)
- 알림톡 템플릿 4종 카카오 심사(`docs/alimtalk-templates.md`)
- 원장님 안내 문구(MOU-03·04·05·13·15)를 운영 매뉴얼 원문에 맞게 다듬기
- 커미션 세무 처리(원천징수 3.3% 본사 부담 → 지급액 환산)
- 법정 보관 거래 기록 분리 보관 사용 여부(법률 검토)
- 아이폰 HEIC 사진 변환을 실제 아이폰으로 한 번 확인(로컬에 HEIC 샘플이 없어 자동 테스트하지 못함)
- 운영 전 Supabase 요금제(Pro 전환 또는 무료 + 자체 백업) 결정(PLAN.md 1장) — 무료 플랜의 일시 중지·백업 조건은 Supabase 공식 요금 안내로 확인
