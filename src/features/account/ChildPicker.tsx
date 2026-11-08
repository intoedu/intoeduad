import type { CustomerStudent } from './customerApi'
import { useLang } from '../../i18n/context'

// 회원: 저장된 자녀 중 누구의 신청인지 고르기(새 자녀는 직접 입력)
export function ChildPicker({ students, value, onPick }: { students: CustomerStudent[]; value: string; onPick: (s: CustomerStudent | null) => void }) {
  const { tr } = useLang()
  if (students.length === 0) return null
  return (
    <fieldset className="rounded-xl bg-brand-50 p-3">
      <legend className="sr-only">{tr('신청할 자녀', 'Child')}</legend>
      <p className="mb-2 text-sm font-medium text-brand-800">{tr('회원 정보에서 자녀를 골라 주세요', 'Choose a child from your profile')}</p>
      <div className="flex flex-wrap gap-2">
        {students.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className={`rounded-full px-4 py-2 text-sm ring-1 ${value === s.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'}`}
          >
            {s.name_ko}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick(null)}
          className={`rounded-full px-4 py-2 text-sm ring-1 ${value === 'new' ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'}`}
        >
          {tr('다른 자녀(새로 입력)', 'Another child (enter new)')}
        </button>
      </div>
    </fieldset>
  )
}
