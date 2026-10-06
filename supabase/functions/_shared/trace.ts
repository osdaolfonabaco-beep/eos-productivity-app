// Traza cada llamada a Gemini en Langfuse, para poder ver después qué prompt
// se mandó, qué contestó el modelo, cuánto tardó y cuántos tokens costó --
// sin tener que reproducir nada a ciegas desde los logs.
//
// Sin SDK y sin dependencias: un POST directo al endpoint OTLP de Langfuse
// (OpenTelemetry sobre JSON). Langfuse acepta OTLP nativo, así que no hace
// falta su cliente de JavaScript ni el runtime de OpenTelemetry; basta armar
// el cuerpo a mano. Un span por llamada lógica a Gemini: si `callGemini`
// reintentó por saturación (503), la duración del span incluye las esperas
// entre intentos -- que es la latencia que de verdad sufre la persona -- y el
// número de intentos va en la metadata.
//
// Requiere tres secretos. Si falta cualquiera, no se traza y la función sigue
// igual (eso es lo que permite ejecutar en local sin configurar nada):
//   supabase secrets set LANGFUSE_PUBLIC_KEY=pk-lf-...
//   supabase secrets set LANGFUSE_SECRET_KEY=sk-lf-...
//   supabase secrets set LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
//
// `sendTrace` NUNCA lanza y nunca bloquea nada importante: observar no puede
// romper lo observado. Un fallo de Langfuse se registra y se ignora.

/** `usageMetadata` tal como lo devuelve Gemini. Todos los campos opcionales. */
export interface GeminiUsage {
  promptTokenCount?: number
  candidatesTokenCount?: number
  /** Tokens de razonamiento interno de los modelos "thinking". Se facturan. */
  thoughtsTokenCount?: number
  totalTokenCount?: number
}

export interface TraceInput {
  /** "diario" | "semanal" | "idea" | "resumen" | "propuesta" */
  tipo: string
  tono: string
  model: string
  modelParameters: Record<string, unknown>
  prompt: string
  /** El texto final si salió bien; el motivo del fallo si no. */
  output: string
  startMs: number
  endMs: number
  /** Intentos que hizo callGemini, contando el primero. */
  intentos: number
  httpStatus?: number
  finishReason?: string
  usage?: GeminiUsage
  /** Segundos que Gemini pidió esperar en un 429 (RetryInfo.retryDelay). */
  retryAfterS?: number
  /** Si está presente, el span se marca como ERROR con este motivo. */
  error?: string
}

const OTLP_PATH = '/api/public/otel/v1/traces'

// Tope de espera del POST a Langfuse. Corto a propósito: la traza se emite
// fuera del camino de la respuesta, pero el isolate no debe quedarse colgado
// esperando a un servicio que no es crítico.
const TIMEOUT_MS = 3000

/** Hex aleatorio. OTLP exige traceId de 16 bytes (32 hex) y spanId de 8 (16 hex). */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let out = ''
  for (const b of buf) out += b.toString(16).padStart(2, '0')
  return out
}

// OTLP quiere nanosegundos desde 1970. Ese número (~1.7e18) pasa del entero
// seguro de JavaScript, así que se calcula con BigInt y viaja como string:
// como `number` se corrompería al serializar.
function msToUnixNano(ms: number): string {
  return String(BigInt(Math.round(ms)) * 1_000_000n)
}

/** Atributo OTLP. Todo se manda como stringValue, incluidos los JSON anidados. */
function attr(key: string, value: string) {
  return { key, value: { stringValue: value } }
}

/**
 * Tokens en el formato que espera Langfuse. `output` suma los tokens de
 * razonamiento a los de la respuesta: los modelos "thinking" los cobran, y
 * dejarlos fuera subestimaría el gasto real.
 */
function usageDetails(u: GeminiUsage): string {
  const input = u.promptTokenCount ?? 0
  const output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)
  const total = u.totalTokenCount ?? input + output
  return JSON.stringify({ input, output, total })
}

export async function sendTrace(t: TraceInput): Promise<void> {
  const publicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY')
  const secretKey = Deno.env.get('LANGFUSE_SECRET_KEY')
  const baseUrl = Deno.env.get('LANGFUSE_BASE_URL')

  if (!publicKey || !secretKey || !baseUrl) {
    // Se nombra cuál falta, nunca su valor.
    const faltan = [
      !publicKey && 'LANGFUSE_PUBLIC_KEY',
      !secretKey && 'LANGFUSE_SECRET_KEY',
      !baseUrl && 'LANGFUSE_BASE_URL',
    ].filter(Boolean)
    console.warn('trace: no se traza, faltan secretos de Langfuse', { faltan })
    return
  }

  try {
    const attributes = [
      attr('langfuse.observation.type', 'generation'),
      attr('langfuse.trace.name', `analyze:${t.tipo}`),
      attr('langfuse.observation.input', JSON.stringify(t.prompt)),
      attr('langfuse.observation.output', JSON.stringify(t.output)),
      attr('langfuse.observation.model.name', t.model),
      attr('langfuse.observation.model.parameters', JSON.stringify(t.modelParameters)),
      attr('langfuse.observation.metadata.tipo', t.tipo),
      attr('langfuse.observation.metadata.tono', t.tono),
      attr('langfuse.observation.metadata.intentos', String(t.intentos)),
      attr('langfuse.environment', 'production'),
    ]

    // Los opcionales se omiten en vez de mandarse vacíos: un
    // finish_reason: "" ensuciaría los filtros del panel de Langfuse.
    if (t.usage) {
      attributes.push(attr('langfuse.observation.usage_details', usageDetails(t.usage)))
    }
    if (t.httpStatus !== undefined) {
      attributes.push(attr('langfuse.observation.metadata.http_status', String(t.httpStatus)))
    }
    if (t.retryAfterS !== undefined) {
      attributes.push(attr('langfuse.observation.metadata.retry_after_s', String(t.retryAfterS)))
    }
    if (t.finishReason) {
      attributes.push(attr('langfuse.observation.metadata.finish_reason', t.finishReason))
    }
    if (t.error) {
      attributes.push(attr('langfuse.observation.level', 'ERROR'))
      attributes.push(attr('langfuse.observation.status_message', t.error))
    }

    const body = {
      resourceSpans: [
        {
          resource: { attributes: [attr('service.name', 'eos-analyze')] },
          scopeSpans: [
            {
              scope: { name: 'eos-analyze' },
              spans: [
                {
                  traceId: randomHex(16),
                  spanId: randomHex(8),
                  name: `analyze:${t.tipo}`,
                  kind: 1, // SPAN_KIND_INTERNAL
                  startTimeUnixNano: msToUnixNano(t.startMs),
                  endTimeUnixNano: msToUnixNano(t.endMs),
                  attributes,
                },
              ],
            },
          ],
        },
      ],
    }

    // Las llaves solo se usan aquí, para la cabecera. Nunca entran en un log.
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}${OTLP_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${publicKey}:${secretKey}`)}`,
        'x-langfuse-ingestion-version': '4',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      // Un 401 o un 422 de OTLP es silencioso de otro modo: sin esto, las
      // trazas simplemente no aparecerían en el panel y no se sabría por qué.
      const detail = await res.text().catch(() => '(sin cuerpo)')
      console.error('trace: Langfuse rechazó la traza', { status: res.status, body: detail })
    }
  } catch (err) {
    // Incluye el timeout de AbortSignal. Observar no puede romper lo observado.
    console.error('trace: no se pudo enviar la traza a Langfuse', { error: String(err) })
  }
}
