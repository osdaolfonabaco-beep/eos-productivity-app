/**
 * Las dos entidades del modelo de datos y un tipo derivado para la interfaz.
 * Solo tipos: sin lógica.
 */

import type { JournalKeyWrapping } from '../lib/journalCrypto'
import type { Tone } from './preferences'

/**
 * La definición de un hábito. No guarda el historial de cumplimiento:
 * eso son los `HabitEntry`.
 */
export interface Habit {
  id: string
  name: string
  /** Fecha ISO completa de creación, p. ej. `new Date().toISOString()`. */
  createdAt: string
  /**
   * Los hábitos no se borran, se archivan. Un hábito archivado desaparece de
   * las listas activas pero conserva su registro y su historial.
   */
  archived: boolean
  /** Posición en la lista, de menor a mayor. */
  order: number
}

/**
 * El registro de un hábito en un día concreto.
 * Inmutable por fecha: editar el hábito nunca reescribe estos registros.
 */
export interface HabitEntry {
  id: string
  habitId: string
  /** Fecha local en formato `YYYY-MM-DD`. Nunca un objeto `Date`. */
  date: string
  done: boolean
}

/**
 * El estado de un hábito en un día, ya resuelto para la interfaz.
 *
 * `unanswered` significa que no hay `HabitEntry` para ese día. La ausencia de
 * registro no es lo mismo que "no lo hice": son estados distintos y la interfaz
 * los muestra distinto.
 */
export type EntryStatus = 'done' | 'not-done' | 'unanswered'

// --- Finanzas ---------------------------------------------------------------

/** Estado de una deuda. Lo marca la persona; la app no lo infiere. */
export type DebtStatus = 'al-dia' | 'en-mora'

/**
 * La definición de una deuda. El saldo actual no se guarda aquí: se deriva como
 * `openingBalance` menos la suma de los pagos de la deuda.
 */
export interface Debt {
  id: string
  name: string
  /**
   * Pesos colombianos, entero ≥ 0. El saldo en el momento de registrar la
   * deuda; es el punto de partida para "cuánto ha bajado". Solo se cambia como
   * corrección, no para registrar un pago.
   */
  openingBalance: number
  /** Tasa efectiva anual en %, o `null` si no se indicó. Solo informativa. */
  annualRate: number | null
  /** Pesos colombianos, entero ≥ 0. Cuota mensual pactada. Informativa. */
  monthlyPayment: number
  status: DebtStatus
  createdAt: string
  archived: boolean
  order: number
}

/**
 * Un pago hecho a una deuda. No se edita en el sitio; solo se puede borrar
 * entero (para corregir un monto mal registrado), y siempre tras confirmación.
 */
export interface Payment {
  id: string
  debtId: string
  /** Fecha local en formato `YYYY-MM-DD`. Nunca un objeto `Date`. */
  date: string
  /** Pesos colombianos, entero > 0. */
  amount: number
}

// --- Tareas -------------------------------------------------------------

/**
 * Una tarea diaria. No se repite (eso son los hábitos): es de una sola vez,
 * con una fecha opcional.
 */
export interface Task {
  id: string
  text: string
  /**
   * Fecha `YYYY-MM-DD` de la tarea. Siempre el día en que se creó; la interfaz
   * no la muestra ni la deja cambiar. La columna se conserva para el futuro.
   */
  date: string | null
  /**
   * El día para el que se planificó, `YYYY-MM-DD`, elegido por el usuario
   * entre hoy y hoy + 6. `null` significa "tarea de hoy" (el comportamiento
   * de siempre): al agruparla se usa `date` en su lugar. Ver `taskDueDate`.
   */
  plannedFor: string | null
  done: boolean
  /** Fecha ISO completa de creación; ordena dentro de cada grupo. */
  createdAt: string
  archived: boolean
}

// --- Journal --------------------------------------------------------------

