import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Card, EmptyState, Input, PageHeader, Select, Spinner } from '../../components/ui'
import { formatPhone } from '../../domain/phone'
import { AGREEMENT_STATUS, AGREEMENT_TYPE_LABELS } from '../../lib/labels'
import { listPartners, type PartnerListItem } from './api'

export function PartnersListPage() {
  const [items, setItems] = useState<PartnerListItem[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')

  useEffect(() => {
    listPartners()
      .then(setItems)
      .catch(() => setError('학원 목록을 불러오지 못했습니다.'))
  }, [])

  const regions = useMemo(
    () => [...new Set((items ?? []).map((p) => p.region?.split(/\s+/)[0]).filter(Boolean) as string[])].sort(),
    [items],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (items ?? []).filter((p) => {
      if (status === 'active' && !p.active) return false
      if (status === 'inactive' && p.active) return false
      if (region && !p.region?.startsWith(region)) return false
      if (!q) return true
      return [p.name, p.region, p.director_name, p.code, p.phone].some((v) => v?.toLowerCase().includes(q))
    })
  }, [items, query, region, status])

  return (
    <>
      <PageHeader
        title="MOU 학원"
        description="파트너 학원과 상담실장, 협약, 신청 링크·QR을 관리합니다."
        actions={
          <Link to="/admin/partners/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            + 학원 등록
          </Link>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_160px_140px]">
        <Input placeholder="학원명·지역·원장님·코드 검색" aria-label="검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select aria-label="지역" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">전체 지역</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select aria-label="상태" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="active">활성 학원</option>
          <option value="inactive">비활성 학원</option>
          <option value="all">전체</option>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!items && !error && <Spinner />}
      {items && filtered.length === 0 && <EmptyState>조건에 맞는 학원이 없습니다.</EmptyState>}

      <div className="space-y-3">
        {filtered.map((p) => {
          const st = p.agreement?.status ? AGREEMENT_STATUS[p.agreement.status] : null
          return (
            <Link key={p.id} to={`/admin/partners/${p.id}`} className="block">
              <Card className="transition hover:ring-brand-600/40">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      {!p.active && <Badge tone="red">비활성</Badge>}
                      {p.agreement ? (
                        <>
                          <Badge tone={p.agreement.agreement_type === 'exclusive' ? 'amber' : 'gray'}>
                            {AGREEMENT_TYPE_LABELS[p.agreement.agreement_type ?? 'basic']}
                          </Badge>
                          {st && <Badge tone={st.tone}>{st.label}</Badge>}
                        </>
                      ) : (
                        <Badge tone="red">협약 정보 없음</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {[p.region, p.director_name && `${p.director_name} 원장`, formatPhone(p.phone)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <dl className="grid shrink-0 grid-cols-3 gap-4 text-center text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">담당자</dt>
                      <dd className="font-semibold">{p.contactCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">상담 신청</dt>
                      <dd className="font-semibold">{p.leadCount}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">등록</dt>
                      <dd className="font-semibold">{p.registrationCount}</dd>
                    </div>
                  </dl>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </>
  )
}
