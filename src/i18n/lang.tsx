import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Outlet } from 'react-router'
import { initialLang, LangContext, LANG_KEY, useLang, type Lang, type LangState } from './context'

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      // 기억하지 못해도 이번 화면은 바뀐다
    }
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
    return () => {
      document.documentElement.lang = 'ko'
    }
  }, [lang])
  const value = useMemo<LangState>(() => ({ lang, en: lang === 'en', enabled: true, setLang, tr: (ko, en) => (lang === 'en' ? en : ko) }), [lang, setLang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

// 언어 전환을 쓰는 공개 화면 묶음(상담·캠프 신청서와 완료 화면). 주소(path)는 그대로다.
export function LangLayout() {
  return (
    <LangProvider>
      <Outlet />
    </LangProvider>
  )
}

// 언어 바꾸기 버튼
export function LangToggle() {
  const { lang, setLang, enabled } = useLang()
  if (!enabled) return null
  return (
    <div className="flex overflow-hidden rounded-full text-xs ring-1 ring-slate-300" role="group" aria-label="Language / 언어">
      {(
        [
          ['ko', '한국어'],
          ['en', 'English'],
        ] as const
      ).map(([l, label]) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`px-3 py-1 ${lang === l ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-slate-600'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// 영어 화면에서 동의서 위에 보이는 안내: 법적 효력이 있는 동의 문구는 한국어 원문이다
export function ConsentKoreanNote() {
  return (
    <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-200" lang="en">
      The consent text below is provided in Korean, which is the official version. If you need help understanding it, please contact us on KakaoTalk
      before submitting.
    </p>
  )
}
