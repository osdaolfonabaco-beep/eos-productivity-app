// Edge Function "analyze": manda un resumen de hábitos y tareas a Gemini y
// devuelve un análisis breve en español.
//
// No toca la base de datos: el cliente (src/data/analysis.ts) arma el JSON
// y se lo manda ya listo. El journal nunca pasa por aquí.
//
// Requiere el secreto GEMINI_API_KEY:
//   supabase secrets set GEMINI_API_KEY=tu-clave
//
// Supabase exige un JWT válido antes de ejecutar esto (verify_jwt por
// defecto): una petición sin sesión nunca llega a este código.

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface HabitSummary {
  nombre: string
  /** Un carácter por día, de hace 13 días a hoy: H / N / . */
  ultimos14dias: string
}

interface TaskSummary {
  texto: string
  hecha?: boolean
  diasDeAtraso?: number
}

interface AnalysisPayload {
  hoy: string
  habitos: HabitSummary[]
  tareas: {
    hoy: TaskSummary[]
    atrasadas: TaskSummary[]
  }
}

function isAnalysisPayload(value: unknown): value is AnalysisPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.hoy !== 'string' || !Array.isArray(v.habitos)) return false
  const tareas = v.tareas as Record<string, unknown> | undefined
  return (
    typeof tareas === 'object' &&
    tareas !== null &&
    Array.isArray(tareas.hoy) &&
    Array.isArray(tareas.atrasadas)
  )
}

function buildPrompt(payload: AnalysisPayload): string {
  const instrucciones = `Eres un asistente que ayuda a revisar hábitos y tareas personales. Con los datos de abajo, escribe un análisis breve (máximo 120 palabras), en español, con tono cercano y práctico. Señala patrones (hábitos que se sostienen o se están cayendo, tareas que se acumulan) y como mucho una sugerencia concreta. No des consejos médicos ni psicológicos. No inventes datos que no estén aquí. No repitas los datos tal cual.

En "ultimos14dias", cada carácter es un día, de hace 13 días a hoy: H = hecho, N = no hecho, . = sin responder.`

  return `${instrucciones}\n\nDatos:\n${JSON.stringify(payload)}`
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405)
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    return json(
      { error: 'Falta configurar GEMINI_API_KEY en los secretos del proyecto.' },
      500,
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)
  }

  if (!isAnalysisPayload(payload)) {
    return json({ error: 'Faltan datos de hábitos o tareas.' }, 400)
  }

  let geminiRes: Response
  try {
    geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(payload) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    })
  } catch {
    return json({ error: 'No se pudo contactar a Gemini.' }, 502)
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => '')
    return json({ error: `Gemini respondió con error (${geminiRes.status}).`, detail }, 502)
  }

  const data = await geminiRes.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    return json({ error: 'Gemini no devolvió texto.' }, 502)
  }

  return json({ analysis: text.trim() }, 200)
})
