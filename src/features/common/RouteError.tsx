import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { isStaleChunkError, reloadOnceForStaleChunk } from '../../lib/staleChunk'

// 화면 오류: 새 버전 배포로 예전 화면 조각을 못 받으면 자동으로 한 번 새로 고침, 그 밖에는 안내 + 새로 고침 버튼
export function RouteError() {
  const error = useRouteError()
  const stale = isStaleChunkError(error)
  useEffect(() => {
    if (stale) reloadOnceForStaleChunk()
  }, [stale])

  const notFound = isRouteErrorResponse(error) && error.status === 404
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-bold text-slate-900">
        {stale ? '새 버전을 불러오고 있습니다' : notFound ? '페이지를 찾을 수 없습니다' : '화면을 여는 중 문제가 생겼습니다'}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {stale
          ? '프로그램이 업데이트되었습니다. 잠시 뒤에도 그대로면 새로 고침을 눌러 주세요.'
          : '새로 고침을 눌러 다시 시도해 주세요. 계속되면 담당자에게 알려 주세요.'}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        새로 고침
      </button>
    </div>
  )
}
