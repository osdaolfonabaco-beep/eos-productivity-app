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
  /** Un carácter por día, de hace 13 días a hoy: H / N / . / _ (no existía). */
  ultimos14dias: string
  /** Fecha local (YYYY-MM-DD) en que se creó el hábito. */
  creadoEl: string
  /** Días de historial real dentro de la ventana, ya calculados (máx. 14). */
  diasConHistorial: number
}

interface TaskItem {
  texto: string
}

interface OverdueTaskItem {
  texto: string
  diasDeAtraso: number
}

type Tone = 'directo' | 'equilibrado' | 'breve'

/**
 * Nombres deliberadamente explícitos y sin solapar ("fechaDeHoy" en vez de
 * "hoy", que además era el nombre de una lista de tareas): dos ejecuciones
 * con los mismos datos llegaron a confundir tareas de hoy con atrasadas.
 * `totalTareasAtrasadas` se manda calculado para que el modelo no tenga que
 * contar la lista él mismo. `tono` es la preferencia elegida en Ajustes
 * (guardada en `user_metadata`, no en una tabla).
 */
interface AnalysisPayload {
  fechaDeHoy: string
  habitos: HabitSummary[]
  tareasDeHoySinHacer: TaskItem[]
  tareasDeHoyHechas: TaskItem[]
  tareasAtrasadasDeDiasAnteriores: OverdueTaskItem[]
  totalTareasAtrasadas: number
  tono: Tone
}

function isAnalysisPayload(value: unknown): value is Omit<AnalysisPayload, 'tono'> {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.fechaDeHoy === 'string' &&
    Array.isArray(v.habitos) &&
    Array.isArray(v.tareasDeHoySinHacer) &&
    Array.isArray(v.tareasDeHoyHechas) &&
    Array.isArray(v.tareasAtrasadasDeDiasAnteriores) &&
    typeof v.totalTareasAtrasadas === 'number'
  )
}

/** "tono" es defensivo: si falta o llega algo raro (cliente viejo, etc.), cae a "equilibrado". */
function toneOf(value: unknown): Tone {
  const v = (value as { tono?: unknown } | null)?.tono
  return v === 'directo' || v === 'equilibrado' || v === 'breve' ? v : 'equilibrado'
}

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  directo: `Eres un mentor directo y honesto que revisa hábitos y tareas personales, no un animador.

Escribe un análisis breve (máximo 120 palabras). Empieza por lo que NO está funcionando (un hábito que se cae, tareas que se acumulan, lo que muestren los datos). Dedica al menos la mitad del texto a esa observación concreta y a una sugerencia práctica y específica para corregirla. Puedes reconocer algo que vaya bien, pero como máximo en una frase, y no al principio.

Nada de signos de exclamación. Nada de frases de ánimo genéricas ("vas muy bien", "sigue así", "buen trabajo", "lo estás haciendo genial") ni relleno motivacional. Tono directo, de alguien que te dice las cosas de frente, no de quien te anima.`,

  equilibrado: `Eres un mentor honesto que revisa hábitos y tareas personales — ni animador ni crítico.

Escribe un análisis breve (máximo 120 palabras). Señala por igual lo que funciona y lo que no: ni la mayoría son elogios ni la mayoría son críticas. Describe patrones y comportamientos concretos ("tres tareas llevan más de una semana sin hacerse"), nunca juzgues ni etiquetes el carácter de la persona (nada de "eres desorganizado", "te falta disciplina"). Incluye al menos una sugerencia práctica y específica.

Nada de signos de exclamación ni relleno motivacional genérico.`,

  breve: `Eres un mentor honesto que revisa hábitos y tareas personales.

Escribe SOLO 2 o 3 frases — nada más. La observación más importante que muestren los datos (sea buena o mala, la que más importe) y, si cabe en esas frases, una sugerencia concreta. Sin exclamaciones, sin relleno, sin frases de ánimo genéricas.`,
}

function buildPrompt(payload: AnalysisPayload): string {
  // "tono" ya se tradujo a instrucción; no hace falta que también viaje en
  // los "Datos", donde solo confundiría (no es algo que haya que analizar).
  const { tono, ...data } = payload
  const instrucciones = `${TONE_INSTRUCTIONS[tono]}

Todo el texto EN ESPAÑOL, sin mezclar palabras ni frases en inglés, sin importar en qué idioma "pienses" internamente.

Sobre los datos de tareas: "tareasAtrasadasDeDiasAnteriores" son de días ANTERIORES a hoy y siguen sin hacerse — son las que se acumulan. "tareasDeHoySinHacer" son de HOY: no son atrasadas aunque no estén hechas todavía, no las cuentes como acumuladas. El número de tareas atrasadas es exactamente "totalTareasAtrasadas"; usa ese número tal cual, no cuentes tú los elementos de la lista. Si "tareasAtrasadasDeDiasAnteriores" está vacía, no hay ninguna atrasada: no digas que sí las hay.

En "ultimos14dias" de cada hábito, cada carácter es un día, de hace 13 días a hoy: H = hecho, N = no hecho, . = sin responder, _ = el hábito todavía no existía ese día (se creó el "creadoEl"). Un día marcado "_" NO es un incumplimiento: no lo evalúes, no lo cuentes en contra del hábito, ignóralo como si no estuviera. Si "diasConHistorial" de un hábito es bajo (menos de 5 días, por ejemplo), dilo explícitamente ("llevas pocos días con este hábito, es pronto para ver un patrón") en vez de concluir que el hábito se sostiene o se cae.

No inventes datos que no estén aquí. No repitas los datos tal cual ni cites los nombres de los campos del JSON. No des consejos médicos ni psicológicos.`

  return `${instrucciones}\n\nDatos:\n${JSON.stringify(data)}`
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
  // Paso 1 de la corrección: sin thinkingConfig todavía (el 400 "invalid
  // argument" venía de ahí; hay que confirmar primero la forma correcta en
  // la documentación, no por memoria). Solo se sube maxOutputTokens, como
  // margen, para que el razonamiento interno no se coma todo el presupuesto
  // antes de que quede espacio para la respuesta.
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
  }
  console.log('analyze: petición a Gemini', { model: GEMINI_MODEL, body: requestBody })

  let last: Response | undefined
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(requestBody),
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
  const fullPayload: AnalysisPayload = { ...payload, tono: toneOf(payload) }

  // La URL no lleva la clave (va en la cabecera x-goog-api-key), así que es
  // segura de mostrar en los logs y de devolver a la app.
  let geminiRes: Response
  try {
    geminiRes = await callGemini(buildPrompt(fullPayload), apiKey)
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
