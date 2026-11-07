import { useState } from 'react'
import { Link } from 'react-router'
import { anyLoginMethod, signInWithProvider, useCustomer, useLoginMethods, type CustomerState, type Provider } from './customerApi'

const DISMISS_KEY = 'intoedu:member-gate-dismissed'

function dismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

// 상담 신청서를 열면 먼저 묻는 창: 회원가입(카카오·구글·이메일) 후 진행 / 비회원으로 신청
export function MemberGate({ state, next }: { state: CustomerState; next: string }) {
  const [open, setOpen] = useState(() => !dismissed())
  const providers = useLoginMethods()
  const [error, setError] = useState('')

  // 켜진 로그인 수단이 없으면 묻지 않는다
  if (!open || state.status !== 'guest' || !providers || !anyLoginMethod(providers)) return null

  function close() {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // 저장이 막혀 있어도 창은 닫는다
    }
    setOpen(false)
  }

  async function go(p: Provider) {
    setError('')
    try {
      await signInWithProvider(p, next)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="member-gate-title">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="member-gate-title" className="text-lg font-bold text-slate-900">
          회원으로 신청하시겠어요?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          회원가입을 하시면 학생·학부모 정보를 한 번만 입력해 두고, 나중에 캠프를 신청하실 때 자동으로 채워 드립니다.
        </p>
        <div className="mt-4 space-y-2">
          {providers.kakao && (
            <button
              type="button"
              onClick={() => void go('kakao')}
              className="w-full rounded-xl bg-[#FEE500] px-4 py-3 text-base font-semibold text-[#191919]"
            >
              카카오로 시작하기
            </button>
          )}
          {providers.google && (
            <button
              type="button"
              onClick={() => void go('google')}
              className="w-full rounded-xl bg-white px-4 py-3 text-base font-semibold text-slate-800 ring-1 ring-slate-300"
            >
              구글로 시작하기
            </button>
          )}
          {providers.email && (
            <Link
              to={`/account/login?next=${encodeURIComponent(next)}`}
              className="block w-full rounded-xl bg-brand-600 px-4 py-3 text-center text-base font-semibold text-white"
            >
              이메일로 회원가입·로그인
            </Link>
          )}
          <button type="button" onClick={close} className="w-full rounded-xl px-4 py-3 text-base font-medium text-slate-600 ring-1 ring-slate-200">
            비회원으로 신청하기
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  )
}

// 공개 화면 머리글의 회원 링크
export function AccountHeaderLink() {
  const { state } = useCustomer()
  const methods = useLoginMethods()
  if (state.status === 'member' || state.status === 'needs_setup') {
    return (
      <Link to="/account" className="text-sm font-medium text-brand-600">
        내 정보
      </Link>
    )
  }
  if (state.status === 'guest' && anyLoginMethod(methods)) {
    return (
      <Link to={`/account/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`} className="text-sm text-slate-500">
        로그인
      </Link>
    )
  }
  return null
}
