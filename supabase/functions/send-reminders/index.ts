// Edge Function "send-reminders": la llama el cron de Postgres (pg_cron +
// pg_net, ver supabase/reminders-cron.sql) cada 5 minutos. No decide nada por
// sí sola: revisa a quién le toca un recordatorio AHORA MISMO en su zona
// horaria -- cada persona puede tener hasta dos horarios independientes,
// cada uno evaluado por separado -- qué hábitos le quedan sin responder hoy,
// y envía un push si hay alguno. Si no queda ninguno sin responder, no se
// envía nada.
//
// No hay JWT de usuario -- la llama el cron, no una persona -- así que se
// despliega con --no-verify-jwt y se protege con su propio secreto
// (X-Cron-Secret). Por eso necesita la service role key para leer datos de
// TODOS los usuarios: es la primera función del proyecto que sale del
// patrón "JWT de quien llama + RLS".
//
// Reutiliza el envío de ../_shared/push.ts (el mismo camino que ya probó
// send-test-push) y firma un token de un solo propósito
// (../_shared/reminderToken.ts), compartido por los dos botones de la
// notificación ("Ya los hice" / "No los hice hoy"), que el service worker
// invoca sin tener sesión.
//
// reminder_log (una fila por usuario, día y slot) garantiza como mucho un
// recordatorio al día POR SLOT: los dos horarios pueden dispararse el mismo
// día sin pisarse entre sí. La ventana de "es la hora" se ensancha a 10
// minutos (el doble de la cadencia del cron) para que un tick retrasado o
// fallido no le haga perder el recordatorio del día a nadie -- reminder_log
// es lo que evita que ese margen termine mandándolo dos veces.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { sendPushToAll, type PushSubscriptionRow } from '../_shared/push.ts'
import { signReminderToken } from '../_shared/reminderToken.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const REMINDER_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
// Cuántos recordatorios independientes admite la app. Duplicado a propósito
// del REMINDER_SLOT_COUNT de src/data/preferences.ts: son runtimes
// separados (Deno vs. el bundle del cliente), no comparten imports.
const SLOT_COUNT = 2

// El cron corre cada 5 minutos; la ventana se ensancha al doble (10) para que
// un tick retrasado o fallido no le haga perder el recordatorio del día a
// alguien. reminder_log evita que esto lo mande dos veces.
const WINDOW_MINUTES = 10

/**
 * Los horarios configurados por un usuario, ya en la forma nueva
 * (array de longitud SLOT_COUNT). Entiende también la forma de la versión
 * anterior (un solo `horaRecordatorio`) como respaldo: la migración a la
 * forma nueva la dispara el cliente la próxima vez que abra Ajustes, y hasta
 * entonces un recordatorio ya configurado no debe dejar de sonar.
 */
function horariosDe(meta: Record<string, unknown> | undefined): (string | null)[] {
  const nuevo = meta?.horariosRecordatorio
  if (Array.isArray(nuevo)) {
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
      const v = nuevo[i]
      return typeof v === 'string' && REMINDER_TIME_RE.test(v) ? v : null
    })
  }
  const viejo = meta?.horaRecordatorio
  const primero = typeof viejo === 'string' && REMINDER_TIME_RE.test(viejo) ? viejo : null
  return [primero, ...Array(SLOT_COUNT - 1).fill(null)]
}

