import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type StaffRole } from '../../lib/labels'
import { invokeFunction, supabase, type Tables } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

type Staff = Tables<'staff_profiles'>
type ProgramOption = Pick<Tables<'programs'>, 'id' | 'name' | 'season'>

const ROLES: StaffRole[] = ['admin', 'staff', 'viewer']
const redirectTo = () => `${window.location.origin}/auth/set-password`

export function StaffPage() {
  const { profile: me } = useAuth()
  const [staff, setStaff] = useState<Staff[]>([])
  const [programs, setPrograms] = useState<ProgramOption[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [staffRes, programRes, assignRes] = await Promise.all([
      supabase.from('staff_profiles').select('*').order('active', { ascending: false }).order('name'),
      supabase.from('programs').select('id, name, season').is('deleted_at', null).order('start_date', { ascending: false }),
      supabase.from('staff_program_assignments').select('staff_id, program_id'),
    ])
    setStaff(staffRes.data ?? [])
    setPrograms(programRes.data ?? [])
    const map: Record<string, string[]> = {}
    for (const row of assignRes.data ?? []) {
      ;(map[row.staff_id] ??= []).push(row.program_id)
    }
    setAssignments(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function notify(tone: 'green' | 'red', text: string) {
    setMessage({ tone, text })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function updateStaff(member: Staff, patch: Partial<Staff>) {
    const next = { ...patch }
    if (next.role === 'viewer') next.can_view_passport = false
    const { error } = await supabase.from('staff_profiles').update(next).eq('id', member.id)
    if (error) {
      notify('red', error.message.includes('최소 1명') ? error.message : '변경하지 못했습니다.')
    } else {
      notify('green', `${member.name}님의 정보를 변경했습니다.`)
    }
    await load()
  }

  async function setActive(member: Staff, active: boolean) {
    const verb = active ? '다시 활성화' : '비활성화'
    if (!window.confirm(`${member.name}님을 ${verb}할까요?${active ? '' : '\n비활성화하면 즉시 로그인과 데이터 접근이 차단됩니다.'}`)) return
    try {
      await invokeFunction('admin-staff', { action: 'set_active', id: member.id, active })
      notify('green', `${member.name}님을 ${verb}했습니다.`)
    } catch (e) {
      notify('red', (e as Error).message)
    }
    await load()
  }

  async function resendInvite(member: Staff) {
    try {
      await invokeFunction('admin-staff', { action: 'resend_invite', id: member.id, redirect_to: redirectTo() })
      notify('green', `${member.email}로 초대 메일을 다시 보냈습니다.`)
    } catch (e) {
      notify('red', (e as Error).message)
    }
  }

  async function toggleAssignment(member: Staff, programId: string, assigned: boolean) {
    const { error } = assigned
      ? await supabase.from('staff_program_assignments').insert({ staff_id: member.id, program_id: programId })
      : await supabase.from('staff_program_assignments').delete().eq('staff_id', member.id).eq('program_id', programId)
    if (error) notify('red', '담당 프로그램을 변경하지 못했습니다.')
    await load()
  }

  if (loading) return <Spinner />

  return (
    <>
      <PageHeader title="직원 관리" description="직원은 관리자 초대로만 추가됩니다. 초대 메일의 링크에서 비밀번호를 설정하면 로그인할 수 있습니다." />
      {message && (
        <div className="mb-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      <InviteForm
        onInvited={async (email) => {
          notify('green', `${email}로 초대 메일을 보냈습니다.`)
          await load()
        }}
        onError={(text) => notify('red', text)}
      />

      <div className="mt-6 space-y-3">
        {staff.map((member) => {
          const isMe = member.id === me?.id
          const role = member.role as StaffRole
          return (
            <Card key={member.id} className={member.active ? '' : 'opacity-60'}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{member.name}</p>
                    {isMe && <Badge tone="blue">나</Badge>}
                    {!member.active && <Badge tone="red">비활성</Badge>}
                    {member.can_view_passport && role !== 'viewer' && <Badge tone="amber">여권 열람</Badge>}
                  </div>
                  <p className="mt-0.5 break-all text-sm text-slate-500">{member.email}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:w-[520px]">
                  <Field label="역할">
                    <Select
                      value={role}
                      disabled={!member.active}
                      onChange={(e) => void updateStaff(member, { role: e.target.value })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="소속 팀">
                    <Input
                      defaultValue={member.team ?? ''}
                      placeholder="예: 행정팀, 미국"
                      disabled={!member.active}
                      onBlur={(e) => {
                        const team = e.target.value.trim() || null
                        if (team !== member.team) void updateStaff(member, { team })
                      }}
                    />
                  </Field>
                  <div>
                    <p className="mb-1 text-sm font-medium text-slate-700">여권 열람</p>
                    <label className="flex h-[38px] items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={role === 'admin' || member.can_view_passport}
                        disabled={!member.active || role !== 'staff'}
                        onChange={(e) => void updateStaff(member, { can_view_passport: e.target.checked })}
                      />
                      {role === 'viewer' ? '불가 (현지 팀)' : role === 'admin' ? '항상 허용 (관리자)' : '허용'}
                    </label>
                  </div>
                </div>
              </div>

              {role === 'viewer' && member.active && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-sm font-medium text-slate-700">담당 프로그램</p>
                  {programs.length === 0 ? (
                    <p className="text-xs text-slate-500">등록된 프로그램이 없습니다.</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {programs.map((p) => {
                        const checked = assignments[member.id]?.includes(p.id) ?? false
                        return (
                          <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={checked}
                              onChange={(e) => void toggleAssignment(member, p.id, e.target.checked)}
                            />
                            {p.name}
                            {p.season && <span className="text-slate-400">({p.season})</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {!isMe && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {member.active && (
                    <Button variant="secondary" onClick={() => void resendInvite(member)}>
                      초대 메일 재발송
                    </Button>
                  )}
                  <Button variant={member.active ? 'danger' : 'secondary'} onClick={() => void setActive(member, !member.active)}>
                    {member.active ? '비활성화' : '다시 활성화'}
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}

function InviteForm({ onInvited, onError }: { onInvited: (email: string) => Promise<void>; onError: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<StaffRole>('staff')
  const [team, setTeam] = useState('')
  const [canViewPassport, setCanViewPassport] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await invokeFunction('admin-staff', {
        action: 'invite',
        email,
        name,
        role,
        team,
        can_view_passport: role === 'staff' && canViewPassport,
        redirect_to: redirectTo(),
      })
      const invited = email
      setEmail('')
      setName('')
      setTeam('')
      setCanViewPassport(false)
      setOpen(false)
      await onInvited(invited)
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ 직원 초대</Button>
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="font-semibold text-slate-900">직원 초대</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="이름">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="이메일">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="역할" hint={ROLE_DESCRIPTIONS[role]}>
            <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="소속 팀 (선택)">
            <Input value={team} placeholder="예: 행정팀, 필리핀" onChange={(e) => setTeam(e.target.value)} />
          </Field>
        </div>
        {role === 'staff' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-4" checked={canViewPassport} onChange={(e) => setCanViewPassport(e.target.checked)} />
            여권 사진 열람 권한 부여
          </label>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? '보내는 중…' : '초대 메일 보내기'}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            취소
          </Button>
        </div>
      </form>
    </Card>
  )
}
