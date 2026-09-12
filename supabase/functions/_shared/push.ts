// Envío de Web Push compartido entre send-test-push y send-reminders. Un solo
// sitio con la llamada a npm:web-push, para no duplicar la lógica de envío
// (ni sus fallos) entre las dos funciones. `_shared` es la convención de
// Supabase para código común entre Edge Functions: no se despliega como
// función propia.

import webpush from 'npm:web-push@3'

export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

export interface SendResult {
  enviados: number
  fallidos: number
  /** Endpoints que fallaron con 404/410: la suscripción ya no existe en el navegador. */
  expirados: string[]
}

/**
 * Envía `payload` (se serializa a JSON) a cada suscripción. Nunca lanza: los
 * fallos individuales se cuentan y se registran, no interrumpen el resto.
 */
export async function sendPushToAll(
  subs: PushSubscriptionRow[],
  payload: unknown,
  vapid: VapidConfig,
): Promise<SendResult> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const body = JSON.stringify(payload)

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
        .catch((err: unknown) => {
          // Se relanza con el endpoint adjunto para poder identificar
          // suscripciones caducadas (404/410) más abajo.
          throw Object.assign(err as object, { endpoint: s.endpoint })
        }),
    ),
  )

  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  for (const f of failed) {
    console.error('sendPushToAll: fallo al enviar a una suscripción', String(f.reason))
  }

  const expirados = failed
    .filter((f) => {
      const reason = f.reason as { statusCode?: number } | undefined
      return reason?.statusCode === 404 || reason?.statusCode === 410
    })
    .map((f) => (f.reason as { endpoint: string }).endpoint)

  return { enviados: results.length - failed.length, fallidos: failed.length, expirados }
}
