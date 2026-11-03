# 최종 점검 (SPEC 8장 품질·보안 체크리스트)

> 2026-11-01, 로컬 Supabase 기준 자동 테스트로 확인. "근거"는 해당 테스트 파일입니다.
> 운영(Supabase `intoedu-crm`)에는 2026-11-01 M7~M14 DB·함수·Vault까지 반영했습니다. Edge Function 시크릿 입력 후 운영에서 같은 항목을 다시 확인합니다(`docs/deployment.md`).

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

## 운영(intoedu-crm)에서 확인한 것 (2026-11-01)

- Edge Function 시크릿 4개 입력 후: 예약 작업 → Vault → pg_net → `destruction-run`·`message-sender` 호출 200
- 시험 신청(`public-register`) → 여권 업로드(`passport-upload`) 200, 저장 파일 = 원본 + 16바이트(AES-GCM 인증 태그) → 암호화 확인, 버킷 비공개, 접근 기록(upload) 생성
- 알림 꺼진 상태: 납부 안내 알림톡 "보내지 않음(알림톡 사용 안 함)"으로 기록, 신청은 정상
- 파기: 승인된 요청 → `destruction-run` 실행 → 저장소 여권 파일 실제 삭제(0개), 학생·학부모 개인정보 null, 접근 기록은 보존(수정·삭제 차단 확인)
- 시험 프로그램(`zz-deploy-check`)·신청은 숨김 처리(접근 기록 보존 때문에 행 삭제 대신 deleted_at)
- (2026-11-02) 여권 열람·다운로드(`passport-admin`): 운영 키로 복호화한 결과가 원본과 바이트 단위로 같음, 로그인 없는 호출 401, 화면의 삭제 기능으로 파일 삭제 200. 점검용 관리자 계정(`zz-verify`, "시스템 점검(사용 안 함)")은 비밀번호를 무작위로 바꾸고 비활성화(비활성 후 데이터 0건 확인)
- (2026-11-02) 신규 가입을 열어 둔 상태 점검: 직원 등록 없이 가입만 한 사용자로 가장해 public 전체 표·저장소 조회 → 모두 0건, 관리자용 함수(직원 추가·링크 발급 등) 42501 거부
- (2026-11-02) Cloudflare 운영 주소의 HTML·JS 응답에 `_headers` 보안 헤더(CSP·X-Frame-Options 등) 적용 확인

## M15 캠프비 할인·작성 중 내용 유지 (2026-11-02)

- 할인 규칙(DB `supabase/tests/discounts.test.sql` 25개): 얼리버드는 마감일(당일 포함)까지 신청, 학원별 할인은 그 학원 소개 등록생만, 잔금에서 먼저·넘치면 예약금에서, 항공권 등 추가 항목은 그대로, 대기 승격은 승격일 기준, "납부 안내 변경"으로 잡히지 않음, 학원별 할인은 관리자·직원만 보고 관리(현지 팀·가입만 한 계정·비로그인 불가)
- 화면(`tests/e2e/m15.cjs` 33개): 캠프 만들기 작성 중 새로고침해도 유지·"지우고 새로 쓰기", 링크 영어 추천(중복 단어 한 번), 얼리버드 입력·검증, 학원별 할인 등록·미리보기, 캠프 목록 배지, 학원 링크 신청서·완료·신청 내용 확인·직원 상세에 할인 내역
- 비밀번호 4자리(`tests/e2e/pin-password.cjs` 8개)

## M16 관리자·직원 직접 입력 (2026-11-03)

- DB(`supabase/tests/staff_entry.test.sql` 22개): 관리자·직원만(현지 팀·가입만 한 계정·비로그인 거부), 동의 확인 필수, 학부모 신청서와 같은 검증·납부 일정·할인, 모집 전 캠프도 직원 입력 가능(학부모 신청서는 여전히 모집 중만), 입력 직원·방법·담당자 동의 확인 기록, 접수 안내 알림 선택, 감사 기록에 개인정보 값 없음
- 화면(`tests/e2e/m16.cjs` 23개): 상담 직접 등록 → 고객 카드, 등록생 직접 추가(캠프별 필수 항목·민감정보 동의 안내·학원 할인 반영·학부모 확인 링크), 현지 팀은 버튼·화면 없음, 375px

## 추가로 확인한 것

- 배포 형태(빌드 결과 + `_headers` 보안 헤더·CSP)에서 신청서·여권 제출·열람·관리자 화면 동작, SPA 경로 응답: `tests/e2e/m14.cjs`
- 학부모 화면·알림에 커미션 정보 없음: `m10.cjs`, `registrations.test.sql`, `src/domain/messages.test.ts`
- 알림톡 문안이 카카오 심사 규칙(변수 예시·버튼명 변수 금지·변수 40개 이하·광고 문구 없음)을 지킴: `src/domain/messages.test.ts`
- 개인정보 파기 후 남는 값(금액·상태)과 지워지는 값(이름·연락처·건강·메모·납부 메모·링크·번호 해시): `destruction.test.sql`

## 자동으로 확인하지 못한 것 (사람이 확인)

- 실제 솔라피 발송(키·템플릿 승인 필요) — 로컬은 드라이런으로 요청 내용·서명 형식만 확인
- 아이폰 HEIC 사진 변환(로컬에 HEIC 샘플 없음) — 변환 실패 시 원본 그대로 저장되는 것은 확인
- 문구의 법률 검토(동의서·환불 규정·파기 안내)
