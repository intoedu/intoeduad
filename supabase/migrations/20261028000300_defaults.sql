-- 기본 설정값 · 동의 문구 · 환불 규정 기본안 (운영 전 법률 검토 후 확정)
-- 문구 안의 {{키}}는 신청 시점에 설정·프로그램 정보로 치환되고, 치환된 문구가 consent_records에 저장된다.

insert into public.settings (key, value) values
  ('kakao_channel_url', '""'::jsonb),
  ('retention', '{"lead_days": 365, "lead_label": "1년", "destroy_after_program_end_days": 5}'::jsonb),
  ('bank_account', '{"bank": "", "number": "", "holder": ""}'::jsonb),
  ('registration_status_rules', '{"balance_pending_days_before_due": 14}'::jsonb),
  ('solapi', '{
    "enabled": false,
    "sender_number": "",
    "pf_id": "",
    "sms_fallback": true,
    "templates": {
      "lead_received": "",
      "registration_payment_notice": "",
      "registration_waitlisted": "",
      "payment_notice_correction": ""
    }
  }'::jsonb),
  ('staff_notifications', '{"enabled": false, "events": ["new_lead", "new_registration", "passport_uploaded", "destruction_overdue"]}'::jsonb),
  ('spam_guard', '{"same_phone_window_minutes": 10}'::jsonb)
on conflict (key) do nothing;

