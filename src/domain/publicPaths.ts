// 학부모에게 이미 나간 링크·QR의 주소 모양 — 절대 바꾸지 않는다(바꾸면 배포된 QR이 깨진다).
// 화면 주소(routes.tsx)와 링크 만드는 함수(links.ts)가 모두 이 값을 쓰고, publicPaths.test.ts가 값이 바뀌지 않았는지 지킨다.
// 꼭 바꿔야 하면: 옛 주소를 새 주소로 넘겨 주는 경로를 먼저 만들고, 대표 승인 후 테스트 기대값을 함께 고친다.
export const PUBLIC_PATHS = {
  apply: '/apply', // 상담 신청(통합)
  applyPartner: '/apply/:partnerCode', // 학원·상담실장 상담 링크 (?c=실장코드)
  register: '/register', // 캠프 신청(통합, ?ref=학원코드&c=실장코드)
  registerCamp: '/register/:slug', // 캠프별 신청서 (?t=상담 기록 링크)
  my: '/my/:token', // 신청 내용 확인(알림톡 버튼)
  myTravel: '/my/:token/travel', // 출국 서류 정보
  passport: '/passport/:token', // 여권 사진 제출
} as const
