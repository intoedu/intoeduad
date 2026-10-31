// 알림 내용 만들기 + 솔라피 인증 서명 — Deno 전용 기능 없이 작성(단위 테스트에서 src/domain/messages.ts와 비교)
// 솔라피 공식 문서(2026-10-31 확인): Authorization: HMAC-SHA256 apiKey=…, date=ISO8601, salt=12~64바이트, signature=HMAC(secret, date+salt)
//   발송: POST https://api.solapi.com/messages/v4/send-many/detail, 알림톡 type "ATA" + kakaoOptions{pfId, templateId, variables{"#{변수}": "값"}, disableSms}
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function dateLongKo(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${y}년 ${m}월 ${d}일(${WEEK[dow]})`;
}

export function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

export function kstDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const date = d.toISOString().slice(0, 10);
  return `${dateLongKo(date)} ${d.toISOString().slice(11, 16)}`;
}

export type ScheduleLine = { kind: "deposit" | "balance" | "extra"; label: string; amount: number; due_date: string; paid?: number };
export type Bank = { bank: string; number: string; holder: string } | null;

function lineText(l: ScheduleLine, withLabel: boolean): string {
  const head = withLabel ? `${l.label} ` : "";
  if (l.paid !== undefined && l.paid >= l.amount) return `${head}${won(l.amount)} (납부 완료)`;
  return `${head}${won(l.amount)} (${dateLongKo(l.due_date)}까지)`;
}

// src/domain/messages.ts paymentNoticeVariables 와 같은 결과(테스트로 확인)
export function paymentNoticeVariables(input: {
  parentName: string;
  studentName: string;
  programName: string;
  startDate: string;
  endDate: string;
  destroyDate: string;
  schedule: ScheduleLine[];
  bank: Bank;
  myUrl: string;
  kakaoUrl: string;
}): Record<string, string> {
  const deposit = input.schedule.find((l) => l.kind === "deposit");
  const balance = input.schedule.find((l) => l.kind === "balance");
  const extras = input.schedule.filter((l) => l.kind === "extra");
  const bank = input.bank && input.bank.bank && input.bank.number;
  return {
    학부모명: input.parentName,
    학생명: input.studentName,
    프로그램명: input.programName,
    일정: `${dateLongKo(input.startDate)} ~ ${dateLongKo(input.endDate)}`,
    예약금: deposit ? lineText(deposit, false) : "없음",
    잔금: balance ? lineText(balance, false) : "없음",
    추가납부: extras.length ? extras.map((l) => lineText(l, true)).join(", ") : "없음",
    입금계좌: bank ? `${input.bank!.bank} ${input.bank!.number}${input.bank!.holder ? ` (예금주 ${input.bank!.holder})` : ""}` : "담당자가 따로 안내드립니다",
    파기일: dateLongKo(input.destroyDate),
    확인링크: input.myUrl,
    카카오채널: input.kakaoUrl,
  };
}

// 템플릿별로 쓰는 변수 (docs/alimtalk-templates.md)
export const TEMPLATE_VARIABLES: Record<string, string[]> = {
  lead_received: ["학부모명", "자녀명", "상담일시", "카카오채널"],
  registration_payment_notice: ["학부모명", "학생명", "프로그램명", "일정", "예약금", "잔금", "추가납부", "입금계좌", "파기일", "확인링크", "카카오채널"],
  registration_waitlisted: ["학부모명", "학생명", "프로그램명", "파기일", "확인링크", "카카오채널"],
  payment_notice_correction: ["학부모명", "학생명", "프로그램명", "예약금", "잔금", "추가납부", "입금계좌", "변경내용", "확인링크", "카카오채널"],
};

// 솔라피 variables 형식: {"#{변수}": "값"} — 값은 한 줄 문자열, 빠지면 보내지 않는다
export function toSolapiVariables(template: string, values: Record<string, string>): Record<string, string> {
  const keys = TEMPLATE_VARIABLES[template];
  if (!keys) throw new Error(`알 수 없는 템플릿: ${template}`);
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = values[k];
    if (v === undefined || v === "") throw new Error(`#{${k}} 값이 없습니다`);
    out[`#{${k}}`] = v.replace(/\s*\n\s*/g, " ");
  }
  return out;
}

// 직원 알림(학부모 개인정보 없음)
export const STAFF_TEXT: Record<string, string> = {
  staff_new_lead: "[인투유학] 신규 상담 신청 1건이 접수되었습니다. 관리자 화면에서 확인해 주세요.",
  staff_new_registration: "[인투유학] 신규 캠프 등록 신청 1건이 접수되었습니다. 관리자 화면에서 확인해 주세요.",
  staff_passport_uploaded: "[인투유학] 여권 사진 업로드 1건이 있습니다. 관리자 화면에서 확인해 주세요.",
  staff_destruction_overdue: "[인투유학] 파기 예정일이 지난 미승인 개인정보가 있습니다. 개인정보 파기 화면에서 처리해 주세요.",
  staff_commission_overdue: "[인투유학] 지급 예정일이 지난 커미션이 있습니다. 커미션 정산 화면에서 확인해 주세요.",
  staff_test: "[인투유학] 알림 발송 테스트입니다.",
};

// 문자 바이트(한글 2바이트) — 90바이트 넘으면 LMS
export function smsType(text: string): "SMS" | "LMS" {
  let bytes = 0;
  for (const ch of text) bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes > 90 ? "LMS" : "SMS";
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 7) return "***";
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function solapiAuthHeader(apiKey: string, apiSecret: string, date = new Date().toISOString(), salt?: string): Promise<string> {
  const s = salt ?? hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date + s)));
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${s}, signature=${signature}`;
}
