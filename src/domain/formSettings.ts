// 신청서 질문 설정 — 기본 질문의 문구·필수 여부, 추가 질문 형식, 답변 검사
// DB 기본값: lead_field_modes() / registration_field_modes() 와 같게 유지한다.

export type FieldMode = 'required' | 'optional' | 'hidden'

export type FieldText = { label?: string; help?: string }
export type FieldSetting = FieldText & { mode?: FieldMode }

// 상담 신청서 기본 질문
export type LeadFieldKey =
  | 'student_name'
  | 'grade'
  | 'interests'
  | 'programs'
  | 'parent_name'
  | 'parent_phone'
  | 'relation'
  | 'slot'
  | 'topics'
  | 'message'

export const LEAD_FIELDS: Array<{ key: LeadFieldKey; label: string; help?: string; default: FieldMode; modes: FieldMode[] }> = [
  { key: 'student_name', label: '자녀 이름', default: 'required', modes: ['required'] },
  { key: 'grade', label: '학년', default: 'required', modes: ['required', 'optional', 'hidden'] },
  { key: 'interests', label: '관심 분야 (복수 선택)', default: 'optional', modes: ['required', 'optional', 'hidden'] },
  { key: 'programs', label: '관심 프로그램 (복수 선택)', default: 'optional', modes: ['required', 'optional', 'hidden'] },
  { key: 'parent_name', label: '학부모 이름', default: 'required', modes: ['required'] },
  { key: 'parent_phone', label: '휴대폰 번호', default: 'required', modes: ['required'] },
  { key: 'relation', label: '자녀와의 관계', default: 'required', modes: ['required', 'optional', 'hidden'] },
  // 상담 시간은 비어 있을 수 있어 필수로 둘 수 없다
  { key: 'slot', label: '원하는 상담 날짜·시간을 고를게요', default: 'optional', modes: ['optional', 'hidden'] },
  { key: 'topics', label: '상담 받고 싶은 내용', default: 'optional', modes: ['required', 'optional', 'hidden'] },
  { key: 'message', label: '자세한 내용', default: 'optional', modes: ['required', 'optional', 'hidden'] },
]

// 캠프 신청서 기본 질문(문구만 바꾸는 항목 포함). 필수/선택/숨김은 programs/api.ts FORM_FIELDS 와 캠프별 설정
export const REGISTRATION_TEXT_FIELDS: Array<{ key: string; label: string; help?: string }> = [
  { key: 'student_name_ko', label: '학생 이름(한글)' },
  { key: 'student_name_en', label: '영문 이름(여권과 동일)', help: '여권에 적힌 그대로 입력해 주세요. 항공권 발권에 사용합니다.' },
  { key: 'birth_date', label: '생년월일' },
  { key: 'gender', label: '성별' },
  { key: 'school', label: '학교' },
  { key: 'grade', label: '학년' },
  { key: 'english_level', label: '영어 수준' },
  { key: 'parent_name', label: '학부모 이름' },
  { key: 'parent_phone', label: '휴대폰 번호', help: '납부 안내를 이 번호로 보내 드립니다.' },
  { key: 'parent_email', label: '이메일' },
  { key: 'address', label: '주소' },
  { key: 'emergency', label: '비상 연락처', help: '프로그램 기간 중 학부모님과 연락이 닿지 않을 때 연락드릴 분입니다.' },
  { key: 'special_notes', label: '특이사항' },
]

export function leadModes(saved: Partial<Record<string, FieldMode>> | null | undefined): Record<LeadFieldKey, FieldMode> {
  return Object.fromEntries(
    LEAD_FIELDS.map((f) => {
      const m = saved?.[f.key]
      return [f.key, m && f.modes.includes(m) ? m : f.default]
    }),
  ) as Record<LeadFieldKey, FieldMode>
}

// 화면에 보일 문구: 설정 > 기본
export function fieldLabel(texts: Record<string, FieldText> | null | undefined, key: string, fallback: string): string {
  const v = texts?.[key]?.label?.trim()
  return v || fallback
}

export function fieldHelp(texts: Record<string, FieldText> | null | undefined, key: string, fallback?: string): string | undefined {
  const v = texts?.[key]?.help?.trim()
  return v || fallback
}

// ---------------------------------------------------------------------------
// 추가 질문
// ---------------------------------------------------------------------------
export type QuestionType = 'short_text' | 'long_text' | 'single_choice' | 'multi_choice' | 'dropdown' | 'yes_no' | 'date' | 'number'

export const QUESTION_TYPES: Array<{ value: QuestionType; label: string; hasOptions: boolean }> = [
  { value: 'short_text', label: '짧은 글', hasOptions: false },
  { value: 'long_text', label: '긴 글', hasOptions: false },
  { value: 'single_choice', label: '객관식(하나 선택)', hasOptions: true },
  { value: 'multi_choice', label: '체크박스(여러 개 선택)', hasOptions: true },
  { value: 'dropdown', label: '드롭다운', hasOptions: true },
  { value: 'yes_no', label: '예 / 아니오', hasOptions: false },
  { value: 'date', label: '날짜', hasOptions: false },
  { value: 'number', label: '숫자', hasOptions: false },
]

