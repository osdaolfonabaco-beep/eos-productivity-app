/**
 * Las dos entidades del modelo de datos y un tipo derivado para la interfaz.
 * Solo tipos: sin lógica.
 */

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
