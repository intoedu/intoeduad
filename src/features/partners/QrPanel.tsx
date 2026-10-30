import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Badge, Button } from '../../components/ui'

type Props = {
  title: string
  url: string
  fileBaseName: string
  locked: boolean
  // 처음 배포(복사·다운로드)할 때 코드를 잠근다
  onLock: () => Promise<boolean>
}

// Blob URL로 내려받아야 파일 이름이 지켜진다. 다운로드가 시작될 시간을 준 뒤 URL을 해제한다.
function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

export function QrPanel({ title, url, fileBaseName, locked, onLock }: Props) {
  const [preview, setPreview] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 1, errorCorrectionLevel: 'M' }).then(setPreview)
  }, [url])

  async function ensureLocked(): Promise<boolean> {
    if (locked) return true
    const ok = window.confirm(
      '이 링크를 배포하면 코드가 잠겨 더 이상 바꿀 수 없습니다.\n(이미 나간 QR·링크가 깨지지 않도록 하기 위함입니다)\n계속할까요?',
    )
    if (!ok) return false
    return onLock()
  }

  async function copy() {
    if (!(await ensureLocked())) return
    await navigator.clipboard.writeText(url)
    setNotice('링크를 복사했습니다.')
  }

  async function downloadPng() {
    if (!(await ensureLocked())) return
    const dataUrl = await QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' })
    download(await (await fetch(dataUrl)).blob(), `${fileBaseName}.png`)
  }

  async function downloadSvg() {
    if (!(await ensureLocked())) return
    const svg = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })
    download(new Blob([svg], { type: 'image/svg+xml' }), `${fileBaseName}.svg`)
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:flex-row">
      {preview && <img src={preview} alt={`${title} QR 코드`} className="size-32 shrink-0 self-center rounded-lg ring-1 ring-slate-200" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{title}</p>
          {locked ? <Badge tone="green">배포됨 · 코드 잠금</Badge> : <Badge>배포 전</Badge>}
        </div>
        <p className="mt-1 break-all font-mono text-xs text-slate-600">{url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void copy()}>
            링크 복사
          </Button>
          <Button variant="secondary" onClick={() => void downloadPng()}>
            QR PNG
          </Button>
          <Button variant="secondary" onClick={() => void downloadSvg()}>
            QR SVG
          </Button>
        </div>
        {notice && <p className="mt-2 text-xs text-green-700">{notice}</p>}
      </div>
    </div>
  )
}
