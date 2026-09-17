// Edge Function "analyze": manda un resumen de hábitos y tareas a Gemini y
// devuelve un análisis breve en español.
//
// Sirve TRES tipos de análisis, discriminados por "tipo" en el payload:
// "diario" (hábitos de los últimos 14 días + tareas de hoy/atrasadas + el
// comentario del día, el original), "semanal" (el dashboard de Vida ->
// Semana: cumplimiento de esta semana por hábito y comparación con la
// anterior, las metas de la semana y sus avances, los comentarios del día
// de esta semana, y las ideas que se cerraron esta semana), y "idea" (una
// sola idea de la pestaña Ideas, con su texto y su estado -- ver
// buildIdeaPrompt). Se reutiliza la misma función
// -- y el mismo mecanismo de tono (toneOf/getTone) -- en vez de crear una
// nueva; solo cambia qué prompt se construye antes de llamar a Gemini. Los
// prompts diario y semanal (buildDailyPrompt/buildWeeklyPrompt,
// TONE_INSTRUCTIONS) no se tocan para añadir "idea".
//
// No toca la base de datos: el cliente (src/data/analysis.ts) arma el JSON
// y se lo manda ya listo. El journal nunca pasa por aquí, en ninguno de los
// tres tipos; el modo "idea" además no recibe la lista de ideas, hábitos,
// tareas ni comentarios -- solo el texto y el estado de la idea que se pidió.
//
// "diario" y "semanal" también pueden traer "proposito" -- qué está
// intentando lograr el usuario, en qué plazo y qué le está costando (lo
// escribe el usuario, no forma parte de los datos de hábitos/tareas) -- si
// no ha escrito ninguno, la clave viene ausente. "idea" nunca lo lleva, a
// propósito: ver el comentario de cabecera de src/data/analysis.ts.
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
 * El "para qué" del usuario. `masDeUnMesSinRevisar` llega ya calculado del
 * cliente (`isMentorPurposeStale`, en src/data/mentorPurpose.ts): el modelo
 * no tiene que hacer aritmética de fechas sobre un timestamp, mismo
 * criterio que `totalTareasAtrasadas` más abajo.
 */
interface PropositoPayload {
  objetivo: string | null
  plazo: string | null
  dificultad: string | null
  masDeUnMesSinRevisar: boolean
}

function isPropositoPayload(v: unknown): v is PropositoPayload {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  const textField = (x: unknown) => x === null || typeof x === 'string'
  return (
    textField(p.objetivo) &&
    textField(p.plazo) &&
    textField(p.dificultad) &&
    typeof p.masDeUnMesSinRevisar === 'boolean'
  )
}

/**
 * Nombres deliberadamente explícitos y sin solapar ("fechaDeHoy" en vez de
 * "hoy", que además era el nombre de una lista de tareas): dos ejecuciones
 * con los mismos datos llegaron a confundir tareas de hoy con atrasadas.
 * `totalTareasAtrasadas` se manda calculado para que el modelo no tenga que
 * contar la lista él mismo. `tono` es la preferencia elegida en Ajustes
 * (guardada en `user_metadata`, no en una tabla).
 */
interface DailyPayload {
  tipo?: 'diario'
  fechaDeHoy: string
  habitos: HabitSummary[]
  tareasDeHoySinHacer: TaskItem[]
  tareasDeHoyHechas: TaskItem[]
  tareasAtrasadasDeDiasAnteriores: OverdueTaskItem[]
  totalTareasAtrasadas: number
  /** El comentario del día, o `null`/ausente si no se escribió ninguno. Distinto del journal, que nunca llega aquí. */
  comentarioDelDia?: string | null
  tono: Tone
  /** Ausente si el usuario no ha escrito un propósito. */
  proposito?: PropositoPayload
}

