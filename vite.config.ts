import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 필요할 때만 불러오는 HEIC 변환 도구도 개발 서버가 미리 묶어 두게 한다(첫 사용 시 화면 새로고침 방지)
  optimizeDeps: { include: ['heic-to'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