/**
 * Una nota del diario. Varias notas pueden compartir el mismo día; dentro de
 * un día se numeran por orden de creación ("Nota 1", "Nota 2"...) — no hay un
 * campo de número guardado, es la posición al ordenar por `createdAt`.
 *
 * Solo las notas de hoy son editables (regla de la interfaz, no de la base de
 * datos); las de días anteriores son de solo lectura, pero se pueden archivar.
 */
export interface JournalNote {
  id: string
  /** El día al que pertenece la nota, `YYYY-MM-DD`. */
  date: string
  /**
   * El texto en claro. `null` cuando `encrypted` es `true`: el contenido real
   * vive cifrado en `ciphertext`/`iv` y hay que desenvolverlo con la DEK
   * (`src/lib/journalCrypto.ts`) antes de mostrarlo.
   */
  text: string | null
  createdAt: string
  archived: boolean
  /** `true` si esta nota se guardó cifrada. Las notas de antes de activar el cifrado son `false`. */
  encrypted: boolean
  ciphertext: string | null
  iv: string | null
}

// --- Ideas ----------------------------------------------------------------

/**
 * Estado de una idea. Lo marca la persona. 'descartada' y 'hecha' son los dos
 * desenlaces posibles de una idea cerrada -- opuestos, nunca se confunden en
 * la interfaz -- y ninguno de los dos es lo mismo que archivada: marcar como
 * 'hecha' también archiva (ver `setIdeaStatus`), pero 'descartada' no.
 */
export type IdeaStatus = 'pendiente' | 'en-marcha' | 'descartada' | 'hecha'

/** Una idea anotada: un solo campo de texto libre y su estado. */
export interface Idea {
  id: string
  text: string
  status: IdeaStatus
  /** Fecha ISO completa de creación. Ordena la lista: más recientes primero. */
  createdAt: string
  archived: boolean
  /**
   * Fecha ISO completa de cuándo la idea pasó a 'hecha' o a 'descartada';
   * `null` mientras sigue abierta (pendiente/en-marcha) o si nunca se cerró.
   * La fija `setIdeaStatus`, no un trigger de la base de datos -- así editar
   * el texto de una idea ya cerrada no cambia cuándo se cerró (a diferencia
   * de `updated_at`, que sí cambia con cualquier edición).
   */
  closedAt: string | null
}

// --- Metas semanales --------------------------------------------------------

/** El resultado de una meta al cerrar la semana. `null` mientras no se cierra. */
export type GoalResult = 'cumplida' | 'no-cumplida'

/**
 * Una meta para una semana concreta (hasta 3 activas por semana; lo valida
 * `createWeeklyGoal`, no una restricción de la base de datos). El texto solo
 * se puede editar en el sitio — no archivar y recrear — porque los avances
 * cuelgan de este id y se perderían.
 */
export interface WeeklyGoal {
  id: string
  /** El lunes de la semana a la que pertenece, `YYYY-MM-DD`. */
  weekStart: string
  text: string
  resultado: GoalResult | null
  createdAt: string
  archived: boolean
}

/** Si un avance acerca a la meta o aleja de ella. */
export type GoalDirection = 'acerca' | 'aleja'

/**
 * Un avance o retroceso anotado bajo una meta. Bitácora de solo-añadir, igual
 * que `HabitEntry` o `Payment`: sin edición ni borrado en la v1.
 */
export interface GoalUpdate {
  id: string
  goalId: string
  /** Fecha local en formato `YYYY-MM-DD`. Nunca un objeto `Date`. */
  date: string
  text: string
  direction: GoalDirection
  createdAt: string
}

// --- Comentario del día -----------------------------------------------------

/**
 * Una o dos frases sobre cómo fue el día, en la pantalla Hoy. Uno por día
 * (`saveDayComment` reemplaza el de esa fecha); solo el de hoy es editable
 * desde la interfaz, sin historial navegable. A diferencia del journal, ESTE
 * texto entra en el análisis diario y semanal — por eso la interfaz avisa
 * junto al campo.
 */
