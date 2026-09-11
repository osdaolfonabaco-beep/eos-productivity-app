/**
 * Notificaciones push del navegador — piezas 1 y 2: pedir permiso, registrar
 * el service worker que las escucha (`public/sw.js`) y guardar la
 * suscripción. Enviar avisos vive del lado del servidor, en Edge Functions;
 * aquí solo está el botón de prueba que las invoca.
 */

import { joinErrorDetail, readFunctionErrorBody, supabase } from './supabase'

/** `true` si el navegador tiene lo necesario para Web Push. */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** El permiso actual, o `null` si el navegador no admite notificaciones. */
export function getPushPermission(): NotificationPermission | null {
  return 'Notification' in window ? Notification.permission : null
}

/** ¿Ya hay una suscripción activa en este navegador? */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false
  const registration = await navigator.serviceWorker.getRegistration('/sw.js')
  if (!registration) return false
  const sub = await registration.pushManager.getSubscription()
  return sub !== null
}

/** Clave pública VAPID: de base64url (como la da `applicationServerKey`) a `Uint8Array`. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** Guarda (o actualiza) la suscripción. `endpoint` es la clave de conflicto. */
async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('La suscripción no trae los datos esperados.')
  }
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(`saveSubscription: ${error.message}`)
}

/**
 * Pide permiso, registra el service worker, se suscribe y guarda la
 * suscripción. Debe llamarse desde un gesto del usuario: el permiso del
 * navegador lo exige.
 */
export async function enablePushNotifications(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Este navegador no admite notificaciones push.')
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!publicKey) {
    throw new Error('Falta VITE_VAPID_PUBLIC_KEY. Configúrala en .env.local y reinicia.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('No diste permiso de notificaciones.')
  }

  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))

  await saveSubscription(subscription)
}

/** Pide a la Edge Function que mande un aviso de prueba a tus suscripciones guardadas. */
export async function sendTestPush(): Promise<{ enviados: number; fallidos: number }> {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean
    enviados?: number
    fallidos?: number
    error?: string
    detail?: string
  }>('send-test-push', { body: {} })

  if (error) {
    const message = joinErrorDetail(await readFunctionErrorBody(error))
    throw new Error(message ?? error.message)
  }
  if (!data?.ok) {
    throw new Error(joinErrorDetail(data) ?? 'No se pudo enviar el aviso de prueba.')
  }
  return { enviados: data.enviados ?? 0, fallidos: data.fallidos ?? 0 }
}
