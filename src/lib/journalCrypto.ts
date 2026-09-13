/**
 * Cifrado de extremo a extremo del diario. Módulo puro: no toca Supabase, no
 * toca React, no guarda nada — solo transforma bytes con `crypto.subtle`.
 *
 * Diseño (ver conversación de diseño para el detalle completo):
 * - Cada nota se cifra con AES-GCM bajo una única clave de datos (DEK) de 256
 *   bits, con un IV aleatorio distinto por nota.
 * - La DEK nunca se guarda en claro. Se guarda envuelta dos veces: una con una
 *   clave derivada de la contraseña, otra con una clave derivada de un código
 *   de recuperación. Cambiar la contraseña solo rehace la primera envoltura.
 * - Las claves de envoltura salen de PBKDF2-HMAC-SHA256 con 600.000
 *   iteraciones y una sal aleatoria distinta para cada envoltura.
 * - No hay verificador de contraseña aparte: si la contraseña (o el código)
 *   es incorrecto, `AES-GCM` falla al desenvolver por la etiqueta de
 *   autenticación, y eso es lo que se interpreta como "credencial incorrecta".
 *
 * Reglas que no se negocian:
 * - La DEK y la contraseña solo viven en memoria (variables locales); nunca
 *   se escriben en localStorage, sessionStorage, IndexedDB, cookies ni URL.
 * - Nunca se registra en consola la DEK, la contraseña ni el código de
 *   recuperación — ni aquí ni en quien llame a este módulo.
 */

// --- Parámetros criptográficos ------------------------------------------

const DEK_BYTES = 32 // 256 bits: la clave que cifra las notas.
const SALT_BYTES = 16 // 128 bits de sal por envoltura, tamaño recomendado para PBKDF2.
const IV_BYTES = 12 // 96 bits de IV, el tamaño recomendado para AES-GCM.
const RECOVERY_CODE_BYTES = 20 // 160 bits para el código de recuperación.
const PBKDF2_ITERATIONS = 600_000

// --- Codificación (base64 para binarios, base32 para el código legible) --

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// RFC 4648 sin relleno: 160 bits caen justo en 32 símbolos, sin "=" al final.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function toBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

/** Agrupa el código en bloques de 4 separados por guiones, para que se pueda leer y copiar a mano. */
function formatRecoveryCode(base32: string): string {
  return (base32.match(/.{1,4}/g) ?? []).join('-')
}

/**
 * Quita guiones/espacios y pasa a mayúsculas, para que dé igual cómo haya
 * tecleado o pegado el usuario el código. Es lo que realmente se usa para
 * derivar la clave, tanto al crear el código como al desenvolver con él.
 */
function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z2-7]/g, '').toUpperCase()
}

/** Genera un código de recuperación nuevo: 160 bits de `crypto.getRandomValues`, nunca `Math.random`. */
function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES))
  return formatRecoveryCode(toBase32(bytes))
}

// --- Envoltura de la DEK (PBKDF2 + AES-GCM) ------------------------------

/** Las dos envolturas de la DEK, listas para guardar en la tabla `journal_key`. */
export interface JournalKeyWrapping {
  wrappedDekPassword: string
  saltPassword: string
  ivPassword: string
  wrappedDekRecovery: string
  saltRecovery: string
  ivRecovery: string
}

/** Solo la envoltura de contraseña, para un cambio de contraseña. */
export type PasswordWrapping = Pick<JournalKeyWrapping, 'wrappedDekPassword' | 'saltPassword' | 'ivPassword'>

async function deriveWrappingKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

interface Wrapped {
  wrapped: string
  salt: string
  iv: string
}

async function wrapDek(dek: Uint8Array, secret: string): Promise<Wrapped> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveWrappingKey(secret, salt)
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dek as BufferSource)
  return { wrapped: toBase64(new Uint8Array(wrapped)), salt: toBase64(salt), iv: toBase64(iv) }
}

/**
 * Intenta desenvolver la DEK con `secret` (contraseña o código de
 * recuperación, ya normalizado). `null` si `secret` es incorrecto: AES-GCM
 * rechaza la etiqueta de autenticación y `decrypt` lanza — eso se captura
 * aquí y se convierte en `null`, nunca en una excepción hacia quien llama.
 */
