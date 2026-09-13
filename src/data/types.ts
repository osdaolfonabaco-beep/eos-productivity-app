/**
 * Las dos entidades del modelo de datos y un tipo derivado para la interfaz.
 * Solo tipos: sin lógica.
 */

import type { JournalKeyWrapping } from '../lib/journalCrypto'

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
  text: string
  createdAt: string
  archived: boolean
}

// --- Ideas ----------------------------------------------------------------

/** Estado de una idea. Lo marca la persona; "descartada" no es lo mismo que archivada. */
export type IdeaStatus = 'pendiente' | 'en-marcha' | 'descartada'

/** Una idea anotada: un solo campo de texto libre y su estado. */
export interface Idea {
  id: string
  text: string
  status: IdeaStatus
  /** Fecha ISO completa de creación. Ordena la lista: más recientes primero. */
  createdAt: string
  archived: boolean
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
