// 관리자·직원 직접 입력 공통: 입력 방법, 소개 학원·상담실장 선택, 오류 문구
import { useEffect, useState } from 'react'
import { Field, Input, Select } from '../ui'
import { supabase } from '../../lib/supabase'

export const ENTRY_METHODS = [
  { value: 'phone', label: '전화' },
  { value: 'visit', label: '방문 상담' },
  { value: 'paper', label: '종이 신청서' },
  { value: 'kakao', label: '카카오톡' },
  { value: 'other', label: '기타' },
] as const

export const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '기타']

type Partner = { id: string; name: string; region: string | null; contacts: Array<{ id: string; name: string }> }

// 소개 경로: 학원(+상담실장) 또는 기타 경로
export function PartnerPicker({
  partnerId,
  contactId,
  sourceOther,
  onChange,
}: {
  partnerId: string
  contactId: string
  sourceOther: string
  onChange: (v: { partnerId: string; contactId: string; sourceOther: string }) => void
}) {
  const [partners, setPartners] = useState<Partner[]>([])
  useEffect(() => {
    void supabase
      .from('partners')
      .select('id, name, region, partner_contacts(id, name, active)')
      .eq('active', true)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) =>
        setPartners(
          (data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            region: p.region,
            contacts: ((p.partner_contacts ?? []) as Array<{ id: string; name: string; active: boolean }>).filter((c) => c.active),
          })),
        ),
      )
  }, [])
  const partner = partners.find((p) => p.id === partnerId)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="소개 학원" hint="학원 소개가 아니면 비워 두고 오른쪽에 경로를 적어 주세요">
        <Select value={partnerId} onChange={(e) => onChange({ partnerId: e.target.value, contactId: '', sourceOther })}>
          <option value="">학원 소개 아님</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.region ? ` (${p.region})` : ''}
            </option>
          ))}
        </Select>
      </Field>
      {partner ? (
        <Field label="상담실장 (선택)">
          <Select value={contactId} onChange={(e) => onChange({ partnerId, contactId: e.target.value, sourceOther })}>
            <option value="">선택 안 함</option>
            {partner.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="알게 된 경로 (선택)" hint="예: 지인 소개, 블로그, 설명회">
          <Input value={sourceOther} onChange={(e) => onChange({ partnerId: '', contactId: '', sourceOther: e.target.value })} />
        </Field>
      )}
    </div>
  )
}

const FIELD_LABELS: Record<string, string> = {
  student_name_en: '영문 이름',
  birth_date: '생년월일',
  gender: '성별',
  school: '학교',
  grade: '학년',
  english_level: '영어 수준',
  parent_email: '학부모 이메일',
  address: '주소',
  special_notes: '특이사항',
  emergency: '비상 연락처',
}

// DB 오류 → 화면 문구
export function entryErrorText(error: { message?: string; hint?: string; code?: string } | null): string {
  if (!error) return ''
  if (error.code === '42501') return '권한이 없습니다.'
  const msg = error.message ?? ''
  if (msg.startsWith('필수 입력값을 확인해 주세요:')) {
    const keys = msg.split(':')[1]?.split(',').map((s) => s.trim()) ?? []
    return `이 캠프의 필수 항목을 입력해 주세요: ${keys.map((k) => FIELD_LABELS[k] ?? k).join(', ')}`
  }
  switch (error.hint) {
    case 'DUPLICATE':
      return '이미 같은 학생(이름·학부모 번호)으로 신청된 기록이 있습니다. 등록생 목록에서 확인해 주세요.'
    case 'FULL':
      return '정원이 마감되었고 대기 접수를 쓰지 않는 캠프입니다. 정원을 늘리거나 대기 접수를 켜 주세요.'
    case 'INVALID_INPUT':
      return msg && /[가-힣]/.test(msg) ? `${msg}.` : '입력값을 확인해 주세요.'
  }
  return msg && /[가-힣]/.test(msg) ? msg : '저장하지 못했습니다.'
}