function isDailyPayload(v: Record<string, unknown>): v is DailyPayload {
  if (v.comentarioDelDia !== undefined && v.comentarioDelDia !== null && typeof v.comentarioDelDia !== 'string') {
    return false
  }
  if (v.proposito !== undefined && !isPropositoPayload(v.proposito)) return false
  return (
    typeof v.fechaDeHoy === 'string' &&
    Array.isArray(v.habitos) &&
    Array.isArray(v.tareasDeHoySinHacer) &&
    Array.isArray(v.tareasDeHoyHechas) &&
    Array.isArray(v.tareasAtrasadasDeDiasAnteriores) &&
    typeof v.totalTareasAtrasadas === 'number'
  )
}

/** Conteos de un hábito dentro de una semana (siempre suman los días de esa semana ya transcurridos). */
interface WeeklyHabitStats {
  hecho: number
  noHecho: number
  sinResponder: number
  diasTranscurridos: number
}

interface WeeklyHabitSummary {
  nombre: string
  /** Fecha local (YYYY-MM-DD) en que se creó el hábito. */
  creadoEl: string
  estaSemana: WeeklyHabitStats
  /** `null` si el hábito es demasiado nuevo para tener la semana anterior completa. */
  semanaAnterior: WeeklyHabitStats | null
}

type GoalResult = 'cumplida' | 'no-cumplida'
type GoalDirection = 'acerca' | 'aleja'

interface GoalUpdateSummary {
  fecha: string
  texto: string
  direccion: GoalDirection
}

interface GoalSummary {
  texto: string
  /** `null` mientras la meta no se cierra. */
  resultado: GoalResult | null
  avances: GoalUpdateSummary[]
}

/** Metas de una semana ya cerrada: solo el veredicto, sin la bitácora de avances. */
interface PastGoalSummary {
  texto: string
  resultado: GoalResult | null
}

interface DayCommentSummary {
  fecha: string
  texto: string
}

/** Una idea que se cerró esta semana (pasó a 'hecha' o a 'descartada'), con su texto. */
interface ClosedIdeaSummary {
  texto: string
  estado: 'hecha' | 'descartada'
}

interface WeeklyPayload {
  tipo: 'semanal'
  semanaActual: { inicio: string; fin: string }
  semanaAnterior: { inicio: string; fin: string }
  /** `false` si NINGÚN hábito tiene semana anterior completa todavía. */
  hayHistoriaSuficiente: boolean
  habitos: WeeklyHabitSummary[]
  metas: GoalSummary[]
  metasSemanaAnterior: PastGoalSummary[]
  /** Los comentarios del día de esta semana que sí se escribieron. Opcional por lo mismo que el resto: tolerancia defensiva. */
  comentariosDeLaSemana?: DayCommentSummary[]
  /** Las ideas que se cerraron esta semana. Opcional por lo mismo que el resto: tolerancia defensiva. */
  ideasCerradas?: ClosedIdeaSummary[]
  /**
   * `true` si el TOTAL histórico de ideas cerradas (de cualquier semana, no
   * solo esta) es suficiente para que comentar un patrón tenga sentido --
   * cerrar cinco ideas en una sola semana casi nunca pasa.
   */
  hayIdeasCerradasSuficientes?: boolean
  tono: Tone
  /** Ausente si el usuario no ha escrito un propósito. */
  proposito?: PropositoPayload
}

function isWeeklyHabitStats(v: unknown): v is WeeklyHabitStats {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.hecho === 'number' &&
    typeof s.noHecho === 'number' &&
    typeof s.sinResponder === 'number' &&
    typeof s.diasTranscurridos === 'number'
  )
}

function isGoalResult(v: unknown): v is GoalResult | null {
  return v === null || v === 'cumplida' || v === 'no-cumplida'
}

function isGoalSummary(v: unknown): v is GoalSummary {
  if (typeof v !== 'object' || v === null) return false
  const g = v as Record<string, unknown>
  if (typeof g.texto !== 'string' || !isGoalResult(g.resultado) || !Array.isArray(g.avances)) {
    return false
  }
  return (g.avances as unknown[]).every((a) => {
    if (typeof a !== 'object' || a === null) return false
    const aa = a as Record<string, unknown>
    return (
      typeof aa.fecha === 'string' &&
      typeof aa.texto === 'string' &&
      (aa.direccion === 'acerca' || aa.direccion === 'aleja')
    )
  })
}

