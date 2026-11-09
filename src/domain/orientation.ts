// 오리엔테이션 일시: 현지(미국) 선생님이 자기 시간으로 넣어도 저장은 절대 시각, 학부모 안내는 한국 시간
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const OT_ZONES = [
  { id: 'Asia/Seoul', label: '한국 시간' },
  { id: 'America/New_York', label: '미국 동부 (뉴욕)' },
  { id: 'America/Chicago', label: '미국 중부 (시카고)' },
  { id: 'America/Denver', label: '미국 산악 (덴버)' },
  { id: 'America/Los_Angeles', label: '미국 서부 (LA)' },
  { id: 'Pacific/Honolulu', label: '미국 하와이' },
  { id: 'Asia/Manila', label: '필리핀' },
] as const
export type OtZone = (typeof OT_ZONES)[number]['id']

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// <input type="datetime-local"> 값(YYYY-MM-DDTHH:mm, 해당 지역 시간) → ISO
export function zonedLocalToIso(local: string, zone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null
  return fromZonedTime(`${local}:00`, zone).toISOString()
}

// ISO → 그 지역의 <input type="datetime-local"> 값
export function isoToZonedLocal(iso: string, zone: string): string {
  return formatInTimeZone(iso, zone, "yyyy-MM-dd'T'HH:mm")
}

// 예: 2026년 12월 15일(화) 10:00 — 알림톡 #{일시}와 같은 모양(뒤에 "(한국 시간)")
export function formatOt(iso: string, zone = 'Asia/Seoul'): string {
  const day = WEEKDAYS[Number(formatInTimeZone(iso, zone, 'i')) % 7]
  return `${formatInTimeZone(iso, zone, 'yyyy년 M월 d일')}(${day}) ${formatInTimeZone(iso, zone, 'HH:mm')}`
}

export function zoneLabel(zone: string): string {
  return OT_ZONES.find((z) => z.id === zone)?.label ?? zone
}

export const OT_NOTICE_LABEL: Record<string, string> = {
  orientation_scheduled: '일정 안내',
  orientation_rescheduled: '변경 안내',
  final_orientation_notice: '최종 OT 안내',
  final_orientation_changed: '최종 OT 변경 안내',
}
