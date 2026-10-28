import { Card, PageHeader } from '../../components/ui'

export function ComingSoonPage({ title, milestone }: { title: string; milestone: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className="text-sm text-slate-600">
          이 화면은 개발 단계 <strong>{milestone}</strong>에서 만들어집니다.
        </p>
      </Card>
    </>
  )
}

export function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-semibold text-slate-800">페이지를 찾을 수 없습니다</p>
      <a href="/admin" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
        관리자 화면으로 이동
      </a>
    </div>
  )
}
