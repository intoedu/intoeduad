import { fitWithin, PASSPORT_MAX_BYTES, passportKind } from '../../domain/passport'
import { supabase } from '../../lib/supabase'
import { SubmitError } from './publicApi'

export type PassportInfo = {
  student_name: string
  program_name: string
  passport_status: string
  allowed: boolean
  consent: { kind: string; version: number; title: string; body: string } | null
}

async function canvasToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')
  if (!g) throw new Error('canvas')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, width, height)
  g.drawImage(source, 0, 0, width, height)
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.88))
}

// 올리기 전 처리: HEIC → JPEG 변환, 큰 사진은 긴 변 2400px로 줄여 JPEG. PDF는 그대로.
export async function preparePassportFile(file: File): Promise<File> {
  const kind = passportKind(file.name, file.type)
  if (!kind) throw new SubmitError('JPG·PNG·HEIC·PDF 파일만 올릴 수 있습니다.')
  if (kind === 'pdf') {
    if (file.size > PASSPORT_MAX_BYTES) throw new SubmitError('10MB 이하의 파일만 올릴 수 있습니다.')
    return file
  }

  let bitmap: ImageBitmap
  try {
    if (kind === 'heic') {
      // 아이폰 HEIC는 필요할 때만 변환 도구를 내려받는다
      const { heicTo } = await import('heic-to/csp')
      bitmap = await heicTo({ blob: file, type: 'bitmap' })
    } else {
      bitmap = await createImageBitmap(file)
    }
  } catch {
    // 브라우저가 해석하지 못하는 사진은 원본 그대로(서버가 형식을 다시 확인)
    if (file.size > PASSPORT_MAX_BYTES) throw new SubmitError('10MB 이하의 파일만 올릴 수 있습니다.')
    return file
  }

  const size = fitWithin(bitmap.width, bitmap.height)
  if (!size.scaled && kind !== 'heic' && file.size <= 3 * 1024 * 1024) {
    bitmap.close()
    return file
  }
  const blob = await canvasToJpeg(bitmap, size.width, size.height)
  bitmap.close()
  if (blob.size > PASSPORT_MAX_BYTES) throw new SubmitError('사진이 너무 큽니다. 다시 촬영해 주세요.')
  return new File([blob], 'passport.jpg', { type: 'image/jpeg' })
}

async function errorFrom(error: unknown, fallback: string): Promise<SubmitError> {
  let message = fallback
  let code: string | undefined
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    try {
      const payload = await context.json()
      if (payload?.error) message = payload.error
      code = payload?.code
    } catch {
      // 본문이 JSON이 아니면 기본 메시지
    }
  }
  return new SubmitError(message, code)
}

export async function getPassportInfo(token: string): Promise<PassportInfo> {
  const { data, error } = await supabase.functions.invoke<PassportInfo>('passport-upload', { body: { token } })
  if (error) throw await errorFrom(error, '링크가 올바르지 않거나 만료되었습니다.')
  return data as PassportInfo
}

export async function uploadPassport(token: string, file: File, consent: boolean): Promise<void> {
  const prepared = await preparePassportFile(file)
  const form = new FormData()
  form.append('token', token)
  form.append('consent', consent ? 'true' : 'false')
  form.append('file', prepared, prepared.name)
  const { error } = await supabase.functions.invoke('passport-upload', { body: form })
  if (error) throw await errorFrom(error, '여권 사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.')
}
