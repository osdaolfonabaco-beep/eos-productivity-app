/**
 * El módulo de datos de tareas diarias, contra Supabase.
 *
 * Las tareas no se repiten (eso son los hábitos). `bucketTasks` reparte una
 * lista en los cuatro grupos por fecha; es puro y síncrono.
 */

import { isISODate } from './dates'
import { TASK_COLS, rowToTask, taskToRow } from './rows'
import { supabase, unwrap } from './supabase'
import type { Task } from './types'

/** Todas las tareas no archivadas. La agrupación la hace `bucketTasks`. */
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

/** Crea una tarea. `date` en `YYYY-MM-DD`, o `null` para sin fecha. */
export async function createTask(text: string, date: string | null): Promise<Task> {
  const clean = text.trim()
  if (!clean) throw new Error('La tarea no puede estar vacía')
  if (date !== null && !isISODate(date)) {
    throw new Error(`Fecha inválida: ${date} (se espera YYYY-MM-DD)`)
  }

  const task: Task = {
    id: crypto.randomUUID(),
    text: clean,
    date,
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

/**
 * Cambia el texto y/o la fecha de una tarea. `date: null` la deja sin fecha.
 * Sin reprogramar la fecha, "Atrasadas" no tendría salida.
 */
export async function updateTask(
  id: string,
  patch: { text?: string; date?: string | null },
): Promise<Task> {
  const update: Record<string, unknown> = {}
  if (patch.text !== undefined) {
    const clean = patch.text.trim()
    if (!clean) throw new Error('La tarea no puede estar vacía')
    update.text = clean
  }
  if (patch.date !== undefined) {
    if (patch.date !== null && !isISODate(patch.date)) {
      throw new Error(`Fecha inválida: ${patch.date} (se espera YYYY-MM-DD)`)
    }
    update.date = patch.date
  }

  const rows = unwrap(
    await supabase.from('tasks').update(update).eq('id', id).select(TASK_COLS),
    'updateTask',
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

export interface TaskBuckets {
  hoy: Task[]
  atrasadas: Task[]
  proximas: Task[]
  sinFecha: Task[]
}

/**
 * Reparte las tareas en los cuatro grupos por fecha. Dentro de cada grupo, las
 * no hechas primero (por fecha y creación) y las hechas al fondo.
 */
export function bucketTasks(tasks: Task[], today: string): TaskBuckets {
  const buckets: TaskBuckets = { hoy: [], atrasadas: [], proximas: [], sinFecha: [] }

  for (const t of tasks) {
    if (t.date === null) buckets.sinFecha.push(t)
    else if (t.date === today) buckets.hoy.push(t)
    else if (t.date < today) buckets.atrasadas.push(t)
    else buckets.proximas.push(t)
  }

  const order = (a: Task, b: Task): number => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1
    return a.createdAt < b.createdAt ? -1 : 1
  }
  buckets.hoy.sort(order)
  buckets.atrasadas.sort(order)
  buckets.proximas.sort(order)
  buckets.sinFecha.sort(order)

  return buckets
}
