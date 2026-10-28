# 작업 규칙 요약

- 기준 문서: `SPEC.md`(원본 명세) + `PLAN.md`(확정된 변경 사항·결정값). 충돌하면 PLAN.md가 우선.
- 비즈니스 서비스: 화면 문구는 한국어, 브랜드명 "인투유학", 종교 관련 표현 금지.
- 시간: DB는 `timestamptz`/`date`, 표시는 `Asia/Seoul`. 날짜 계산은 `src/domain/`의 순수 함수로.
- 비밀값은 프론트엔드·저장소에 두지 않는다. 프론트엔드에는 Supabase URL과 공개 키만.
- 비로그인(anon) 역할에는 테이블 권한을 주지 않는다. 공개 기능은 Edge Function 또는 개인정보 없는 RPC로.
- 개인정보 컬럼 값은 `activity_logs`에 남기지 않는다(감사 트리거 인자로 지정).
- 외부 API(솔라피 등) 사양은 공식 문서 확인 후 구현, 확인 불가 시 TODO로 남기고 보고.
- 마일스톤마다: 동작 확인 → 한국어 커밋 → 보고(만든 것 / 확인 방법 / 남은 TODO).

## 명령어

- `npm run dev` — 화면 개발 서버
- `npm test` — 단위 테스트(Vitest)
- `npx supabase start` — 로컬 Supabase(docker 필요)
- `npx supabase db reset` — 마이그레이션·시드 재적용
- `npx supabase test db` — RLS 테스트(pgTAP)
