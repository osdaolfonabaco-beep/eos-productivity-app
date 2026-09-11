/**
 * El módulo de datos de tareas diarias, contra Supabase.
 *
 * Las tareas no se repiten (eso son los hábitos) y no llevan fecha elegible:
 * son siempre del día en que se crean. La columna `date` de la tabla se
 * conserva, pero la interfaz ni la muestra ni la deja cambiar.
 */

import { todayISO } from './dates'
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

/** Crea una tarea para el día de hoy. */
export async function createTask(text: string): Promise<Task> {
  const clean = text.trim()
  if (!clean) throw new Error('La tarea no puede estar vacía')

  const task: Task = {
    id: crypto.randomUUID(),
    text: clean,
    date: todayISO(),
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

/** Archiva una tarea: sale de la lista pero se conserva. Idempotente. */
export async function archiveTask(id: string): Promise<void> {
  const res = await supabase.from('tasks').update({ archived: true }).eq('id', id)
  if (res.error) throw new Error(`archiveTask: ${res.error.message}`)
}

// --- Agrupación (pura) ------------------------------------------------

export interface TaskBuckets {
  /** Las de hoy. Defensivamente, también las sin fecha o con fecha futura. */
  hoy: Task[]
  /** Las de días anteriores SIN hacer, que se arrastran hasta hacerlas o archivarlas. */
  atrasadas: Task[]
}

/**
 * Reparte las tareas en dos grupos. Una tarea de días anteriores ya hecha no
 * cae en ningún grupo: se queda en la base de datos como historial. Dentro de
 * cada grupo, las hechas van al fondo.
 */
export function bucketTasks(tasks: Task[], today: string): TaskBuckets {
  const hoy: Task[] = []
  const atrasadas: Task[] = []

  for (const t of tasks) {
    if (t.date !== null && t.date < today) {
      if (!t.done) atrasadas.push(t)
    } else {
      hoy.push(t)
    }
  }

  hoy.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    return a.createdAt < b.createdAt ? -1 : 1
  })
  atrasadas.sort((a, b) => {
    const da = a.date ?? ''
    const db = b.date ?? ''
    if (da !== db) return da < db ? -1 : 1
    return a.createdAt < b.createdAt ? -1 : 1
  })

  return { hoy, atrasadas }
}
