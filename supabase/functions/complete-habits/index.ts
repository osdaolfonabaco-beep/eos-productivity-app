// Edge Function "complete-habits": la invoca el botón "Ya los hice" de la
// notificación, desde el service worker -- sin sesión de usuario, porque el
// service worker no tiene acceso al localStorage donde vive el JWT de
// supabase-js. La autoridad para actuar aquí es el token firmado que generó
// send-reminders (../_shared/reminderToken.ts), no un JWT de Supabase.
//
// Marca como hechos los hábitos que seguían sin responder cuando se generó
// el token; si alguno ya se respondió desde entonces (por ejemplo, desde la
// app), no lo toca -- solo rellena huecos, nunca sobreescribe una respuesta.
//
// Se despliega con --no-verify-jwt (quien la llama no tiene JWT que ofrecer);
// la validación de identidad es enteramente la firma del token.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { verifyReminderToken } from '../_shared/reminderToken.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const tokenSecret = Deno.env.get('REMINDER_TOKEN_SECRET')
  if (!supabaseUrl || !serviceRoleKey || !tokenSecret) {
    console.error('complete-habits: falta configuración de Supabase o REMINDER_TOKEN_SECRET')
    return json({ error: 'Falta configuración del servidor.' }, 500)
  }

  let body: { token?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'El cuerpo no es JSON válido.' }, 400)
  }
  if (typeof body.token !== 'string') {
    return json({ error: 'Falta el token.' }, 400)
  }

  let userId: string
  let date: string
  try {
    ;({ userId, date } = await verifyReminderToken(body.token, tokenSecret))
  } catch (err) {
    console.error('complete-habits: token inválido', String(err))
    return json({ error: 'El enlace ya no es válido. Abre la app para responder.' }, 401)
  }

  // Service role: no hay JWT de usuario que darle a RLS. La identidad ya
  // quedó verificada por la firma del token; user_id se fija a mano en el
  // insert de abajo (el default auth.uid() de la tabla no aplica sin JWT).
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id')
    .eq('user_id', userId)
    .eq('archived', false)
  if (habitsError) {
    console.error('complete-habits: error leyendo hábitos', habitsError)
    return json({ error: 'No se pudieron leer los hábitos.', detail: habitsError.message }, 500)
  }

  const { data: entries, error: entriesError } = await supabase
    .from('habit_entries')
    .select('habit_id')
    .eq('user_id', userId)
    .eq('date', date)
  if (entriesError) {
    console.error('complete-habits: error leyendo registros', entriesError)
    return json({ error: 'No se pudieron leer los registros.', detail: entriesError.message }, 500)
  }

  const answered = new Set((entries ?? []).map((e) => e.habit_id))
  const unanswered = (habits ?? []).filter((h) => !answered.has(h.id))

  if (unanswered.length > 0) {
    const { error: insertError } = await supabase.from('habit_entries').insert(
      unanswered.map((h) => ({
        habit_id: h.id,
        date,
        done: true,
        user_id: userId,
      })),
    )
    if (insertError) {
      console.error('complete-habits: error insertando registros', insertError)
      return json({ error: 'No se pudieron guardar los hábitos.', detail: insertError.message }, 500)
    }
  }

  return json({ ok: true, marcados: unanswered.length }, 200)
})
