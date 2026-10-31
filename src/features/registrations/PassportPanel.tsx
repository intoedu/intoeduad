import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Card, Field, Select } from '../../components/ui'
import { publicSiteUrl } from '../../domain/links'
import { watermarkText } from '../../domain/passport'
import { formatKst } from '../../lib/datetime'
import { PASSPORT_STATUS } from '../../lib/labels'
import { invokeFunction, supabase, type Tables } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

type PassportFile = Pick<Tables<'passport_files'>, 'id' | 'uploaded_at' | 'mime_type' | 'size_bytes'>
type Opened = { mime: string; url: string; watermark: string; bytes: Uint8Array<ArrayBuffer> }

const DELETE_REASONS = [
  { value: 'manual', label: '담당자 판단(재촬영 요청 등)' },
  { value: 'consent_withdrawn', label: '동의 철회' },
  { value: 'canceled', label: '참가 취소' },
]

function decode(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// 이미지에 워터마크를 비스듬히 반복해서 그린다(열람·다운로드 공통)
async function drawWatermarked(canvas: HTMLCanvasElement, url: string, text: string) {
  const img = new Image()
  img.src = url
  await img.decode()
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const g = canvas.getContext('2d')!
  g.drawImage(img, 0, 0)
  const size = Math.max(16, Math.round(canvas.width / 28))
  g.font = `bold ${size}px sans-serif`
  g.fillStyle = 'rgba(220, 38, 38, 0.28)'
  g.save()
  g.translate(canvas.width / 2, canvas.height / 2)
  g.rotate(-Math.PI / 7)
  const step = size * 4
  for (let y = -canvas.height; y < canvas.height; y += step) {
    for (let x = -canvas.width; x < canvas.width; x += g.measureText(text).width + size * 2) g.fillText(text, x, y)
  }
  g.restore()
}

// 등록생 상세의 여권 사진 칸 — 열람(권한자), 다운로드(관리자), 삭제, 제출 링크
export function PassportPanel({ registrationId, passportStatus, onChanged }: { registrationId: string; passportStatus: string; onChanged: () => void }) {
  const { profile } = useAuth()
  const canView = !!profile?.can_view_passport && profile.role !== 'viewer'
  const isAdmin = profile?.role === 'admin'
  const [file, setFile] = useState<PassportFile | null>(null)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [reason, setReason] = useState('manual')
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const load = useCallback(async () => {
    if (!canView) return
    const { data } = await supabase
      .from('passport_files')
      .select('id, uploaded_at, mime_type, size_bytes')
      .eq('registration_id', registrationId)
      .is('deleted_at', null)
      .maybeSingle()
    setFile(data)
  }, [canView, registrationId])

  useEffect(() => {
    void load()
  }, [load, passportStatus])

  useEffect(() => {
    if (opened && opened.mime.startsWith('image/') && canvasRef.current) void drawWatermarked(canvasRef.current, opened.url, opened.watermark)
  }, [opened])

  function close() {
    if (opened) URL.revokeObjectURL(opened.url)
    setOpened(null)
  }

  async function fetchFile(action: 'view' | 'download') {
    if (!file) return null
    setBusy(true)
    setMessage(null)
    try {
      const res = await invokeFunction<{ mime: string; data: string; viewer: string; at: string }>('passport-admin', { action, file_id: file.id })
      const bytes = decode(res.data)
      const url = URL.createObjectURL(new Blob([bytes], { type: res.mime }))
      return { mime: res.mime, url, bytes, watermark: watermarkText(res.viewer, formatKst(res.at)) }
    } catch (e) {
      setMessage({ tone: 'red', text: (e as Error).message })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function view() {
    close()
    const f = await fetchFile('view')
    if (f) setOpened(f)
  }

  async function download() {
    const f = await fetchFile('download')
    if (!f) return
    const a = document.createElement('a')
    if (f.mime.startsWith('image/') && f.mime !== 'image/heic' && f.mime !== 'image/heif') {
      const canvas = document.createElement('canvas')
      await drawWatermarked(canvas, f.url, f.watermark)
      a.href = canvas.toDataURL('image/jpeg', 0.92)
      a.download = `passport_${registrationId.slice(0, 8)}.jpg`
    } else {
      a.href = f.url
      a.download = `passport_${registrationId.slice(0, 8)}.${f.mime === 'application/pdf' ? 'pdf' : 'heic'}`
    }
    a.click()
    setTimeout(() => URL.revokeObjectURL(f.url), 1000)
    setMessage({ tone: 'green', text: '다운로드했습니다. 사용 후 바로 지워 주세요(다운로드 기록이 남습니다).' })
  }

  async function remove() {
    if (!file) return
    if (!window.confirm('여권 사진을 삭제할까요? 저장소에서 실제로 지워지며 되돌릴 수 없습니다.')) return
    setBusy(true)
    try {
      await invokeFunction('passport-admin', { action: 'delete', file_id: file.id, reason })
      close()
      setMessage({ tone: 'green', text: '여권 사진을 삭제했습니다.' })
      onChanged()
    } catch (e) {
      setMessage({ tone: 'red', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function makeLink() {
    const { data, error } = await supabase.rpc('create_passport_link', { p_registration_id: registrationId })
    if (error || !data) return setMessage({ tone: 'red', text: /[가-힣]/.test(error?.message ?? '') ? error!.message : '링크를 만들지 못했습니다.' })
    const url = `${publicSiteUrl()}/passport/${data}`
    setLink(url)
    try {
      await navigator.clipboard.writeText(url)
      setMessage({ tone: 'green', text: '여권 제출 링크를 복사했습니다(14일 유효). 카카오톡으로 보내 주세요.' })
    } catch {
      setMessage({ tone: 'green', text: '여권 제출 링크를 만들었습니다(14일 유효). 아래 주소를 복사해 주세요.' })
    }
  }

  const tone = passportStatus === 'submitted' ? 'green' : passportStatus === 'pending' ? 'amber' : 'gray'
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900">여권 사진</p>
          <Badge tone={tone}>{PASSPORT_STATUS[passportStatus] ?? passportStatus}</Badge>
        </div>
        {passportStatus !== 'not_required' && (
          <Button variant="secondary" onClick={() => void makeLink()}>
            제출 링크 만들기
          </Button>
        )}
      </div>
      {message && (
        <div className="mb-3">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
      {link && <p className="mb-3 font-mono text-xs break-all text-slate-600">{link}</p>}
      {!canView ? (
        <p className="text-sm text-slate-500">여권 사진은 관리자가 열람 권한을 준 직원만 볼 수 있습니다.</p>
      ) : file ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {formatKst(file.uploaded_at)} 제출 · {file.mime_type === 'application/pdf' ? 'PDF' : file.mime_type.replace('image/', '').toUpperCase()} · 암호화 보관
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void view()} disabled={busy}>
              열람
            </Button>
            {isAdmin && (
              <Button variant="secondary" onClick={() => void download()} disabled={busy}>
                다운로드(관리자)
              </Button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="삭제 사유">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {DELETE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="danger" onClick={() => void remove()} disabled={busy}>
              여권 사진 삭제
            </Button>
          </div>
          <p className="text-xs text-slate-500">열람·다운로드·삭제는 모두 접속 기록(관리자 전용)에 남습니다.</p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">제출된 여권 사진이 없습니다.</p>
      )}

      {opened && (
        <div role="dialog" aria-modal="true" aria-label="여권 사진 열람" className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-4" onClick={close}>
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between pb-2 text-sm text-white">
            <span>{opened.watermark}</span>
            <button type="button" className="rounded bg-white/20 px-3 py-1" onClick={close}>
              닫기
            </button>
          </div>
          <div className="relative mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-auto rounded bg-white" onClick={(e) => e.stopPropagation()}>
            {opened.mime === 'application/pdf' ? (
              <>
                <iframe title="여권 PDF" src={opened.url} className="h-full min-h-[70vh] w-full" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-bold text-red-600/30 select-none">
                  {opened.watermark}
                </div>
              </>
            ) : opened.mime === 'image/heic' || opened.mime === 'image/heif' ? (
              <p className="p-6 text-sm text-slate-600">HEIC 원본이라 이 브라우저에서 바로 볼 수 없습니다. 관리자 다운로드로 확인해 주세요.</p>
            ) : (
              <canvas ref={canvasRef} aria-label="워터마크가 들어간 여권 사진" className="h-auto w-full" onContextMenu={(e) => e.preventDefault()} />
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
