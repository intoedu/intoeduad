# 인투유학 고객·등록 관리 시스템

MOU 학원 유입 → 상담 신청 → 캠프 등록 → 납부 → 개인정보 파기까지 한 곳에서 관리하는 내부 시스템입니다.

- 명세: [SPEC.md](./SPEC.md) · 확정 계획과 결정 사항: [PLAN.md](./PLAN.md)
- 화면: React + Vite + TypeScript + Tailwind (Cloudflare Pages 배포 예정)
- 서버: Supabase (Postgres·Auth·RLS·Edge Functions·Storage)

## 로컬 개발

필요: Node 22+, Docker

```bash
npm install
cp .env.example .env.local          # npx supabase start 출력의 URL·Publishable key 입력
npx supabase start                  # 로컬 Supabase (첫 실행 시 이미지 다운로드)
(cd supabase/functions/admin-staff && npm install)
npx supabase functions serve        # Edge Function (별도 터미널)
npm run dev                         # http://localhost:5173
```

개발용 계정(로컬 시드, 비밀번호 `devpass1234`):

| 이메일 | 역할 |
|---|---|
| admin@dev.local | 관리자 |
| staff@dev.local | 직원(여권 열람 권한 있음) |
| staff2@dev.local | 직원 |
| viewer@dev.local | 현지 팀(미국 스쿨링 캠프 담당) |

로컬 메일함(초대·비밀번호 재설정 메일 확인): http://127.0.0.1:54324

## 테스트

```bash
npm test                 # 단위 테스트 (Vitest)
npx supabase test db     # 역할별 접근 권한(RLS) 테스트 (pgTAP)
npx supabase db lint     # DB 보안·스키마 점검
npm run build            # 타입 검사 + 빌드
npm run e2e              # 브라우저 E2E (Playwright 필요. 로컬 Supabase·functions serve·npm run dev 실행 상태에서, 실행 전 npx supabase db reset)
```

## 운영 배포 시 필요한 작업 (요약)

1. Supabase 프로젝트(서울 리전) 생성 → `npx supabase link` → `npx supabase db push`
   (`supabase/seed.sql`은 개발용이므로 운영에 넣지 않는다)
2. Auth 설정: 회원가입 끄기, Site URL·Redirect URL을 운영 주소로, 외부 SMTP 연결, 메일 템플릿(`supabase/templates`) 적용
3. Edge Function 배포: `npx supabase functions deploy admin-staff`
4. 첫 관리자 만들기: 대시보드에서 사용자 초대 후 SQL로 프로필 생성
   ```sql
   insert into public.staff_profiles (id, name, email, role)
   select id, '대표', email, 'admin' from auth.users where email = '대표 이메일';
   ```
   이후 직원은 화면의 [설정·직원 관리]에서 초대한다.
5. 화면 배포: Cloudflare Pages에 `npm run build` 결과(`dist`) 배포, 환경변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` 설정, SPA 라우팅 설정