async function unwrapDek(secret: string, wrapped: string, salt: string, iv: string): Promise<Uint8Array | null> {
  try {
    const key = await deriveWrappingKey(secret, fromBase64(salt))
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(iv) as BufferSource },
      key,
      fromBase64(wrapped) as BufferSource,
    )
    return new Uint8Array(plain)
  } catch {
    return null
  }
}

// --- API pública ----------------------------------------------------------

/** Lo que produce crear una fila de cifrado nueva. `recoveryCode` solo se muestra una vez. */
export interface CreatedJournalKey {
  wrapping: JournalKeyWrapping
  recoveryCode: string
}

/**
 * Genera una DEK nueva y un código de recuperación nuevo, y envuelve la DEK
 * con `password` y con el código. La DEK y `password` no salen de esta
 * función salvo dentro de las envolturas cifradas.
 */
export async function createJournalKey(password: string): Promise<CreatedJournalKey> {
  const dek = crypto.getRandomValues(new Uint8Array(DEK_BYTES))
  const recoveryCode = generateRecoveryCode()

  const [byPassword, byRecovery] = await Promise.all([
    wrapDek(dek, password),
    wrapDek(dek, normalizeRecoveryCode(recoveryCode)),
  ])

  return {
    wrapping: {
      wrappedDekPassword: byPassword.wrapped,
      saltPassword: byPassword.salt,
      ivPassword: byPassword.iv,
      wrappedDekRecovery: byRecovery.wrapped,
      saltRecovery: byRecovery.salt,
      ivRecovery: byRecovery.iv,
    },
    recoveryCode,
  }
}

/** Desenvuelve la DEK con la contraseña. `null` si la contraseña es incorrecta. */
export function unlockWithPassword(
  password: string,
  registro: Pick<JournalKeyWrapping, 'wrappedDekPassword' | 'saltPassword' | 'ivPassword'>,
): Promise<Uint8Array | null> {
  return unwrapDek(password, registro.wrappedDekPassword, registro.saltPassword, registro.ivPassword)
}

/** Desenvuelve la DEK con el código de recuperación. `null` si el código es incorrecto. */
export function unlockWithRecovery(
  codigo: string,
  registro: Pick<JournalKeyWrapping, 'wrappedDekRecovery' | 'saltRecovery' | 'ivRecovery'>,
): Promise<Uint8Array | null> {
  return unwrapDek(
    normalizeRecoveryCode(codigo),
    registro.wrappedDekRecovery,
    registro.saltRecovery,
    registro.ivRecovery,
  )
}

/**
 * Vuelve a envolver la DEK ya conocida con una contraseña nueva. No toca la
 * envoltura de recuperación: el código de recuperación original sigue
 * funcionando después de cambiar la contraseña.
 */
export async function changePassword(dekActual: Uint8Array, nuevaContraseña: string): Promise<PasswordWrapping> {
  const { wrapped, salt, iv } = await wrapDek(dekActual, nuevaContraseña)
  return { wrappedDekPassword: wrapped, saltPassword: salt, ivPassword: iv }
}

/** Una nota cifrada: listo para guardar en `journal_entries.ciphertext` / `.iv`. */
export interface EncryptedNote {
  ciphertext: string
  iv: string
}

/** Cifra el texto de una nota con la DEK y un IV aleatorio nuevo. */
export async function encryptNote(dek: Uint8Array, texto: string): Promise<EncryptedNote> {
  const key = await crypto.subtle.importKey('raw', dek as BufferSource, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(texto) as BufferSource,
  )
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) }
}

/**
 * Descifra una nota con la DEK. `null` si falla (DEK equivocada o datos
 * corruptos) — nunca lanza.
 */
export async function decryptNote(dek: Uint8Array, ciphertext: string, iv: string): Promise<string | null> {
  try {
    const key = await crypto.subtle.importKey('raw', dek as BufferSource, 'AES-GCM', false, ['decrypt'])
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(iv) as BufferSource },
      key,
      fromBase64(ciphertext) as BufferSource,
    )
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}
