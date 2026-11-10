import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadOnceForStaleChunk } from './lib/staleChunk'

// 배포 뒤 예전 화면 조각(JS·CSS) 미리 받기에 실패하면 새 버전으로 한 번 새로 고침(Vite 공식 vite:preloadError 이벤트)
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForStaleChunk()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