export interface DayComment {
  id: string
  /** Fecha local en formato `YYYY-MM-DD`. */
  date: string
  text: string
  createdAt: string
}

// --- Sueldo -------------------------------------------------------------

/**
 * Cuándo se cobra un gasto fijo. `'ambas'` es cada quincena (mismo monto
 * completo las dos veces); `'primera'`/`'segunda'` es una vez al mes, en esa
 * mitad. No hay un campo de cadencia separado: ver `FixedExpenseCadence`.
 */
export type Quincena = 'primera' | 'segunda' | 'ambas'

/**
 * El sueldo registrado para una quincena concreta (`periodStart` es único).
 * `periodStart`/`periodEnd` en `YYYY-MM-DD`: 1–15 o 16–fin de mes.
 */
export interface SalaryPeriod {
  id: string
  periodStart: string
  periodEnd: string
  /** Pesos colombianos, entero ≥ 0. */
  amount: number
  createdAt: string
  archived: boolean
}

/**
 * Cómo se etiqueta la cadencia de un gasto fijo en la interfaz. Es un dato
 * derivado de `FixedExpense.quincena` (ver `fixedExpenseCadence`); nunca se
 * guarda, para que no pueda desincronizarse de `quincena`.
 */
export type FixedExpenseCadence = 'mensual' | 'quincenal'

/** Un gasto fijo recurrente. */
export interface FixedExpense {
  id: string
  name: string
  /** Pesos colombianos, entero > 0. */
  amount: number
  quincena: Quincena
  createdAt: string
  archived: boolean
}

/** La meta de ahorro (una sola activa a la vez en la v1). */
export interface SavingsGoal {
  id: string
  name: string
  /** Pesos colombianos, entero > 0. */
  targetAmount: number
  /** Fecha `YYYY-MM-DD`, o `null` si no se fijó una. */
  targetDate: string | null
  createdAt: string
  archived: boolean
}

/**
 * Un aporte anotado bajo una meta de ahorro. A diferencia de `Payment`, un
 * aporte mal registrado se archiva en vez de borrarse.
 */
export interface SavingsContribution {
  id: string
  goalId: string
  /** Fecha local en formato `YYYY-MM-DD`. */
  date: string
  /** Pesos colombianos, entero > 0. */
  amount: number
  createdAt: string
  archived: boolean
}

/**
 * Un ingreso suelto, aparte del sueldo de la quincena (que vive en
 * `SalaryPeriod`, no aquí — ver el comentario en `getPeriodBreakdown`).
 * Un ingreso mal registrado se archiva, como `SavingsContribution`.
 */
export interface Income {
  id: string
  /** Fecha local en formato `YYYY-MM-DD`. */
  date: string
  /** Pesos colombianos, entero > 0 y <= 100.000.000.000 (mismo tope que la base). */
  amount: number
  /**
   * Texto libre, no lista cerrada: es personal y abierta (a diferencia de
   * `Debt.status` o `FixedExpense.quincena`). `null` si no se indicó o si
   * quedó vacía tras recortar espacios.
   */
  category: string | null
  /** Nota opcional. `null` si no se indicó o si quedó vacía tras recortar. */
  note: string | null
  createdAt: string
  archived: boolean
}

/**
 * Un gasto real: lo que de verdad se gastó, con fecha y monto — a diferencia
 * de `FixedExpense`, que es solo la plantilla de lo esperado. Ver el
 * comentario largo en `getPeriodBreakdown` para el porqué de la distinción.
 *
 * Puede venir de una plantilla (`fixedExpenseId` apunta a un `FixedExpense`)
 * o ser suelto (`fixedExpenseId` es `null`). El gasto siempre cuenta en la
 * quincena de SU `date`, nunca en la de la plantilla que referencia — pagar
 * con retraso un gasto de la plantilla de la primera quincena, ya en la
 * segunda, es válido y no se corrige ni se avisa.
 */