export const YES_NO = ['예', '아니오'] as const

export type PublicQuestion = {
  id: string
  label: string
  help: string | null
  type: QuestionType
  options: string[]
  required: boolean
}

export type AnswerValue = string | string[]
export type AnswerMap = Record<string, AnswerValue>

export function questionTypeLabel(type: string): string {
  return QUESTION_TYPES.find((t) => t.value === type)?.label ?? type
}

export function hasOptions(type: string): boolean {
  return !!QUESTION_TYPES.find((t) => t.value === type)?.hasOptions
}

function isEmpty(v: AnswerValue | undefined): boolean {
  if (v === undefined) return true
  return Array.isArray(v) ? v.length === 0 : v.trim() === ''
}

// 화면 검사(서버 collect_form_answers 와 같은 규칙). 오류는 질문 id → 문구
export function validateAnswers(questions: PublicQuestion[], answers: AnswerMap, enforceRequired = true, lang: 'ko' | 'en' = 'ko'): Record<string, string> {
  const en = lang === 'en'
  const errors: Record<string, string> = {}
  for (const q of questions) {
    const v = answers[q.id]
    if (isEmpty(v)) {
      if (q.required && enforceRequired) errors[q.id] = en ? 'Please answer this question.' : '답해 주세요.'
      continue
    }
    if (q.type === 'number' && !/^-?[0-9]{1,12}(\.[0-9]{1,4})?$/.test(String(v).trim())) errors[q.id] = en ? 'Please enter numbers only.' : '숫자만 입력해 주세요.'
    if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors[q.id] = en ? 'Please check the date.' : '날짜를 확인해 주세요.'
    if ((q.type === 'single_choice' || q.type === 'dropdown') && !q.options.includes(String(v))) errors[q.id] = en ? 'Please choose again.' : '다시 골라 주세요.'
    if (q.type === 'multi_choice' && (v as string[]).some((x) => !q.options.includes(x))) errors[q.id] = en ? 'Please choose again.' : '다시 골라 주세요.'
    if (q.type === 'yes_no' && !(YES_NO as readonly string[]).includes(String(v))) errors[q.id] = en ? 'Please choose again.' : '다시 골라 주세요.'
  }
  return errors
}

// 보낼 답변: 보이는 질문의 값만, 빈 값 제외
export function cleanAnswers(questions: PublicQuestion[], answers: AnswerMap): AnswerMap {
  const out: AnswerMap = {}
  for (const q of questions) {
    const v = answers[q.id]
    if (isEmpty(v)) continue
    out[q.id] = Array.isArray(v) ? v : v.trim()
  }
  return out
}

// 저장된 답변 [{id, label, type, value}]
export type SavedAnswer = { id: string; label: string; type: string; value: AnswerValue }

export function savedAnswers(value: unknown): SavedAnswer[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (a): a is SavedAnswer => !!a && typeof a === 'object' && typeof (a as SavedAnswer).label === 'string' && (a as SavedAnswer).value !== undefined,
  )
}

export function answerText(value: AnswerValue): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

// ---------------------------------------------------------------------------
// 유입 경로
// ---------------------------------------------------------------------------
export type InflowKind = 'partner' | 'plain' | 'detail'
export type InflowChannel = { id: string; label: string; kind: InflowKind; detail_label: string | null; detail_required: boolean }
export type InflowConfig = { label: string; channels: InflowChannel[] }

export const INFLOW_KIND_LABELS: Record<InflowKind, string> = {
  partner: '학원 선택(커미션 소개 경로)',
  plain: '고르기만',
  detail: '추가 내용 입력',
}

// 유입 경로 화면 값
export type InflowValue = {
  channelId: string
  partnerId: string // 학원 소개: 고른 학원 id, PARTNER_NOT_LISTED = 목록에 없음
  contactId: string
  detail: string
}

export const PARTNER_NOT_LISTED = '__not_listed__'
export const CONTACT_UNKNOWN = '__unknown__'
export const EMPTY_INFLOW: InflowValue = { channelId: '', partnerId: '', contactId: '', detail: '' }

// 링크로 학원이 정해졌으면 묻지 않는다
export function validateInflow(config: InflowConfig | null | undefined, v: InflowValue, partnerKnown: boolean, lang: 'ko' | 'en' = 'ko'): string | null {
  if (partnerKnown) return null
  const en = lang === 'en'
  const ch = config?.channels.find((c) => c.id === v.channelId)
  if (!ch) return en ? 'Please tell us how you heard about us.' : '알게 된 경로를 선택해 주세요.'
  if (ch.kind === 'partner') {
    if (!v.partnerId) return en ? 'Please choose the academy that referred you.' : '소개해 준 학원을 골라 주세요.'
    if (v.partnerId === PARTNER_NOT_LISTED && !v.detail.trim()) return en ? 'Please enter the academy name.' : '학원 이름을 적어 주세요.'
  }
  if (ch.kind === 'detail' && ch.detail_required && !v.detail.trim()) return en ? 'Please fill in the details.' : `${ch.detail_label || '내용'}을(를) 적어 주세요.`
  return null
}

