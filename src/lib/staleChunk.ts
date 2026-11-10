// 배포 뒤 오래 열려 있던 화면이 예전 파일 이름으로 화면 조각을 받으려다 실패하는 경우 → 새 버전으로 한 번 새로 고침
// (배포마다 파일 이름이 바뀌고 예전 파일은 사라진다)
const KEY = 'intoedu:stale-chunk-reload'
const WINDOW_MS = 30_000

export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg)
}

// 30초 안에 이미 한 번 새로 고침했으면 다시 하지 않는다(무한 새로 고침 방지). 새로 고침했으면 true
export function reloadOnceForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // 저장소를 못 쓰면 한 번만 시도
  }
  window.location.reload()
  return true
}
