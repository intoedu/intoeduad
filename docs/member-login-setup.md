# 학부모 회원 로그인 설정 안내 (카카오 · 구글 · 이메일)

인투유학 CRM의 학부모 회원 기능(M19)은 이미 만들어져 있습니다. 아래 설정을 Supabase와 각 회사 개발자 사이트에서 하시면 신청서의 **"카카오로 시작하기" / "구글로 시작하기"** 버튼이 자동으로 나타납니다(켜진 로그인 수단만 버튼이 보입니다).

> 근거: Supabase 공식 문서 「Sign in with Kakao」, 「Configure Social Login (OAuth) Providers」, 「Custom SMTP / Auth rate limits」 (2026-11-07 확인). 각 회사 화면의 메뉴 이름은 바뀔 수 있으니 문서와 다르면 알려 주세요.

## 공통으로 쓰는 값

| 항목 | 값 |
|---|---|
| Supabase 콜백 주소 (Redirect URI) | `https://ezroctoaeqqmjgnzwfpb.supabase.co/auth/v1/callback` |
| 서비스 주소 | `https://intoeduad.intoedu0309.workers.dev` (도메인을 바꾸면 그 주소도 추가) |

### 0. Supabase 리디렉션 주소 등록 (먼저)
1. Supabase 대시보드 → 프로젝트 `intoedu-crm` → **Authentication → URL Configuration**
2. **Redirect URLs**에 `https://intoeduad.intoedu0309.workers.dev/**` 추가 → 저장
   (로그인 후 `/account/callback`으로 돌아오기 위해 필요합니다. 없으면 로그인 후 엉뚱한 주소로 갑니다.)

## 1. 카카오 로그인
1. [Kakao Developers](https://developers.kakao.com) 로그인 → **앱 → 앱 만들기** (앱 이름: 인투유학, 회사 이름 등 입력)
2. **앱 설정 → 앱 → 플랫폼 키**에서 **REST API 키** 확인 → 이것이 `Client ID`
3. 같은 REST API 키 편집 화면의 **카카오 로그인 Redirect URI**에 위 Supabase 콜백 주소 입력 → 저장
4. 같은 화면의 **카카오 로그인 Client Secret 코드** 확인 → 이것이 `Client Secret` (**활성화**까지 꼭 켜기)
5. **제품 설정 → 카카오 로그인 → 일반**: 사용 설정 **ON**
6. **제품 설정 → 카카오 로그인 → 동의항목**: `profile_nickname`, `profile_image` 설정
   - `account_email`(이메일)은 **비즈 앱**에서만 받을 수 있습니다(앱 설정 → 일반 → 사업자 정보 등록).
   - 비즈 앱 전환 전이면 이메일 동의항목은 빼고, 아래 7번에서 **"Allow users without an email"**을 켭니다.
7. Supabase 대시보드 → **Authentication → Sign In / Providers → Kakao** → Enabled ON → Client ID / Client Secret 입력 → (필요 시) Allow users without an email ON → 저장

## 2. 구글 로그인
1. [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 만들기(또는 선택)
2. **APIs & Services → OAuth consent screen** → **External** 앱으로 설정(앱 이름: 인투유학, 지원 이메일 등)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → 유형 **Web application**
4. **Authorized redirect URIs**에 위 Supabase 콜백 주소 입력 → 만들기 → Client ID / Client Secret 복사
5. Supabase 대시보드 → **Authentication → Sign In / Providers → Google** → Enabled ON → Client ID / Client Secret 입력 → 저장
6. 구글 동의 화면이 "테스트" 상태면 등록한 테스트 사용자만 로그인됩니다 → 운영 전 **게시(Publish)** 필요

## 3. 이메일 회원가입 — 2026-11-07 결정: C(메일 서버 연결 전까지 숨김)
- 지금 운영 화면에는 **이메일 가입·로그인 버튼이 보이지 않습니다.** 카카오·구글을 켜기 전까지는 회원 안내 창·로그인 링크도 나오지 않고 모두 비회원으로 신청합니다.
- 나중에 메일 서버(SMTP)를 연결하면 Cloudflare 배포 환경변수 `VITE_MEMBER_EMAIL_SIGNUP=on`을 넣고 다시 배포하면 이메일 버튼이 돌아옵니다.

### (참고) 결정 배경
운영 Supabase는 지금 **이메일 가입 허용 + 이메일 인증 필요** 상태입니다(2026-11-07 확인).
그런데 Supabase 기본 메일 서버는 **프로젝트 팀원 주소로만 메일을 보내고**, 시간당 발송 수도 제한되며 운영용이 아니라고 공식 문서에 적혀 있습니다.
→ **지금 그대로면 학부모님은 인증 메일을 받지 못해 이메일 가입을 마칠 수 없습니다.** (카카오·구글 로그인은 메일이 필요 없어 영향 없음)

선택지:
- **A. 메일 서버(SMTP) 연결 (권장):** SendGrid, AWS SES, 네이버 웍스·Gmail(Google Workspace) 등 SMTP 정보를 Supabase → **Authentication → Emails → SMTP Settings**에 입력. 연결 직후 발송 한도는 시간당 30통으로 시작하며 **Authentication → Rate Limits**에서 조정합니다.
- **B. 이메일 인증 끄기:** Authentication → Sign In / Providers → Email → "Confirm email" 끄기. 가입은 바로 되지만, 남의 이메일로 가입하는 것을 막지 못하고 **비밀번호 찾기 메일은 여전히 못 보냅니다.**
- **C. 이메일 가입은 쓰지 않고 카카오·구글만:** 신청서에서 이메일 버튼을 숨기도록 바꿔 드릴 수 있습니다.

## 4. 확인 방법
1. 시크릿 창으로 `https://intoeduad.intoedu0309.workers.dev/apply` 접속 → "회원으로 신청하시겠어요?" 창에 카카오·구글 버튼이 보이는지
2. 카카오로 로그인 → 회원 정보 입력(동의) → 상담 신청서로 돌아와 학부모·자녀 정보가 채워지는지
3. [내 정보]에서 자녀 추가·수정, 탈퇴가 되는지

## 개인정보 관련 메모
- 회원 정보는 회원 본인만 보고 고칠 수 있습니다(직원 화면에는 나오지 않음). 탈퇴하면 바로 삭제됩니다.
- 회원 동의 문구(`member_privacy` v1)와 상담·캠프 신청서 개인정보 동의 새 버전은 **법률 검토 전 초안**입니다. 설정 → 동의·안내 문구에서 새 버전으로 고칠 수 있습니다.
- 카카오 로그인 버튼 디자인은 카카오 디자인 가이드가 따로 있습니다(검토 후 맞춰 드릴 수 있음).
