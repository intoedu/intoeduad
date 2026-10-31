# 최종 점검 (SPEC 8장 품질·보안 체크리스트)

> 2026-11-01, 로컬 Supabase 기준 자동 테스트로 확인. "근거"는 해당 테스트 파일입니다.
> 운영(Supabase `intoedu-crm`)에는 M6까지만 반영된 상태이며, 운영 반영 후 같은 항목을 다시 확인합니다(`docs/deployment.md`).

| 항목 | 결과 | 근거 |
|---|---|---|
| 비로그인 사용자가 다른 사람의 신청 정보를 조회할 수 없음 | 통과 | `supabase/tests/rls.test.sql`, `registrations.test.sql`(비로그인: 등록 테이블·저장·조회 함수 직접 호출 불가), `passport.test.sql`, `commissions.test.sql` |
| 상담 슬롯 동시 예약 시 중복 예약 불가 | 통과 | `tests/concurrency/slot-booking.mjs`(20건 동시 → 정원만큼만 성공) |
| (추가) 캠프 정원 동시 신청 시 초과 불가 | 통과 | `tests/concurrency/registration-capacity.mjs` |
| 납부 기한 규칙 3가지 날짜 계산(KST 경계) | 통과 | `src/domain/paymentRules.test.ts`, `registrations.test.sql`(지난 고정 기한 → 신청일) |
| 환불 공제율 계산(취소일·출국일 기준) | 통과 | `src/domain/refund.test.ts`(구간 경계값 11개), `registrations_admin.test.sql` |
| 여권 파일이 저장소에 암호화된 상태로만 존재 | 통과 | `tests/e2e/m8.cjs`(저장 파일 머리가 JPEG 아님·원본 글자 없음), `passport.test.sql`(버킷 비공개·암호문 형식만) |
| 여권 열람 권한 없는 직원·현지 팀·비로그인 접근 불가 | 통과 | `passport.test.sql`, `tests/e2e/m8.cjs` |
| 여권 업로드·열람·다운로드·삭제가 모두 접속기록에 남음 | 통과 | `tests/e2e/m8.cjs`(upload,view,download,delete + IP), `m11.cjs`(자동 파기) |
| 보유 기간 경과 여권 파일 자동 삭제 | 통과 | `tests/e2e/m11.cjs`(PLAN 기능 B: 종료 + 5일, 관리자 승인 후 저장소에서 실제 삭제) |
| 공개 폼 375px 가로 스크롤 없음, 휴대폰 카메라 업로드 | 통과 | `m3.cjs`·`m7.cjs`·`m8.cjs`·`m14.cjs`(빌드 결과), `capture="environment"` 확인 |
| API 키·암호화 키가 클라이언트 번들에 없음 | 통과 | 빌드 결과(`dist/`)에서 `sb_secret`·`service_role`·`PASSPORT_KEY`·`SOLAPI`·`RESEND` 문자열 검사(라이브러리 내부 접두어 검사 코드 외 없음) |
| 동의 시각·동의 문구 버전·환불 규정 버전 저장 | 통과 | `registrations.test.sql`, `m7.cjs`(동의 문구 v2 저장) |
| 상태·금액 변경 이력이 activity_logs에 남음(개인정보 값 제외) | 통과 | `registrations_admin.test.sql`(금액 전·후), `registrations.test.sql`(개인정보 값 없음) |
| 솔라피 비활성 상태에서도 전체 기능 정상 | 통과 | `tests/e2e/m13.cjs`(꺼짐 → "보내지 않음" 기록, 신청은 정상), M7~M12 E2E는 모두 알림 꺼진 상태로 실행 |

## 추가로 확인한 것

- 배포 형태(빌드 결과 + `_headers` 보안 헤더·CSP)에서 신청서·여권 제출·열람·관리자 화면 동작, SPA 경로 응답: `tests/e2e/m14.cjs`
- 학부모 화면·알림에 커미션 정보 없음: `m10.cjs`, `registrations.test.sql`, `src/domain/messages.test.ts`
- 알림톡 문안이 카카오 심사 규칙(변수 예시·버튼명 변수 금지·변수 40개 이하·광고 문구 없음)을 지킴: `src/domain/messages.test.ts`
- 개인정보 파기 후 남는 값(금액·상태)과 지워지는 값(이름·연락처·건강·메모·납부 메모·링크·번호 해시): `destruction.test.sql`

## 자동으로 확인하지 못한 것 (사람이 확인)

- 실제 솔라피 발송(키·템플릿 승인 필요) — 로컬은 드라이런으로 요청 내용·서명 형식만 확인
- 아이폰 HEIC 사진 변환(로컬에 HEIC 샘플 없음) — 변환 실패 시 원본 그대로 저장되는 것은 확인
- 실제 Cloudflare Pages에서의 헤더 적용(로컬은 같은 규칙을 흉내 낸 서버로 확인)
- 문구의 법률 검토(동의서·환불 규정·파기 안내)
