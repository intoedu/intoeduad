import { useEffect, useId, useRef, useState } from 'react'
import { passportKind } from '../../domain/passport'
import { useLang } from '../../i18n/context'

// 여권 사진 선택: 휴대폰 카메라 바로 촬영 또는 파일 선택, 미리보기
export function PassportPicker({ file, onChange, error }: { file: File | null; onChange: (file: File | null) => void; error?: string }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const id = useId()
  const [preview, setPreview] = useState<string | null>(null)
  const { tr } = useLang()

  useEffect(() => {
    if (!file || !['jpeg', 'png'].includes(passportKind(file.name, file.type) ?? '')) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pick = (f: File | undefined) => onChange(f ?? null)

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-slate-600">
        {tr(
          '항공권 예매를 위해 학생 여권의 사진면(인적사항 면)을 올려 주세요. 여권 정보가 잘 보이도록 빛 반사 없이 촬영해 주세요.',
          "For flight booking, please upload the photo page of the student's passport. Make sure the details are clear and free of glare.",
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="rounded-xl bg-white px-3 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-600"
        >
          {tr('카메라로 촬영', 'Take a photo')}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-xl bg-white px-3 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-300"
        >
          {tr('파일 선택', 'Choose a file')}
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <input
        ref={fileRef}
        id={id}
        type="file"
        aria-label={tr('여권 사진 파일', 'Passport photo file')}
        accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif,application/pdf"
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <p className="text-xs text-slate-500">
        {tr('JPG·PNG·HEIC·PDF, 10MB 이하. 큰 사진은 올리기 전에 자동으로 줄입니다.', 'JPG, PNG, HEIC or PDF, up to 10MB. Large photos are resized automatically.')}
      </p>
      {file && (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          {preview ? (
            <img src={preview} alt={tr('선택한 여권 사진 미리보기', 'Selected passport photo preview')} className="h-16 w-24 rounded object-cover" />
          ) : (
            <span className="flex h-16 w-24 items-center justify-center rounded bg-white text-xs text-slate-500 ring-1 ring-slate-200">
              {passportKind(file.name, file.type)?.toUpperCase() ?? tr('파일', 'File')}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-800">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(1)}MB</p>
          </div>
          <button type="button" className="text-sm text-slate-500 underline" onClick={() => onChange(null)}>
            {tr('빼기', 'Remove')}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