function isPastGoalSummary(v: unknown): v is PastGoalSummary {
  if (typeof v !== 'object' || v === null) return false
  const g = v as Record<string, unknown>
  return typeof g.texto === 'string' && isGoalResult(g.resultado)
}

function isDayCommentSummary(v: unknown): v is DayCommentSummary {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  return typeof c.fecha === 'string' && typeof c.texto === 'string'
}

function isClosedIdeaSummary(v: unknown): v is ClosedIdeaSummary {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  return typeof c.texto === 'string' && (c.estado === 'hecha' || c.estado === 'descartada')
}

function isWeeklyPayload(v: Record<string, unknown>): v is WeeklyPayload {
  if (v.tipo !== 'semanal') return false
  const semanaActual = v.semanaActual as Record<string, unknown> | undefined
  const semanaAnterior = v.semanaAnterior as Record<string, unknown> | undefined
  if (typeof semanaActual?.inicio !== 'string' || typeof semanaActual?.fin !== 'string') return false
  if (typeof semanaAnterior?.inicio !== 'string' || typeof semanaAnterior?.fin !== 'string') return false
  if (typeof v.hayHistoriaSuficiente !== 'boolean') return false
  if (!Array.isArray(v.habitos)) return false
  if (!Array.isArray(v.metas) || !v.metas.every(isGoalSummary)) return false
  if (!Array.isArray(v.metasSemanaAnterior) || !v.metasSemanaAnterior.every(isPastGoalSummary)) {
    return false
  }
  if (v.comentariosDeLaSemana !== undefined) {
    if (!Array.isArray(v.comentariosDeLaSemana) || !v.comentariosDeLaSemana.every(isDayCommentSummary)) {
      return false
    }
  }
  if (v.ideasCerradas !== undefined) {
    if (!Array.isArray(v.ideasCerradas) || !v.ideasCerradas.every(isClosedIdeaSummary)) {
      return false
    }
  }
  if (v.hayIdeasCerradasSuficientes !== undefined && typeof v.hayIdeasCerradasSuficientes !== 'boolean') {
    return false
  }
  if (v.proposito !== undefined && !isPropositoPayload(v.proposito)) return false
  return (v.habitos as unknown[]).every((h) => {
    if (typeof h !== 'object' || h === null) return false
    const hh = h as Record<string, unknown>
    return (
      typeof hh.nombre === 'string' &&
      typeof hh.creadoEl === 'string' &&
      isWeeklyHabitStats(hh.estaSemana) &&
      (hh.semanaAnterior === null || isWeeklyHabitStats(hh.semanaAnterior))
    )
  })
}

/** Los dos estados desde los que se puede pedir análisis ("descartada" no ofrece el botón en la interfaz). */
type IdeaStatusForAnalysis = 'pendiente' | 'en-marcha'

/**
 * Payload de "idea": deliberadamente mínimo -- solo el texto de ESA idea y su
 * estado, nada de la lista de ideas ni de ningún otro dato de la cuenta.
 */
interface IdeaPayload {
  tipo: 'idea'
  texto: string
  estado: IdeaStatusForAnalysis
  tono: Tone
}

