import { Link, useNavigate } from 'react-router'
import { Card, PageHeader } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage } from './api'
import { PartnerForm } from './PartnerForm'

export function PartnerNewPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  return (
    <>
      <PageHeader
        title="학원 등록"
        description="등록 후 상담실장, 협약, 커미션 지급 계좌를 이어서 입력합니다."
        actions={
          <Link to="/admin/partners" className="text-sm text-slate-500 hover:text-slate-800">
            목록으로
          </Link>
        }
      />
      <Card>
        <PartnerForm
          canEditLockedCode={profile?.role === 'admin'}
          submitLabel="학원 등록"
          onSubmit={async (values) => {
            const { data, error } = await supabase.from('partners').insert(values).select('id').single()
            if (error) return errorMessage(error, '학원을 등록하지 못했습니다.')
            navigate(`/admin/partners/${data.id}?tab=contacts`, { replace: true })
            return null
          }}
        />
      </Card>
    </>
  )
}
