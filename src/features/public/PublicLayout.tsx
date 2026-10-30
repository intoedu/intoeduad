import type { ReactNode } from 'react'

// 학부모용 공개 화면 (모바일 우선)
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center px-4 py-3">
          <span className="text-lg font-bold text-brand-600">인투유학</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pt-5 pb-16">{children}</main>
      <footer className="mx-auto max-w-xl px-4 pb-10 text-center text-xs text-slate-400">© 인투유학</footer>
    </div>
  )
}

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

// 터치하기 쉬운 선택 칩 (체크박스 기반이라 키보드·화면낭독기에서도 동작)
export function ChoiceChips({
  name,
  options,
  values,
  onChange,
}: {
  name: string
  options: Array<{ value: string; label: string }>
  values: string[]
  onChange: (values: string[]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = values.includes(o.value)
        return (
          <label
            key={o.value}
            className={`cursor-pointer rounded-full px-4 py-2 text-sm ring-1 transition select-none has-focus-visible:outline-2 has-focus-visible:outline-brand-600 ${
              checked ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
            }`}
          >
            <input
              type="checkbox"
              name={name}
              className="sr-only"
              checked={checked}
              onChange={(e) => onChange(e.target.checked ? [...values, o.value] : values.filter((v) => v !== o.value))}
            />
            {o.label}
          </label>
        )
      })}
    </div>
  )
}
