// Token de un solo propósito: "quien lo tenga puede marcar los hábitos sin
// responder de <userId> en <date> como hechos", con caducidad. Viaja dentro
// del payload de la notificación push -- que el propio protocolo Web Push ya
// entrega cifrado de extremo a extremo -- y permite que el botón "Ya los
// hice" del service worker actúe sin tener la sesión de la persona: el
// service worker no tiene acceso a localStorage ni al JWT de supabase-js.
//
// Formato: <base64url(json)>.<base64url(hmac-sha256 del json)>. No es un JWT
// estándar (no hace falta esa complejidad para un solo caso de uso interno),
// pero la idea es la misma: firma que solo quien tiene el secreto pudo crear.

interface ReminderTokenPayload {
  userId: string
  /** El día (YYYY-MM-DD, local del usuario) al que se refiere el recordatorio. */
  date: string
  /** Epoch ms de caducidad. */
  exp: number
}

const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000 // 12 horas: de sobra para un aviso del día

function toBase64Url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const str = atob(padded)
  return Uint8Array.from(str, (c) => c.charCodeAt(0))
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signReminderToken(
  userId: string,
  date: string,
  secret: string,
): Promise<string> {
  const payload: ReminderTokenPayload = { userId, date, exp: Date.now() + TOKEN_LIFETIME_MS }
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${toBase64Url(new Uint8Array(signature))}`
}

/** Verifica el token; lanza si la firma no coincide o si ya caducó. */
export async function verifyReminderToken(
  token: string,
  secret: string,
): Promise<{ userId: string; date: string }> {
  const [payloadB64, sigB64] = token.split('.')
  if (!payloadB64 || !sigB64) throw new Error('Token con formato inválido')

  const key = await hmacKey(secret)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64),
    new TextEncoder().encode(payloadB64),
  )
  if (!valid) throw new Error('Firma del token inválida')

  const payload = JSON.parse(
    new TextDecoder().decode(fromBase64Url(payloadB64)),
  ) as ReminderTokenPayload
  if (Date.now() > payload.exp) throw new Error('El token caducó')

  return { userId: payload.userId, date: payload.date }
}
