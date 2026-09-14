/**
 * El módulo de datos de tareas diarias, contra Supabase.
 *
 * Las tareas no se repiten (eso son los hábitos). Cada una tiene dos fechas
 * distintas:
 * - `date`: siempre el día en que se creó. La interfaz no la muestra ni la
 *   deja cambiar.
 * - `plannedFor`: el día para el que se planificó, elegido por el usuario
 *   dentro de la ventana móvil de 7 días (hoy a hoy + 6). `null` significa
 *   "tarea de hoy" — el comportamiento de siempre.
 *
 * `taskDueDate` decide cuál de las dos manda al agrupar. La ventana se
 * calcula en cada llamada a `planningWindow`; nunca se guarda un rango.
 */

import { addDays, isISODate, todayISO } from './dates'
import { TASK_COLS, rowToTask, taskToRow } from './rows'
import { supabase, unwrap } from './supabase'
import type { Task } from './types'

const PLANNING_WINDOW_DAYS = 7

/**
 * Los días de la ventana móvil de planificación, empezando hoy. Se recalcula
 * en cada llamada a partir de `today`; no se guarda en ningún sitio.
 */
export function planningWindow(today: string = todayISO()): string[] {
  return Array.from({ length: PLANNING_WINDOW_DAYS }, (_, i) => addDays(today, i))
}

function assertInWindow(plannedFor: string | null, today: string): void {
  if (plannedFor === null) return
  if (!isISODate(plannedFor) || !planningWindow(today).includes(plannedFor)) {
    throw new Error('La fecha debe estar entre hoy y los próximos 7 días')
  }
}

/** La fecha "real" de una tarea para agruparla: la planificada, o si no hay, la de creación. */
export function taskDueDate(t: Task): string | null {
  return t.plannedFor ?? t.date
}

/** Todas las tareas no archivadas. La agrupación la hacen `bucketTasks` y `groupTasksByWindow`. */
export async function listTasks(): Promise<Task[]> {
  const rows = unwrap(
    await supabase
      .from('tasks')
      .select(TASK_COLS)
      .eq('archived', false)
      .order('date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    'listTasks',
  )
  return rows.map(rowToTask)
}

/** Crea una tarea. `plannedFor` en `null` (por defecto) es "de hoy"; si no, debe caer dentro de la ventana de 7 días. */
export async function createTask(text: string, plannedFor: string | null = null): Promise<Task> {
  const clean = text.trim()
  if (!clean) throw new Error('La tarea no puede estar vacía')
  const today = todayISO()
  assertInWindow(plannedFor, today)

  const task: Task = {
    id: crypto.randomUUID(),
    text: clean,
    date: today,
    plannedFor,
    done: false,
    createdAt: new Date().toISOString(),
    archived: false,
  }
  const rows = unwrap(
    await supabase.from('tasks').insert(taskToRow(task)).select(TASK_COLS),
    'createTask',
  )
  return rowToTask(rows[0])
}

/** Marca una tarea como hecha o la deshace. */
export async function setTaskDone(id: string, done: boolean): Promise<void> {
  const res = await supabase.from('tasks').update({ done }).eq('id', id)
  if (res.error) throw new Error(`setTaskDone: ${res.error.message}`)
}

/** Cambia el texto de una tarea. */
export async function updateTaskText(id: string, text: string): Promise<Task> {
  const clean = text.trim()
  if (!clean) throw new Error('La tarea no puede estar vacía')

  const rows = unwrap(
    await supabase.from('tasks').update({ text: clean }).eq('id', id).select(TASK_COLS),
    'updateTaskText',
  )
  if (!rows[0]) throw new Error(`No existe la tarea ${id}`)
  return rowToTask(rows[0])
}

/**
 * Mueve una tarea a otro día dentro de la ventana de planificación (o de
 * vuelta a "hoy", con `null`). Pensada para la vista de planificación.
 */
export async function setTaskPlannedFor(id: string, plannedFor: string | null): Promise<Task> {
  assertInWindow(plannedFor, todayISO())

  const rows = unwrap(
    await supabase
      .from('tasks')
      .update({ planned_for: plannedFor })
      .eq('id', id)
      .select(TASK_COLS),
    'setTaskPlannedFor',
  )
  if (!rows[0]) throw new Error(`No existe la tarea ${id}`)
  return rowToTask(rows[0])
}

/** Archiva una tarea: sale de la lista pero se conserva. Idempotente. */
export async function archiveTask(id: string): Promise<void> {
  const res = await supabase.from('tasks').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveTask: ${res.error.message}`)
}

// --- Agrupación (pura) ------------------------------------------------

function sortByDoneThenCreated(tasks: Task[]): void {
  tasks.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.createdAt < b.createdAt ? -1 : 1
  })
}

export interface TaskBuckets {
  /** Las de hoy: `taskDueDate` igual a hoy, o sin fecha. */
  hoy: Task[]
  /** Las de días anteriores SIN hacer, que se arrastran hasta hacerlas o archivarlas. */
  atrasadas: Task[]
}

/**
 * Reparte las tareas en dos grupos para la pantalla Hoy. Una tarea planificada
 * a futuro no cae en ninguno de los dos: no aparece aquí, solo en la vista de
 * planificación. Una de días anteriores ya hecha tampoco cae en ningún grupo:
 * se queda en la base de datos como historial. Dentro de cada grupo, las
 * hechas van al fondo.
 */
export function bucketTasks(tasks: Task[], today: string): TaskBuckets {
  const hoy: Task[] = []
  const atrasadas: Task[] = []

  for (const t of tasks) {
    const due = taskDueDate(t)
    if (due === null || due === today) {
      hoy.push(t)
    } else if (due < today) {
      if (!t.done) atrasadas.push(t)
    }
    // due > today: planificada a futuro, no se muestra en Hoy.
  }

  sortByDoneThenCreated(hoy)
  atrasadas.sort((a, b) => {
    const da = taskDueDate(a) ?? ''
    const db = taskDueDate(b) ?? ''
    if (da !== db) return da < db ? -1 : 1
    return a.createdAt < b.createdAt ? -1 : 1
  })

  return { hoy, atrasadas }
}

/** Un día de la ventana de planificación con las tareas que le tocan. */
export interface PlannedDay {
  date: string
  tasks: Task[]
}

/**
 * Agrupa las tareas por día dentro de la ventana móvil de 7 días (una entrada
 * por día, en orden, aunque esté vacío). Una tarea atrasada (de antes de hoy)
 * no aparece aquí: esta vista es solo hacia adelante, se ve en Hoy.
 */
export function groupTasksByWindow(tasks: Task[], today: string = todayISO()): PlannedDay[] {
  const days = planningWindow(today)
  const byDate = new Map<string, Task[]>(days.map((d) => [d, []]))

  for (const t of tasks) {
    const due = taskDueDate(t)
    byDate.get(due ?? '')?.push(t)
  }
  for (const dayTasks of byDate.values()) sortByDoneThenCreated(dayTasks)

  return days.map((date) => ({ date, tasks: byDate.get(date) ?? [] }))
}
