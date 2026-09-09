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
