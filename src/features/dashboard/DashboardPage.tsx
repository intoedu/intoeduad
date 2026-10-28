import { Card, PageHeader } from '../../components/ui'
import { useAuth } from '../auth/AuthProvider'

// 대시보드 카드(상담 일정·납부 기한·D-Day·파기 승인 등)는 M10에서 채운다
export function DashboardPage() {
  const { profile } = useAuth()

  return (
    <>
      <PageHeader title="대시보드" description={profile ? `${profile.name}님, 안녕하세요.` : undefined} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {['오늘·이번 주 상담', '신규 상담 신청', '이번 주 납부 기한', '여권 미제출', '중요 일정 D-Day', '개인정보 파기 승인'].map(
          (title) => (
            <Card key={title}>
              <p className="text-sm font-medium text-slate-700">{title}</p>
              <p className="mt-2 text-xs text-slate-400">해당 기능 개발 후 표시됩니다.</p>
            </Card>
          ),
        )}
      </div>
    </>
  )
}
