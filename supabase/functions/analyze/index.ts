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
//
// Si Gemini está saturado (503), reintenta unas veces con espera creciente
// antes de rendirse; si aun así falla, la app muestra un mensaje entendible
// en vez del error técnico. Para cualquier otro tipo de error, el detalle
// completo de Gemini sigue mostrándose, como antes.

// Google retira modelos con el tiempo; si este vuelve a dar 404, el error de
// Gemini (que la app ya muestra completo) suele decir el nombre nuevo.
const GEMINI_MODEL = 'gemini-3.6-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

// Reintentos ante 503 ("modelo saturado"), con espera creciente entre cada
// uno. MAX_RETRIES = 2 -> hasta 3 intentos en total.
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
  const instrucciones = `Eres un asistente que ayuda a revisar hábitos y tareas personales. Con los datos de abajo, escribe un análisis breve (máximo 120 palabras), EN ESPAÑOL —todo el texto, sin mezclar palabras ni frases en inglés, sin importar en qué idioma "pienses" internamente—, con tono cercano y práctico. Señala patrones (hábitos que se sostienen o se están cayendo, tareas que se acumulan) y como mucho una sugerencia concreta. No des consejos médicos ni psicológicos. No inventes datos que no estén aquí. No repitas los datos tal cual ni cites los nombres de los campos del JSON.

En "ultimos14dias", cada carácter es un día, de hace 13 días a hoy: H = hecho, N = no hecho, . = sin responder.`

  return `${instrucciones}\n\nDatos:\n${JSON.stringify(payload)}`
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/**
 * Llama a Gemini. Si responde 503 (saturado), reintenta con espera creciente
 * (500ms, 1000ms...) hasta MAX_RETRIES veces más. Cualquier otro estado, o el
 * último 503 si se agotan los reintentos, se devuelve tal cual para que el
 * llamador decida.
 */
async function callGemini(prompt: string, apiKey: string): Promise<Response> {
  let last: Response | undefined
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        // gemini-3.6-flash "piensa" antes de responder, y ese razonamiento
        // gasta del mismo presupuesto de salida; con 400 se quedaba sin
        // espacio para la respuesta final. 2048 deja margen para pensar y
        // para las <=120 palabras que pedimos.
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
    })
    if (res.status !== 503) return res

    last = res
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      console.error('analyze: Gemini saturado (503), reintentando', {
        intento: attempt + 1,
        esperaMs: delay,
      })
      await sleep(delay)
    }
  }
  return last!
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
    console.error('analyze: falta el secreto GEMINI_API_KEY en el proyecto')
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

  // La URL no lleva la clave (va en la cabecera x-goog-api-key), así que es
  // segura de mostrar en los logs y de devolver a la app.
  let geminiRes: Response
  try {
    geminiRes = await callGemini(buildPrompt(payload), apiKey)
  } catch (err) {
    console.error('analyze: fallo de red al llamar a Gemini', {
      model: GEMINI_MODEL,
      url: GEMINI_URL,
      error: String(err),
    })
    return json(
      { error: 'No se pudo contactar a Gemini.', detail: String(err), model: GEMINI_MODEL, url: GEMINI_URL },
      502,
    )
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => '(sin cuerpo)')
    console.error('analyze: Gemini respondió con error', {
      model: GEMINI_MODEL,
      url: GEMINI_URL,
      status: geminiRes.status,
      body: detail,
    })

    // 503 tras agotar los reintentos: es saturación de Gemini, no un fallo
    // nuestro. La app muestra un mensaje entendible en vez del detalle
    // técnico; para cualquier otro estado, el detalle sigue completo.
    if (geminiRes.status === 503) {
      return json(
        {
          error: 'El servicio está saturado, inténtalo en unos minutos.',
          code: 'overloaded',
          detail,
          model: GEMINI_MODEL,
          url: GEMINI_URL,
        },
        503,
      )
    }

    return json(
      {
        error: `Gemini respondió con error (${geminiRes.status}).`,
        detail,
        model: GEMINI_MODEL,
        url: GEMINI_URL,
      },
      502,
    )
  }

  const data = await geminiRes.json()
  // Se registra siempre, incluso si sale bien: es la única forma de ver por
  // qué un texto "funciona" pero sale raro (partes de razonamiento coladas,
  // cortado a mitad, etc.) sin tener que reproducir el problema a ciegas.
  console.log('analyze: respuesta cruda de Gemini', JSON.stringify(data))

  const candidate = data?.candidates?.[0]
  const finishReason: string | undefined = candidate?.finishReason

  // Si Gemini se quedó sin presupuesto de salida, lo que haya en `parts` es
  // una respuesta a medias (a veces mezclada con razonamiento en inglés).
  // Mejor avisar que devolver texto cortado.
  if (finishReason === 'MAX_TOKENS') {
    console.error('analyze: Gemini se quedó sin tokens de salida (MAX_TOKENS)', {
      model: GEMINI_MODEL,
      body: data,
    })
    return json(
      {
        error: 'La respuesta de Gemini se cortó por falta de espacio de salida (MAX_TOKENS).',
        detail: JSON.stringify(data),
        model: GEMINI_MODEL,
      },
      502,
    )
  }

  // Los modelos "thinking" pueden devolver varias partes: algunas son
  // razonamiento interno (part.thought === true), no la respuesta. Se
  // descartan esas y se unen las demás, en vez de tomar solo parts[0].
  const parts: { text?: string; thought?: boolean }[] = candidate?.content?.parts ?? []
  const text = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
    .trim()

  if (!text) {
    console.error('analyze: Gemini no devolvió texto usable', {
      model: GEMINI_MODEL,
      finishReason,
      body: data,
    })
    return json(
      { error: 'Gemini no devolvió texto.', detail: JSON.stringify(data), model: GEMINI_MODEL },
      502,
    )
  }

  return json({ analysis: text }, 200)
})
