// 여권 파일 암호화 (AES-256-GCM, Web Crypto)
// - 키는 Edge Function 시크릿 PASSPORT_KEY_V{버전} (32바이트를 base64로). 저장소·DB에는 절대 두지 않는다.
// - 등록생 ID를 추가 인증 데이터(AAD)로 묶어, 암호문을 다른 등록생 파일로 바꿔치기하면 복호화되지 않게 한다.
// passport-upload / passport-admin / destruction 함수가 같은 파일을 쓴다(수정 시 함께 복사).
export const CURRENT_KEY_VERSION = 1;
export const MAX_BYTES = 10 * 1024 * 1024;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function getKey(version: number): Promise<CryptoKey> {
  const b64 = Deno.env.get(`PASSPORT_KEY_V${version}`);
  if (!b64) throw new Error(`PASSPORT_KEY_V${version} not set`);
  const raw = fromBase64(b64);
  if (raw.length !== 32) throw new Error("passport key must be 32 bytes");
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptFile(plain: Uint8Array, registrationId: string) {
  const key = await getKey(CURRENT_KEY_VERSION);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(registrationId) },
      key,
      plain,
    ),
  );
  return { cipher, iv: toBase64(iv), keyVersion: CURRENT_KEY_VERSION };
}

export async function decryptFile(cipher: Uint8Array, ivB64: string, keyVersion: number, registrationId: string) {
  const key = await getKey(keyVersion);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(ivB64), additionalData: new TextEncoder().encode(registrationId) },
      key,
      cipher,
    ),
  );
}

// 파일 앞부분(매직 바이트)으로 실제 형식 확인 — 확장자·브라우저가 알려 준 형식은 믿지 않는다
export function detectMime(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "application/pdf";
  if (b.length >= 12) {
    const box = new TextDecoder().decode(b.subarray(4, 12));
    if (/^ftyp(heic|heix|hevc|hevx|heim|heis)/.test(box)) return "image/heic";
    if (/^ftyp(mif1|msf1)/.test(box)) return "image/heif";
  }
  return null;
}

export function clientIp(req: Request): string | null {
  const v = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(v) ? v : null;
}