function isIdeaPayload(v: Record<string, unknown>): v is IdeaPayload {
  return (
    v.tipo === 'idea' &&
    typeof v.texto === 'string' &&
    v.texto.trim().length > 0 &&
    (v.estado === 'pendiente' || v.estado === 'en-marcha')
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

/** Cierre común a los dos tipos de análisis: idioma y límites generales. */
const COMMON_CLOSING = `Todo el texto EN ESPAÑOL, sin mezclar palabras ni frases en inglés, sin importar en qué idioma "pienses" internamente.

No inventes datos que no estén aquí. No repitas los datos tal cual ni cites los nombres de los campos del JSON. No des consejos médicos ni psicológicos.`

/**
 * Cómo leer "proposito", compartido entre diario y semanal -- ambos lo
 * reciben igual (ver el comentario de cabecera de este archivo). Una sola
 * copia para no repetir dos veces el candado de "no consejo financiero",
 * que es el que más importa que no se desalinee entre los dos prompts.
 */
const PROPOSITO_INSTRUCTIONS = `"proposito" (puede faltar, si la persona no ha escrito ninguno) es lo que dijo que está intentando lograr en general -- no algo de hoy ni de esta semana en particular. Trae "objetivo", "plazo" y "dificultad", cada uno null si no se escribió. Relaciona lo que observas en los datos con este propósito cuando de verdad tenga sentido (por ejemplo, si el objetivo habla de ahorrar y hay un patrón de tareas de dinero atrasadas, coméntalo en relación a eso); no lo repitas ni lo cites tal cual de vuelta, y no fuerces la conexión si no hay ninguna real que señalar. Si "masDeUnMesSinRevisar" es true, puedes mencionar una sola vez, de forma breve y sin insistir, que hace tiempo que no se revisa este propósito -- por ejemplo, invitar a confirmar si sigue vigente -- sin convertirlo en el tema central del análisis. Importante: aunque "dificultad" u "objetivo" mencionen deudas o dinero, NO das consejo financiero -- puedes relacionar hábitos con ese objetivo, pero nunca recomendar qué pagar, refinanciar, negociar con un acreedor ni ninguna otra decisión financiera concreta.`

function buildDailyPrompt(payload: DailyPayload): string {
  // "tono" ya se tradujo a instrucción; no hace falta que también viaje en
  // los "Datos", donde solo confundiría (no es algo que haya que analizar).
  const { tono, tipo: _tipo, ...data } = payload
  const instrucciones = `${TONE_INSTRUCTIONS[tono]}

${COMMON_CLOSING}

Sobre los datos de tareas: "tareasAtrasadasDeDiasAnteriores" son de días ANTERIORES a hoy y siguen sin hacerse — son las que se acumulan. "tareasDeHoySinHacer" son de HOY: no son atrasadas aunque no estén hechas todavía, no las cuentes como acumuladas. El número de tareas atrasadas es exactamente "totalTareasAtrasadas"; usa ese número tal cual, no cuentes tú los elementos de la lista. Si "tareasAtrasadasDeDiasAnteriores" está vacía, no hay ninguna atrasada: no digas que sí las hay.

En "ultimos14dias" de cada hábito, cada carácter es un día, de hace 13 días a hoy: H = hecho, N = no hecho, . = sin responder, _ = el hábito todavía no existía ese día (se creó el "creadoEl"). Un día marcado "_" NO es un incumplimiento: no lo evalúes, no lo cuentes en contra del hábito, ignóralo como si no estuviera. Si "diasConHistorial" de un hábito es bajo (menos de 5 días, por ejemplo), dilo explícitamente ("llevas pocos días con este hábito, es pronto para ver un patrón") en vez de concluir que el hábito se sostiene o se cae.

"comentarioDelDia" es lo que la persona escribió sobre cómo fue hoy (puede ser null si no escribió nada). Es contexto para leer junto a los hábitos y tareas, no el dato principal: úsalo para matizar o explicar lo que ya muestran las casillas, no lo repitas ni lo cites entero. Si es null, no lo menciones — no es un hueco que señalar.

${PROPOSITO_INSTRUCTIONS}`

  return `${instrucciones}\n\nDatos:\n${JSON.stringify(data)}`
}

function buildWeeklyPrompt(payload: WeeklyPayload): string {
  const { tono, tipo: _tipo, ...data } = payload
  const instrucciones = `${TONE_INSTRUCTIONS[tono]}

${COMMON_CLOSING}

Estás mirando el dashboard semanal de hábitos, no el resumen de un solo día. Por cada hábito hay "estaSemana" (conteos hecho/noHecho/sinResponder sobre "diasTranscurridos" días ya pasados de esta semana, que puede estar apenas empezando) y, solo si el hábito ya existía la semana completa anterior, "semanaAnterior" (los mismos conteos, siempre sobre 7 días).

Si "semanaAnterior" es null en un hábito, ESE HÁBITO es demasiado nuevo para comparar: dilo tal cual ("es muy pronto para comparar este hábito, lleva menos de dos semanas") y NO inventes si mejoró o empeoró. Si "hayHistoriaSuficiente" es false, NINGÚN hábito tiene semana anterior completa todavía: dilo una sola vez de forma general (no lo repitas por cada hábito) y limita el análisis a cómo va esta semana, sin comparar con nada. Cuando sí haya "semanaAnterior", compara los "hecho" de las dos semanas para decir en qué se mejoró y qué empeoró — descríbelo, no te limites a citar los números. Si "diasTranscurridos" de esta semana es bajo (1 o 2), acláralo en vez de sacar conclusiones fuertes sobre una semana que apenas empieza.

Además de los hábitos hay metas de la semana, en "metas": cada una es "texto" (la meta), "resultado" ("cumplida", "no-cumplida" o null si aún no se cierra) y "avances" (la bitácora: cada uno con "fecha", "texto" y "direccion" — "acerca" es un avance, "aleja" es un retroceso). Coméntalas junto con los hábitos: si una meta no tiene avances todavía, dilo ("todavía no has anotado nada sobre esta meta") en vez de suponer que va bien o mal; si tiene avances, di hacia dónde apunta el conjunto (más "acerca" que "aleja", o al revés), sin listar cada avance uno por uno. "metasSemanaAnterior" trae las metas de la semana pasada con su "resultado" final (puede venir vacía, o con "resultado" null si nunca se cerraron) — úsalas solo para dar contexto de continuidad si tiene sentido ("la semana pasada te propusiste X y la cumpliste/no la cumpliste"), sin inventar nada que no diga "resultado". Si tanto "metas" como "metasSemanaAnterior" están vacías, no hables de metas: no es un hueco que haya que señalar, simplemente no se usó esta parte esa semana.

"comentariosDeLaSemana" trae, para los días de esta semana en que la persona escribió algo sobre cómo fue el día, "fecha" y "texto" (los días sin comentario simplemente no aparecen en la lista). Es contexto adicional, igual que en el análisis diario: úsalo para matizar lo que ya muestran los hábitos y las metas, no lo repitas ni lo cites entero, y si la lista viene vacía no lo menciones.

"ideasCerradas" trae las ideas que se cerraron esta semana (pasaron a "hecha" o a "descartada"), cada una con su "texto" y su "estado" -- las que siguen abiertas (pendiente/en-marcha) no aparecen aquí. "hayIdeasCerradasSuficientes" no cuenta solo esta semana: dice si el TOTAL histórico de ideas cerradas, de cualquier semana, ya es suficiente para que un patrón signifique algo. Si es true, puedes comentar qué tipo de ideas se están ejecutando y cuáles se quedan sin avanzar, describiendo un patrón real a partir de los datos. Si es false, NO afirmes ningún patrón ni tendencia -- como mucho, menciona qué pasó esta semana en concreto con "ideasCerradas" (cuántas se cerraron y en qué quedaron), sin generalizar: dos o tres casos no son un patrón, ni siquiera si son los únicos que hay hasta ahora. Si "ideasCerradas" viene vacía o ausente, no hables de ideas: no es un hueco que señalar, simplemente no se cerró ninguna esta semana (aunque "hayIdeasCerradasSuficientes" sea true por cierres de semanas anteriores).

${PROPOSITO_INSTRUCTIONS}`

  return `${instrucciones}\n\nDatos:\n${JSON.stringify(data)}`
}

/**
 * Cómo modula el tono la crítica de una idea. Deliberadamente distinto de
 * TONE_INSTRUCTIONS: aquí la estructura de salida ya está fijada (dos
 * secciones exactas), así que el tono solo ajusta cuánto se suaviza o se
 * abrevia el texto dentro de esas secciones -- no vuelve a definir la
 * estructura ni impone límites de palabras pensados para hábitos/tareas.
 */
const IDEA_TONE_HINTS: Record<Tone, string> = {
  directo: 'Sé directo y sin rodeos: nombra los huecos sin suavizarlos ni matizarlos de más.',
  equilibrado: 'Sé honesto y concreto, sin ser duro ni tampoco condescendiente.',
  breve: 'Sé lo más breve posible en cada sección: una o dos frases por sección, nada más.',
}

/**
 * El texto de la idea se manda inline en el propio prompt (no como "Datos"
 * en JSON, a diferencia de diario/semanal): aquí solo hay dos valores
 * escalares, no una estructura que valga la pena serializar.
 */
function buildIdeaPrompt(payload: IdeaPayload): string {
  const { tono, texto, estado } = payload
  const instrucciones = `Eres un mentor honesto que revisa ideas y planes personales antes de que alguien invierta tiempo en ellos. ${IDEA_TONE_HINTS[tono]}

Vas a analizar UNA idea junto con su estado actual ("pendiente" o "en-marcha"). El estado es solo contexto de en qué punto está -- no lo evalúes ni lo comentes por separado.

Responde con EXACTAMENTE estas dos secciones, en este orden, sin nada antes, sin nada después, y sin ningún encabezado ni sección adicional:

Mejoras y huecos
(Qué le falta al plan, qué no está pensado todavía, qué podría afinarse -- concreto y específico a ESTA idea, nunca una observación genérica que serviría para cualquier idea. Sin elogios de relleno.)

Primer paso
(Una sola acción concreta para arrancar hoy mismo. Un paso, no una lista ni varias opciones.)

Si el texto de la idea es una sola frase corta o muy vaga (por ejemplo, solo un nombre o una intención sin detalle), NO inventes un plan completo ni supongas alcance, público o enfoque que no está escrito: en "Mejoras y huecos" di qué haría falta definir antes de poder evaluarla en serio, y en "Primer paso" propone la acción más pequeña para empezar a definir eso -- no un paso de ejecución de un plan que no existe.

${COMMON_CLOSING}

Escribe en segunda persona (tú). Sin markdown pesado: nada de negritas, asteriscos, numeración ni viñetas -- los dos títulos de sección van tal cual, en texto plano, seguidos de su párrafo.`

  return `${instrucciones}\n\nIdea (estado: ${estado}):\n${texto}`
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

  let rawPayload: unknown
  try {
    rawPayload = await req.json()
  } catch {
    return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)
  }
  if (typeof rawPayload !== 'object' || rawPayload === null) {
    return json({ error: 'Faltan datos.' }, 400)
  }
  const v = rawPayload as Record<string, unknown>
  const tono = toneOf(v)

  let prompt: string
  if (v.tipo === 'semanal') {
    if (!isWeeklyPayload(v)) {
      return json({ error: 'Faltan datos del dashboard semanal.' }, 400)
    }
    prompt = buildWeeklyPrompt({ ...v, tono })
  } else if (v.tipo === 'idea') {
    if (!isIdeaPayload(v)) {
      return json({ error: 'Faltan datos de la idea.' }, 400)
    }
    prompt = buildIdeaPrompt({ ...v, tono })
  } else {
    if (!isDailyPayload(v)) {
      return json({ error: 'Faltan datos de hábitos o tareas.' }, 400)
    }
    prompt = buildDailyPrompt({ ...v, tono })
  }

  // La URL no lleva la clave (va en la cabecera x-goog-api-key), así que es
  // segura de mostrar en los logs y de devolver a la app.
  let geminiRes: Response
  try {
    geminiRes = await callGemini(prompt, apiKey)
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
