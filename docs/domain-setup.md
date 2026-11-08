# 신청 링크 주소를 app.intoabroad.com 으로 바꾸기 (방식 B: Cloudflare Pages + Namecheap 기록 1줄)

결정(2026-11-08): 홈페이지(intoabroad.com, GitHub Pages)와 이메일(Namecheap 메일 전달)은 건드리지 않고,
신청 앱만 Cloudflare Pages로 올린 뒤 하위 주소 **app.intoabroad.com** 을 연결한다.

- 바뀐 뒤 링크: 상담 `https://app.intoabroad.com/apply` · 캠프 `https://app.intoabroad.com/register` · 직원 `https://app.intoabroad.com/admin`
- 링크 뒷부분(/apply, /register, 학원 코드 등)은 그대로 — `src/domain/publicPaths.ts` + "링크 지킴이" 시험이 지킨다.
- 근거: Cloudflare 공식 문서 「Pages › Custom domains」("하위 주소는 Cloudflare 영역이 아니어도 CNAME 기록으로 연결",
  "CNAME을 넣기 전에 Pages에 먼저 등록하지 않으면 522 오류"), 「Pages › Serving Pages」(없는 주소는 index.html로 → 화면 주소 그대로 동작, `_headers` 적용).

---

## 1단계 — Cloudflare Pages 프로젝트 만들기 (전도사님, 약 10분)
1. Cloudflare 대시보드 → **Workers & Pages → Create(만들기)** → **Pages** 탭 → **Connect to Git(Git에 연결)**
2. GitHub 저장소 **intoedu/intoeduad**, 브랜치 **main** 선택
3. 빌드 설정
   - Framework preset: **None**(또는 Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. 환경 변수(Production) 추가
   - `NODE_VERSION` = `22` (빌드 도구가 최신 Node를 요구)
   - `VITE_PUBLIC_SITE_URL` = `https://app.intoabroad.com`
   - (지금 Worker의 Settings → Build → Variables에 다른 `VITE_` 값이 있으면 같은 값으로 추가)
5. **Save and Deploy** → 끝나면 `프로젝트이름.pages.dev` 주소가 나옵니다. 열어서 `/apply` 가 보이는지 확인.
   - 저장소의 `wrangler.jsonc`는 지금 Worker용이라 Pages 빌드 로그에 경고가 나올 수 있습니다(공식 문서: Pages는 이 파일을 운영 설정으로 쓰지 않음). 실패하면 로그를 캡처해 주세요.

## 2단계 — Pages에 주소 등록 (반드시 Namecheap보다 먼저)
1. 만든 Pages 프로젝트 → **Custom domains → Set up a custom domain**
2. `app.intoabroad.com` 입력 → Cloudflare가 넣으라는 **CNAME 값**(`프로젝트이름.pages.dev`)을 확인

## 3단계 — Namecheap에 기록 1줄 추가 (전도사님)
1. Namecheap → **Domain List → intoabroad.com → Manage → Advanced DNS**
2. **Add New Record**
   - Type: **CNAME Record**
   - Host: `app`
   - Value: `프로젝트이름.pages.dev` (2단계에서 본 값)
   - TTL: Automatic
3. 저장. **다른 기록(홈페이지 A 기록 4개, www, 메일 MX)은 절대 건드리지 마세요.**
4. Cloudflare Pages의 Custom domains에서 상태가 **Active**가 될 때까지 기다립니다(보통 몇 분~수 시간, 인증서 발급 포함).

## 4단계 — 새 주소로 로그인·알림 연결 (Active 뒤)
| 할 일 | 누가 | 어디서 |
|---|---|---|
| Site URL을 `https://app.intoabroad.com` 으로, Redirect URLs에 `https://app.intoabroad.com/**` 추가(옛 주소는 당분간 유지) | 전도사님 | Supabase → Authentication → URL Configuration |
| 승인된 자바스크립트 원본에 `https://app.intoabroad.com` 추가 | 전도사님 | Google Cloud → 사용자 인증 정보 → 인투유학 웹 로그인 |
| 카카오: 바꿀 것 없음(돌아오는 곳이 Supabase 주소) | — | — |
| 알림톡 링크용 "학부모용 사이트 주소"를 새 주소로 | Claude | 설정 → 기본 설정(public_site_url) |
| 새 주소에서 보안 헤더·상담/캠프 신청·카카오/구글 로그인 확인 | Claude | — |
| 학원별 QR·링크 다시 내려받기 | 직원 | 신청 링크 화면 |

알림톡: 버튼 링크가 `#{확인링크}` 변수라 템플릿 자체는 바뀌지 않습니다(심사 때 예시 주소만 새 주소로 — `docs/alimtalk-templates.md` 갱신 완료).
다만 카카오가 변수 링크의 도메인을 따로 검사하는지는 확인하지 못했습니다 — 바꾼 뒤 첫 알림톡 버튼이 열리는지 확인합니다.

## 5단계 — 옛 주소(…workers.dev) 넘겨주기 (새 주소 확인 뒤, Claude)
- 지금 Worker를 "모든 주소를 `https://app.intoabroad.com` + 같은 뒷부분으로 넘겨주는" 작은 프로그램으로 바꿉니다.
  이미 받은 옛 링크·QR·알림톡 버튼도 새 주소로 자동 이동합니다.
- 그때까지 옛 주소와 새 주소 둘 다 그대로 동작합니다(같은 저장소에서 각각 배포).
