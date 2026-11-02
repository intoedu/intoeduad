// 캠프 신청서 링크 주소 추천: 자주 쓰는 한국어 단어는 영어로 바꾸고, 사전에 없는 한글만 로마자로 적는다.
// 예: "미국스쿨링캠프" + "2027 겨울 1차" → usa-schooling-camp-2027-winter-1
// 링크 규칙(DB 검사): 영문 소문자·숫자·하이픈, 3~60자
import { romanize } from './romanize'

// 단어 → 영어 (긴 단어부터 먼저 찾는다. 새 단어가 필요하면 여기에 추가)
const WORDS: Record<string, string> = {
  // 나라·지역
  미국: 'usa', 캐나다: 'canada', 영국: 'uk', 호주: 'australia', 뉴질랜드: 'new-zealand',
  필리핀: 'philippines', 싱가포르: 'singapore', 싱가폴: 'singapore', 말레이시아: 'malaysia',
  아일랜드: 'ireland', 일본: 'japan', 중국: 'china', 대만: 'taiwan', 베트남: 'vietnam',
  태국: 'thailand', 독일: 'germany', 프랑스: 'france', 스페인: 'spain', 스위스: 'switzerland',
  몰타: 'malta', 하와이: 'hawaii', 괌: 'guam', 사이판: 'saipan', 세부: 'cebu', 클락: 'clark',
  뉴욕: 'new-york', 보스턴: 'boston', 시애틀: 'seattle', 캘리포니아: 'california', 엘에이: 'la',
  밴쿠버: 'vancouver', 토론토: 'toronto', 시드니: 'sydney', 멜버른: 'melbourne', 런던: 'london',
  오클랜드: 'auckland', 유럽: 'europe', 동남아: 'southeast-asia', 해외: 'overseas', 국내: 'korea',
  // 프로그램
  스쿨링: 'schooling', 캠프: 'camp', 영어: 'english', 어학연수: 'language-course', 어학: 'language',
  연수: 'training', 조기유학: 'early-study-abroad', 유학: 'study-abroad', 홈스테이: 'homestay',
  기숙사: 'dormitory', 보딩: 'boarding', 스쿨: 'school', 학교: 'school', 사립: 'private', 공립: 'public',
  국제: 'international', 리더십: 'leadership', 스포츠: 'sports', 골프: 'golf', 수영: 'swimming',
  코딩: 'coding', 과학: 'science', 수학: 'math', 예술: 'art', 미술: 'art', 음악: 'music',
  대학: 'university', 아이비리그: 'ivy-league', 탐방: 'tour', 투어: 'tour', 체험: 'experience',
  문화: 'culture', 가족: 'family', 부모동반: 'with-parents', 엄마랑: 'with-mom', 주니어: 'junior',
  초등: 'elementary', 중등: 'middle', 고등: 'high', 학생: 'student', 프로그램: 'program',
  아카데미: 'academy', 집중: 'intensive', 회화: 'speaking', 단기: 'short-term', 장기: 'long-term',
  // 시기
  여름: 'summer', 썸머: 'summer', 서머: 'summer', 겨울: 'winter', 윈터: 'winter', 봄: 'spring',
  가을: 'fall', 방학: 'vacation', 주간: 'weeks', 개월: 'months',
}
const KEYS = Object.keys(WORDS).sort((a, b) => b.length - a.length)

const isHangul = (ch: string) => /[가-힣]/.test(ch)

export function programSlug(text: string, maxLength = 60): string {
  // "1차", "2기", "3회" → 숫자만
  const src = text.replace(/(\d+)\s*(차|기|회)(?![가-힣])/g, '$1')
  const parts: string[] = []
  let rest = ''
  const flushRest = () => {
    if (rest) parts.push(romanize(rest))
    rest = ''
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (!isHangul(ch)) {
      flushRest()
      parts.push(ch)
      i++
      continue
    }
    const key = KEYS.find((k) => src.startsWith(k, i))
    if (key) {
      flushRest()
      parts.push(` ${WORDS[key]} `)
      i += key.length
    } else {
      rest += ch
      i++
    }
  }
  flushRest()
  return parts
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}
