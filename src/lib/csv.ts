// CSV 만들기 — 엑셀에서 한글이 깨지지 않게 BOM을 붙이고, 수식으로 실행될 수 있는 값(=,+,-,@로 시작)은 앞에 '를 붙인다
export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined }

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => cell(c.header)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))]
  return '﻿' + lines.join('\r\n')
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