/** La fecha (YYYY-MM-DD) y los minutos del día, en hora local de `tz`, ahora mismo. */
function localDateAndMinutes(tz: string, now: Date): { date: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // evita el "24:00" de medianoche que da hour12:false en algunas ICU
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Cuántos minutos han pasado desde `target` en un reloj de 24h (nunca negativo). */
function minutesSince(nowMinutes: number, targetMinutes: number): number {
  return (nowMinutes - targetMinutes + 1440) % 1440
}

function habitsMessage(names: string[]): string {
  const lista = names.join(', ')
  return names.length === 1 ? `Te falta 1 hábito: ${lista}` : `Te faltan ${names.length} hábitos: ${lista}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('X-Cron-Secret') !== cronSecret) {
    return json({ error: 'No autorizado.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  const tokenSecret = Deno.env.get('REMINDER_TOKEN_SECRET')

  if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
    console.error('send-reminders: falta configuración de Supabase (la pone Supabase solo)')
    return json({ error: 'Falta configuración de Supabase.' }, 500)
  }
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject || !tokenSecret) {
    console.error('send-reminders: faltan secretos VAPID o REMINDER_TOKEN_SECRET')
    return json({ error: 'Faltan secretos de configuración.' }, 500)
  }

  // Service role: esta función lee datos de TODOS los usuarios (horarios de
  // recordatorio, hábitos, suscripciones), no solo los de quien llama --
  // porque quien llama es el cron, no una persona con sesión.
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const now = new Date()

  const usersToRemind: { id: string; horarios: (string | null)[]; tz: string }[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      console.error('send-reminders: error listando usuarios', error)
      return json({ error: 'No se pudieron listar los usuarios.', detail: error.message }, 500)
    }
    for (const u of data.users) {
      const meta = u.user_metadata as Record<string, unknown> | undefined
      const tz = meta?.zonaHorariaRecordatorio
      const horarios = horariosDe(meta)
      if (typeof tz === 'string' && horarios.some((h) => h !== null)) {
        usersToRemind.push({ id: u.id, horarios, tz })
      }
    }
    if (data.users.length < 200) break
  }

  let slotsEnVentana = 0
  let slotsNotificados = 0
  let totalEnviados = 0
  let totalFallidos = 0

  for (const user of usersToRemind) {
    let local: { date: string; minutes: number }
    try {
      local = localDateAndMinutes(user.tz, now)
    } catch (err) {
      console.error('send-reminders: zona horaria inválida', {
        userId: user.id,
        tz: user.tz,
        error: String(err),
      })
      continue
    }

    for (let slot = 0; slot < user.horarios.length; slot++) {
      const hora = user.horarios[slot]
      if (hora === null) continue
      if (minutesSince(local.minutes, minutesOf(hora)) > WINDOW_MINUTES) continue
      slotsEnVentana++

      const { data: already } = await supabase
        .from('reminder_log')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('date', local.date)
        .eq('slot', slot)
        .maybeSingle()
      if (already) continue // este slot ya se envió hoy

      const { data: habits, error: habitsError } = await supabase
        .from('habits')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('archived', false)
      if (habitsError) {
        console.error('send-reminders: error leyendo hábitos', { userId: user.id, error: habitsError })
        continue
      }
      if (!habits || habits.length === 0) continue

      const { data: entries, error: entriesError } = await supabase
        .from('habit_entries')
        .select('habit_id')
        .eq('user_id', user.id)
        .eq('date', local.date)
      if (entriesError) {
        console.error('send-reminders: error leyendo registros', {
          userId: user.id,
          error: entriesError,
        })
        continue
      }

      const answered = new Set((entries ?? []).map((e) => e.habit_id))
      const unanswered = habits.filter((h) => !answered.has(h.id))
      if (unanswered.length === 0) continue // regla: nada sin responder, no se envía nada

      // Se registra aquí, antes de enviar: "hoy le tocaba este recordatorio"
      // es cierto sin importar si el envío a algún dispositivo falla.
      await supabase
        .from('reminder_log')
        .upsert({ user_id: user.id, date: local.date, slot }, { onConflict: 'user_id,date,slot' })

      const { data: subs, error: subsError } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', user.id)
      if (subsError) {
        console.error('send-reminders: error leyendo suscripciones', {
          userId: user.id,
          error: subsError,
        })
        continue
      }
      if (!subs || subs.length === 0) continue

      const token = await signReminderToken(user.id, local.date, tokenSecret)
      const payload = {
        title: 'Eos',
        body: habitsMessage(unanswered.map((h) => h.name)),
        url: '/',
        token,
        completeUrl: `${supabaseUrl}/functions/v1/complete-habits`,
        apikey: supabaseAnonKey,
      }

      const result = await sendPushToAll(subs as PushSubscriptionRow[], payload, {
        publicKey: vapidPublicKey,
        privateKey: vapidPrivateKey,
        subject: vapidSubject,
      })

      if (result.expirados.length > 0) {
        await supabase.from('push_subscriptions').delete().in('endpoint', result.expirados)
      }

      slotsNotificados++
      totalEnviados += result.enviados
      totalFallidos += result.fallidos

      console.log('send-reminders: recordatorio enviado', {
        userId: user.id,
        slot,
        habitos: unanswered.length,
        enviados: result.enviados,
        fallidos: result.fallidos,
      })
    }
  }

  return json(
    {
      ok: true,
      usuariosConRecordatorio: usersToRemind.length,
      slotsEnVentana,
      slotsNotificados,
      totalEnviados,
      totalFallidos,
    },
    200,
  )
})
