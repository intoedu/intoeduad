import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Card, Field, Input, Select } from '../../components/ui'
import { formatKst, formatKstWithDay, isoToKstLocal, kstLocalToIso } from '../../lib/datetime'
import { CONSULT_METHOD, CONSULT_STATUS } from '../../lib/labels'
import { supabase } from '../../lib/supabase'
import type { Consultation } from './api'

type SlotOption = { id: string; starts_at: string }

function slotError(message: string): string {
  return message.includes('예약할 수 없습니다') ? '선택한 시간은 이미 찼거나 닫힌 시간입니다. 다른 시간을 골라 주세요.' : '저장하지 못했습니다.'
}

// 상담 한 건: 방식(전화/화상) 지정, 화상 링크, 일정 변경, 상태(완료·취소·노쇼)
export function ConsultationCard({ consultation, onChanged }: { consultation: Consultation; onChanged: () => Promise<void> }) {
  const c = consultation
  const [meetingUrl, setMeetingUrl] = useState(c.meeting_url ?? '')
  const [rescheduling, setRescheduling] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const st = CONSULT_STATUS[c.status]
  const closed = c.status === 'canceled'

  async function update(patch: Partial<Consultation>, success: string) {
    setError('')
    setNotice('')
    const { error } = await supabase.from('consultations').update(patch).eq('id', c.id)
    if (error) {
      setError(error.code === '23514' ? '화상 회의 링크는 http:// 또는 https:// 로 시작해야 합니다.' : slotError(error.message))
      return false
    }
    setNotice(success)
    await onChanged()
    return true
  }

  return (
    <Card className={closed ? 'opacity-70' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-slate-900">{c.scheduled_at ? formatKstWithDay(c.scheduled_at) : '상담 일정 미정'}</p>
          {st && <Badge tone={st.tone}>{st.label}</Badge>}
          {c.method === 'undecided' && !closed && <Badge tone="red">상담 방식 미정</Badge>}
        </div>
        {!closed && (
          <Button variant="ghost" onClick={() => setRescheduling((v) => !v)}>
            {rescheduling ? '일정 변경 닫기' : '일정 변경'}
          </Button>
        )}
      </div>

      {!closed && (
        <div className="mt-4 space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">상담 방식 (문의 내용을 보고 담당자가 결정)</legend>
            <div className="flex flex-wrap gap-2">
              {(['phone', 'video', 'undecided'] as const).map((m) => (
                <label
                  key={m}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm ring-1 ${
                    c.method === m ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`method-${c.id}`}
                    checked={c.method === m}
                    onChange={() => void update({ method: m }, `상담 방식을 "${CONSULT_METHOD[m]}"(으)로 정했습니다.`)}
                  />
                  {CONSULT_METHOD[m]}
                </label>
              ))}
            </div>
          </fieldset>

          {c.method === 'video' && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="화상 회의 링크">
                  <Input placeholder="https://" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} />
                </Field>
              </div>
              <Button variant="secondary" onClick={() => void update({ meeting_url: meetingUrl.trim() || null }, '화상 회의 링크를 저장했습니다.')}>
                링크 저장
              </Button>
            </div>
          )}

          {rescheduling && (
            <Reschedule
              consultation={c}
              onSave={async (patch) => {
                if (await update(patch, '상담 일정을 변경했습니다.')) setRescheduling(false)
              }}
            />
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {c.status !== 'done' && (
              <Button variant="secondary" onClick={() => void update({ status: 'done' }, '상담 완료로 기록했습니다.')}>
                상담 완료
              </Button>
            )}
            {c.status !== 'no_show' && (
              <Button variant="secondary" onClick={() => void update({ status: 'no_show' }, '노쇼로 기록했습니다.')}>
                노쇼
              </Button>
            )}
            {c.status !== 'scheduled' && (
              <Button variant="ghost" onClick={() => void update({ status: 'scheduled' }, '예정으로 되돌렸습니다.')}>
                예정으로 되돌리기
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('이 상담을 취소할까요? 예약했던 시간은 다시 열립니다.')) {
                  void update({ status: 'canceled' }, '상담을 취소했습니다.')
                }
              }}
            >
              상담 취소
            </Button>
          </div>
        </div>
      )}
      {c.decided_at && <p className="mt-3 text-xs text-slate-500">방식 결정 {formatKstWithDay(c.decided_at)}</p>}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
    </Card>
  )
}

// 일정 변경: 열려 있는 상담 시간에서 고르거나, 시간 외 일정은 직접 입력
function Reschedule({
  consultation,
  onSave,
}: {
  consultation: Consultation
  onSave: (patch: Partial<Consultation>) => Promise<void>
}) {
  const [slots, setSlots] = useState<SlotOption[] | null>(null)
  const [slotId, setSlotId] = useState('')
  const [manual, setManual] = useState(isoToKstLocal(consultation.scheduled_at))

  useEffect(() => {
    supabase
      .from('consultation_slots')
      .select('id, starts_at, booked_count, capacity')
      .eq('is_open', true)
      .gt('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(400)
      .then(({ data }) => setSlots((data ?? []).filter((s) => s.booked_count < s.capacity && s.id !== consultation.slot_id)))
  }, [consultation.slot_id])

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="열려 있는 상담 시간에서 고르기">
            <Select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
              <option value="">{slots ? `선택 (${slots.length}개)` : '불러오는 중…'}</option>
              {slots?.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatKstWithDay(s.starts_at)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button disabled={!slotId} onClick={() => void onSave({ slot_id: slotId })}>
          이 시간으로 변경
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="상담 시간 외 일정 직접 입력" hint="상담 시간표와 별개로 잡은 일정 (시간표의 자리는 비워 줍니다)">
            <Input type="datetime-local" value={manual} onChange={(e) => setManual(e.target.value)} />
          </Field>
        </div>
        <Button
          variant="secondary"
          disabled={!manual}
          onClick={() => void onSave({ slot_id: null, scheduled_at: kstLocalToIso(manual) })}
        >
          직접 입력으로 변경
        </Button>
      </div>
      {consultation.scheduled_at && (
        <p className="text-xs text-slate-500">현재: {formatKst(consultation.scheduled_at, 'yyyy-MM-dd HH:mm')}</p>
      )}
    </div>
  )
}
