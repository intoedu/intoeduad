import type { Lang } from './context'

// ---------------------------------------------------------------------------
// 날짜·금액
// ---------------------------------------------------------------------------
const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 'YYYY-MM-DD' → 2027년 1월 2일(토) / Sat, Jan 2, 2027
export function formatDateLong(date: string, lang: Lang): string {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return lang === 'en' ? `${EN_WEEKDAYS[wd]}, ${EN_MONTHS[m - 1]} ${d}, ${y}` : `${y}년 ${m}월 ${d}일(${KO_WEEKDAYS[wd]})`
}

export function formatMoney(n: number, lang: Lang): string {
  return lang === 'en' ? `KRW ${n.toLocaleString('en-US')}` : `${n.toLocaleString('ko-KR')}원`
}

// ---------------------------------------------------------------------------
// 고르는 항목: 저장 값은 한국어 그대로 두고 영어 화면에서만 영어로 보여 준다
// ---------------------------------------------------------------------------
const OPTION_EN: Record<string, string> = {
  초1: 'Grade 1 (Elementary)',
  초2: 'Grade 2 (Elementary)',
  초3: 'Grade 3 (Elementary)',
  초4: 'Grade 4 (Elementary)',
  초5: 'Grade 5 (Elementary)',
  초6: 'Grade 6 (Elementary)',
  중1: 'Grade 7 (Middle school)',
  중2: 'Grade 8 (Middle school)',
  중3: 'Grade 9 (Middle school)',
  고1: 'Grade 10 (High school)',
  고2: 'Grade 11 (High school)',
  고3: 'Grade 12 (High school)',
  기타: 'Other',
  어머니: 'Mother',
  아버지: 'Father',
  조부모: 'Grandparent',
  친척: 'Relative',
  '처음 배워요': 'Beginner (just starting)',
  기초: 'Basic',
  중급: 'Intermediate',
  상급: 'Advanced',
  유학: 'Study abroad',
  캠프: 'Camp',
  비용: 'Cost',
  일정: 'Schedule',
  예: 'Yes',
  아니오: 'No',
}

export function optionText(value: string, lang: Lang): string {
  return lang === 'en' ? (OPTION_EN[value] ?? value) : value
}

// 서버가 돌려준 오류 코드 → 영어 문구 (한국어 화면은 서버 문구를 그대로 쓴다)
const ERROR_EN: Record<string, string> = {
  SLOT_UNAVAILABLE: 'That consultation time was just taken. Please choose another time.',
  TOO_MANY_REQUESTS: 'You just submitted with this phone number. Please try again in a moment.',
  NOT_FOUND: 'We could not find this form. Please check the link you received.',
  NOT_OPEN: 'Applications for this program are not open right now.',
  FULL: 'This program is full. Please contact us on KakaoTalk.',
  DUPLICATE: 'This student has already registered. Please contact us on KakaoTalk to check or change your registration.',
  CONSENT_REQUIRED: 'Please agree to all required items.',
  INVALID_INPUT: 'Please check your entries and try again.',
  AGENCY_REQUIRED: 'Please choose whether you want us to arrange flights, ESTA and travel insurance, and which items.',
  INFLOW_REQUIRED: 'Please tell us how you heard about us.',
  QUESTION_REQUIRED: 'Please answer the required questions.',
  QUESTION_INVALID: 'Please check your answers to the additional questions.',
  KAKAO_REQUIRED: 'Please tell us whether you use KakaoTalk.',
}

export function errorText(code: string | undefined, message: string, lang: Lang): string {
  if (lang !== 'en') return message
  return (code && ERROR_EN[code]) || 'We could not submit your form. Please try again in a moment.'
}

