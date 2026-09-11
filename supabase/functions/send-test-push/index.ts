// Edge Function "send-test-push": manda un aviso Web Push inmediato a las
// suscripciones guardadas del usuario que llama, para probar la tubería
// completa (permiso -> service worker -> suscripción guardada -> firma y
// envío del lado del servidor) antes de montar la tarea programada.
//
// Usa `npm:web-push`, el paquete estándar de Node para esto: acepta las
// claves VAPID tal cual las da `npx web-push generate-vapid-keys` (base64url),
// sin conversión de formato. Es la primera vez que este proyecto depende de
// un paquete npm dentro de una Edge Function (Deno) para algo más que fetch;
// si Supabase no lo soporta bien en la práctica, el error debería verse
// completo aquí abajo (se loguea) y en lo que devuelve la función.
//
// Lee y escribe en la base de datos con el JWT de quien llama (no con la
// service role key): RLS hace que solo se lean SUS propias suscripciones.
//
// Requiere los secretos VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT
// (supabase secrets set ...). SUPABASE_URL y SUPABASE_ANON_KEY los pone
// Supabase solo, en toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('send-test-push: faltan SUPABASE_URL/SUPABASE_ANON_KEY (los pone Supabase solo)')
    return json({ error: 'Falta configuración de Supabase en la función.' }, 500)
  }
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error('send-test-push: faltan secretos VAPID', {
      tieneVapidPublicKey: Boolean(vapidPublicKey),
      tieneVapidPrivateKey: Boolean(vapidPrivateKey),
      tieneVapidSubject: Boolean(vapidSubject),
    })
    return json(
      { error: 'Faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT en los secretos.' },
      500,
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Falta la sesión.' }, 401)
  }

  // Cliente con el JWT de quien llama: RLS filtra solo sus filas, no hace
  // falta la service role key para esto.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')

  if (subsError) {
    console.error('send-test-push: error leyendo suscripciones', subsError)
    return json({ error: 'No se pudieron leer las suscripciones.', detail: subsError.message }, 500)
  }
  if (!subs || subs.length === 0) {
    return json({ error: 'No tienes ninguna suscripción activa en esta cuenta.' }, 400)
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const payload = JSON.stringify({
    title: 'Productividad',
    body: 'Aviso de prueba: si ves esto, la tubería de notificaciones funciona.',
  })

  const results = await Promise.allSettled(
    (subs as SubscriptionRow[]).map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      ),
    ),
  )

  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  for (const f of failed) {
    console.error('send-test-push: fallo al enviar a una suscripción', String(f.reason))
  }

  const enviados = results.length - failed.length

  if (enviados === 0) {
    return json(
      {
        error: 'No se pudo enviar a ninguna suscripción.',
        detail: String(failed[0]?.reason ?? '(sin detalle)'),
        enviados: 0,
        fallidos: failed.length,
      },
      502,
    )
  }

  return json({ ok: true, enviados, fallidos: failed.length }, 200)
})