// 보낼 값(DB가 학원 > 경로 순으로 다시 판단)
export function inflowPayload(config: InflowConfig | null | undefined, v: InflowValue, partnerKnown: boolean) {
  if (partnerKnown) return { inflow_channel_id: null, inflow_detail: null, partner_id: null, contact_id: null }
  const ch = config?.channels.find((c) => c.id === v.channelId)
  const partnerChosen = ch?.kind === 'partner' && v.partnerId && v.partnerId !== PARTNER_NOT_LISTED
  return {
    inflow_channel_id: ch?.id ?? null,
    inflow_detail: ch && ch.kind !== 'plain' && !partnerChosen ? v.detail.trim() || null : null,
    partner_id: partnerChosen ? v.partnerId : null,
    contact_id: partnerChosen && v.contactId && v.contactId !== CONTACT_UNKNOWN ? v.contactId : null,
  }
}

// 상담 이력 질문
export const CONSULTED_OPTIONS: Array<{ value: 'yes' | 'no' | 'unsure'; label: string; en: string }> = [
  { value: 'yes', label: '예, 상담했어요', en: 'Yes, I have' },
  { value: 'no', label: '아니요, 처음이에요', en: 'No, this is my first time' },
  { value: 'unsure', label: '잘 모르겠어요', en: "I'm not sure" },
]

// 기본으로 들어 있는 유입 경로·문구의 영어 표기(관리자가 새로 만든 이름은 그대로 보인다)
export const INFLOW_EN: Record<string, string> = {
  '어디서 알게 되셨나요?': 'How did you hear about us?',
  '학원 소개': 'Referred by an academy',
  '지인 소개': 'Friend or family',
  '인스타그램': 'Instagram',
  '네이버 블로그·카페': 'Naver Blog / Cafe',
  '유튜브': 'YouTube',
  '인터넷 검색': 'Web search',
  '설명회·박람회': 'Info session / Fair',
  '이전에 참가한 적 있음': 'I have joined before',
  '기타': 'Other',
  '소개해 주신 분 (선택)': 'Who referred you? (optional)',
  '알게 된 경로': 'Please specify',
  '인투유학 상담을 신청하신 적이 있나요?': 'Have you requested a consultation with INTOEDU before?',
}
export function inflowText(text: string | null | undefined, lang: 'ko' | 'en'): string {
  if (!text) return ''
  return lang === 'en' ? (INFLOW_EN[text] ?? text) : text
}

export const CONSULTED_LABELS: Record<string, string> = { yes: '예', no: '아니오', unsure: '잘 모르겠음' }
export const LEAD_LINK_LABELS: Record<string, string> = {
  token: '상담 기록 링크로 신청',
  auto: '번호·이름이 같아 자동 연결',
  staff: '담당자가 연결',
}

// ---------------------------------------------------------------------------
// 카카오톡 사용 여부 — 상담 일정·등록 완료 안내를 카카오톡으로 보낸다
// ---------------------------------------------------------------------------
export type KakaoValue = { use: '' | 'yes' | 'no'; altPhone: string; altContact: string }
export const EMPTY_KAKAO: KakaoValue = { use: '', altPhone: '', altContact: '' }

export function validateKakao(v: KakaoValue, lang: 'ko' | 'en' = 'ko'): string | null {
  const en = lang === 'en'
  if (!v.use) return en ? 'Please tell us whether you use KakaoTalk.' : '카카오톡 사용 여부를 골라 주세요.'
  if (v.use === 'no') {
    const phone = v.altPhone.replace(/\D/g, '')
    if (phone && !/^01[0-9]{8,9}$/.test(phone)) return en ? 'Please check the alternative KakaoTalk phone number. (e.g. 010-1234-5678)' : '대신 받을 카카오톡 번호를 확인해 주세요. (예: 010-1234-5678)'
    if (!phone && !v.altContact.trim()) return en ? 'Please enter an alternative KakaoTalk number or another way to reach you.' : '대신 받을 카카오톡 번호나 다른 연락 방법 중 하나는 적어 주세요.'
  }
  return null
}

export function kakaoPayload(v: KakaoValue) {
  if (v.use !== 'no') return { kakao_use: v.use === 'yes' ? true : null, kakao_alt_phone: null, alt_contact: null }
  return {
    kakao_use: false,
    kakao_alt_phone: v.altPhone.replace(/\D/g, '') || null,
    alt_contact: v.altContact.trim() || null,
  }
}
