import { Field, Input } from '../ui'
import type { KakaoValue } from '../../domain/formSettings'

// "카카오톡을 사용하시나요?" — 안내(상담 일정·등록 완료 등)를 카카오톡으로 보내기 때문에 묻는다
export function KakaoField({ value, onChange, error }: { value: KakaoValue; onChange: (v: KakaoValue) => void; error?: string | null }) {
  return (
    <fieldset id="field-kakao" className="space-y-3">
      <legend className="mb-1 text-sm font-medium text-slate-700">카카오톡을 사용하시나요?</legend>
      <p className="text-xs text-slate-500">상담 일정, 캠프 등록 완료, 납부 안내 등을 카카오톡으로 보내 드리기 때문에 여쭙니다.</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="카카오톡 사용 여부">
        {(
          [
            ['yes', '네, 사용해요'],
            ['no', '아니요, 사용하지 않아요'],
          ] as const
        ).map(([v, label]) => (
          <label
            key={v}
            className={`cursor-pointer rounded-xl px-3 py-2.5 text-center text-sm ring-1 has-focus-visible:outline-2 has-focus-visible:outline-brand-600 ${
              value.use === v ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
            }`}
          >
            <input type="radio" name="kakao-use" className="sr-only" checked={value.use === v} onChange={() => onChange({ ...value, use: v })} />
            {label}
          </label>
        ))}
      </div>
      {value.use === 'no' && (
        <div className="space-y-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="text-xs text-amber-800">안내를 받으실 방법을 하나 이상 적어 주세요.</p>
          <Field label="대신 받을 카카오톡 계정의 전화번호" hint="가족 등 카카오톡을 쓰시는 분의 번호로 안내를 보내 드립니다.">
            <Input type="tel" inputMode="tel" placeholder="010-1234-5678" value={value.altPhone} onChange={(e) => onChange({ ...value, altPhone: e.target.value })} />
          </Field>
          <Field label="다른 SNS 아이디 또는 연락처" hint="예: 라인 아이디, 위챗 아이디, 문자 받을 번호">
            <Input maxLength={100} value={value.altContact} onChange={(e) => onChange({ ...value, altContact: e.target.value })} />
          </Field>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </fieldset>
  )
}
