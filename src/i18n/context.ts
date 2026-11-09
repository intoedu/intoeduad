import { createContext, useContext } from 'react'

// 학부모용 신청서 언어(한국어/영어). 주소는 바꾸지 않는다 — ?lang=en 으로 바로 영어로 열 수 있고, 고른 언어는 이 기기에 기억한다.
export type Lang = 'ko' | 'en'
export const LANG_KEY = 'intoedu:lang'

export function initialLang(): Lang {
  if (typeof window === 'undefined') return 'ko'
  const q = new URLSearchParams(window.location.search).get('lang')
  if (q === 'en' || q === 'ko') {
    // 주소로 고른 언어도 기억한다(카카오·구글 로그인처럼 다른 사이트를 다녀와도 유지)
    try {
      localStorage.setItem(LANG_KEY, q)
    } catch {
      // 기억하지 못해도 이번 화면은 그 언어
    }
    return q
  }
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'ko') return saved
  } catch {
    // 저장소를 못 쓰면 한국어
  }
  return 'ko'
}

export type LangState = { lang: Lang; en: boolean; enabled: boolean; setLang: (l: Lang) => void; tr: (ko: string, en: string) => string }

// 공급자가 없는 곳(직원 화면)은 항상 한국어
export const LangContext = createContext<LangState>({ lang: 'ko', en: false, enabled: false, setLang: () => {}, tr: (ko) => ko })

export function useLang() {
  return useContext(LangContext)
}