insert into public.consent_documents (kind, version, title, body) values
(
  'lead_privacy', 1, '[필수] 개인정보 수집·이용 동의',
$doc$인투유학은 상담 진행을 위해 아래와 같이 개인정보를 수집·이용합니다.

1. 수집 항목
   학부모: 이름, 휴대폰 번호, 자녀와의 관계
   자녀: 이름, 학년, 관심 분야 및 프로그램
   기타: 상담 희망 일시, 상담 희망 내용, 알게 된 경로(학원명)
2. 수집·이용 목적
   유학·캠프 상담 진행, 상담 일정 안내, 문의 응대
3. 보유·이용 기간
   상담 신청일로부터 {{lead_retention}}간 보관 후 파기
   (캠프·유학 등록 시에는 등록 정보로 이관되어 해당 보유 기간을 따릅니다)
4. 동의를 거부할 권리 및 불이익
   개인정보 수집·이용에 동의하지 않으실 수 있습니다.
   다만 동의하지 않으시면 상담 신청이 제한됩니다.$doc$
),
(
  'lead_guardian', 1, '[필수] 법정대리인 동의',
$doc$자녀가 만 14세 미만인 경우, 본인은 자녀의 법정대리인으로서 자녀의 개인정보 수집·이용에 동의합니다.$doc$
),
(
  'reg_privacy', 1, '[필수] 1. 개인정보 수집·이용 동의',
$doc$1. 수집 항목
   학생: 한글·영문 이름, 생년월일, 성별, 학교·학년, 영어 수준
   학부모: 이름, 연락처, 이메일, 주소
   비상 연락처: 이름, 관계, 연락처
2. 수집·이용 목적
   {{program_name}} 참가 등록 및 운영, 비용 안내 및 납부 확인, 비상시 연락
3. 보유·이용 기간
   프로그램 종료일로부터 {{destroy_after_days}}일이 지난 후 파기
   (관계 법령에 따라 보관이 필요한 거래 기록은 해당 법령이 정한 기간 동안 분리하여 보관)
4. 동의를 거부할 권리 및 불이익
   동의하지 않으실 수 있으나, 동의하지 않으시면 프로그램 등록이 제한됩니다.$doc$
),
(
  'reg_passport', 1, '[필수] 2. 고유식별정보(여권) 수집·이용 동의',
$doc$1. 수집 항목
   학생 여권 사진면 이미지(여권번호, 영문 성명, 생년월일, 국적, 여권 만료일 등 포함)
2. 수집·이용 목적
   항공권 예매 및 출입국 관련 절차 진행
3. 보유·이용 기간
   프로그램 종료일로부터 {{destroy_after_days}}일이 지난 후 파기
   (동의 철회 또는 참가 취소 시 즉시 파기)
4. 동의를 거부할 권리 및 불이익
   동의하지 않으실 수 있으나, 동의하지 않으시면 인투유학을 통한 항공권 예매가
   불가하여 프로그램 참가가 제한될 수 있습니다.

※ 제출하신 여권 이미지는 암호화하여 보관하며, 지정된 담당자만 열람할 수 있습니다.$doc$
),
(
  'reg_third_party', 1, '[필수] 3. 개인정보 제3자 제공 및 국외 이전 동의',
$doc$1. 제공받는 자 / 국가
   {{ticketing_agent}} / 대한민국
   {{school_name}} / {{school_country}}
   {{lodging_name}} / {{lodging_country}}
2. 제공 항목
   항공권 발권처: 학생 영문 이름, 생년월일, 성별, 여권 정보, 학부모 연락처
   현지 기관: 학생 영문 이름, 생년월일, 성별, 학년, 영어 수준, 비상 연락처
3. 제공 목적
   항공권 발권, 현지 수업·숙소 배정 및 학생 관리
4. 이전 일시 및 방법
   등록 확정 후 프로그램 준비 기간 중 이메일 등 정보통신망을 통한 전송
5. 제공받는 자의 보유·이용 기간
   제공 목적 달성 시까지(프로그램 종료 시까지)
6. 동의를 거부할 권리 및 불이익
   동의하지 않으실 수 있으나, 동의하지 않으시면 항공권 발권 및 현지 프로그램 진행이
   불가하여 참가가 제한됩니다.$doc$
),
(
  'reg_health', 1, '[선택] 4. 민감정보(건강 관련 정보) 수집·이용 동의',
$doc$(건강 특이사항을 입력하는 경우에만 필수)

1. 수집 항목: 알레르기, 복용 중인 약, 기타 건강상 유의사항
2. 수집·이용 목적: 프로그램 기간 중 학생 안전 관리 및 응급 상황 대응
   (필요 시 현지 기관에 안전 관리 목적으로 공유)
3. 보유·이용 기간: 프로그램 종료일로부터 {{destroy_after_days}}일이 지난 후 파기
4. 동의를 거부할 권리 및 불이익
   동의하지 않으셔도 등록은 가능하나, 건강 관련 정보를 사전에 반영한 관리가 어려울 수 있습니다.$doc$
),
(
  'reg_guardian', 1, '[필수] 5. 법정대리인 확인',
$doc$본인은 위 학생의 법정대리인(부모 등)으로서 위 동의 사항에 동의합니다.$doc$
),
(
  'destruction_notice', 1, '개인정보 파기 안내',
$doc$제출하신 개인정보는 {{program_name}} 종료일({{program_end_date}})로부터 {{destroy_after_days}}일이 지난 {{destroy_date}}에 파기됩니다.
(관계 법령에 따라 보관 의무가 있는 거래 기록은 해당 기간 동안 분리하여 보관합니다)$doc$
),
(
  'refund_default', 1, '환불 규정 기본안',
$doc$[{{program_name}} 환불 규정]

1. 고객 사정으로 인한 취소
   취소 요청일 기준(출국일 당일 미포함)으로 아래와 같이 환불합니다.
   - 출국 30일 전까지: 납부하신 예약금 전액 환불
   - 출국 29일 ~ 20일 전: 총 참가비의 10% 공제 후 환불
   - 출국 19일 ~ 10일 전: 총 참가비의 15% 공제 후 환불
   - 출국 9일 ~ 8일 전: 총 참가비의 20% 공제 후 환불
   - 출국 7일 ~ 1일 전: 총 참가비의 30% 공제 후 환불
   - 출국 당일 및 무단 불참: 총 참가비의 50% 공제 후 환불

2. 인투유학 사정으로 인한 취소
   납부하신 금액 전액을 환불합니다.

3. 천재지변, 전쟁, 감염병 확산, 정부의 명령(입국 금지·여행 경보 등) 등
   불가항력으로 프로그램 진행이 불가한 경우
   이미 지출되어 돌려받을 수 없는 실비(증빙 제시)를 제외한 금액을 환불합니다.

4. 프로그램 시작 후 중도 귀국
   개인 사정으로 중도 귀국하는 경우, 현지 기관의 환불 규정에 따라
   환불 가능한 금액을 확인하여 안내드립니다.

5. 환불 절차
   - 취소 요청은 인투유학 카카오톡 채널, 문자 또는 이메일로 남겨 주세요.
   - 환불은 취소 요청 확인일로부터 7영업일 이내에 처리합니다.
   - 카드 결제 건은 카드 결제 취소로, 계좌 입금 건은 신청자 명의 계좌로 환불합니다.$doc$
);

-- 부록 B의 공제율 표 기본값 (캠프별로 복사해 수정)
insert into public.settings (key, value) values
  ('refund_rules_default', '[
    {"min_days": 30, "max_days": null, "rate": 0},
    {"min_days": 20, "max_days": 29, "rate": 0.10},
    {"min_days": 10, "max_days": 19, "rate": 0.15},
    {"min_days": 8,  "max_days": 9,  "rate": 0.20},
    {"min_days": 1,  "max_days": 7,  "rate": 0.30},
    {"min_days": null, "max_days": 0, "rate": 0.50}
  ]'::jsonb)
on conflict (key) do nothing;