export interface Expense {
  id: string
  /** Fecha local en formato `YYYY-MM-DD`. */
  date: string
  /** Pesos colombianos, entero > 0 y <= 100.000.000.000 (mismo tope que la base). */
  amount: number
  /** Obligatorio: qué fue el gasto. A diferencia de `category`/`note`, no puede quedar vacío. */
  concept: string
  /** Texto libre. `null` si no se indicó o si quedó vacía tras recortar espacios. */
  category: string | null
  /** Nota opcional. `null` si no se indicó o si quedó vacía tras recortar. */
  note: string | null
  /**
   * La plantilla de gasto fijo de la que vino este gasto, o `null` si fue
   * suelto. Si la plantilla se borra de verdad (no archivada), esto pasa a
   * `null` solo: el gasto ya ocurrió y no desaparece con ella.
   */
  fixedExpenseId: string | null
  createdAt: string
  archived: boolean
}

// --- Cifrado del diario -----------------------------------------------

/**
 * La fila de cifrado del diario (`journal_key`): una sola por usuario. El
 * detalle criptográfico de las envolturas vive en `src/lib/journalCrypto.ts`;
 * aquí solo se añaden el id y las marcas de tiempo que gestiona el servidor.
 */
export interface JournalKey extends JournalKeyWrapping {
  id: string
  createdAt: string
  updatedAt: string
}

// --- Mentor -----------------------------------------------------------

/** Con qué frecuencia se pidió un análisis del mentor. */
export type MentorAnalysisType = 'diario' | 'semanal' | 'mensual'

/**
 * Un análisis que el mentor produjo, guardado para poder releerlo y para
 * que un análisis nuevo pueda ver los anteriores. De solo-añadir, como
 * `HabitEntry` o `Payment`: nunca se sobrescribe, se archiva.
 */
export interface MentorAnalysis {
  id: string
  tipo: MentorAnalysisType
  /**
   * El día (diario, donde siempre es igual a `periodEnd`) o el rango
   * (semanal/mensual) al que se refiere, `YYYY-MM-DD`.
   */
  periodStart: string
  periodEnd: string
  /** El mismo tono que se elige en Ajustes (`Tone`, en `./preferences`). */
  tono: Tone
  /**
   * `true` si el payload que se mandó a la IA para este análisis incluía
   * datos de Dinero. Hoy siempre `false`: ningún payload los incluye
   * todavía (ver `./analysis.ts`) — el día que exista el interruptor "el
   * mentor ve Dinero" en Ajustes, esto registrará el hecho histórico de esa
   * fila en concreto, no el ajuste en vivo.
   */
  incluyoDinero: boolean
  contenido: string
  createdAt: string
  archived: boolean
}

/**
 * El resumen acumulado que el mentor mantiene sobre lo que lleva observado.
 * Una sola fila por usuario (`unique(user_id)` en la base); se reescribe, no
 * se archiva — mismo patrón que `JournalKey`. `previousContenido` es la
 * única versión anterior que se conserva, una red de un paso, no un
 * historial completo: la fuente de verdad para reconstruir el resumen son
 * los `MentorAnalysis` ya guardados.
 */
export interface MentorSummary {
  id: string
  contenido: string
  previousContenido: string | null
  createdAt: string
  updatedAt: string
}

/**
 * El "para qué" del mentor: qué está intentando lograr el usuario, en qué
 * plazo, y qué le está costando -- lo escribe el usuario, no el mentor (a
 * diferencia de `MentorSummary`). Una sola fila por usuario, que se
 * reescribe; los tres campos son independientes y pueden estar en `null`
 * (nunca cadena vacía). `reviewedAt` es un hecho del dominio distinto de
 * `updatedAt`: cuándo el usuario confirmó por última vez que esto sigue
 * vigente, no cuándo cambió la fila por última vez (ver el comentario de
 * cabecera de `supabase/mentor-purpose.sql`).
 */
export interface MentorPurpose {
  id: string
  objetivo: string | null
  plazo: string | null
  dificultad: string | null
  reviewedAt: string
  createdAt: string
  updatedAt: string
}
