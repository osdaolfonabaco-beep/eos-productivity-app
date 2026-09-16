/**
 * Respaldo: exportar e importar todos los datos como un solo objeto JSON.
 *
 * "Exportar" y "reemplazar" trabajan contra Supabase (`async`). "Copia local"
 * lee lo que quedó en `localStorage` de antes de la migración (síncrono).
 *
 * Cubre las 16 tablas de la app: hábitos, registros, deudas, pagos, ideas,
 * tareas, journal (cifrado, ver más abajo), metas semanales y sus avances,
 * comentarios del día, y las seis de Dinero (sueldos, gastos fijos, meta de
 * ahorro, aportes, ingresos, gastos).
 *
 * Deliberadamente NO cubre: `journal_key` (la fila de cifrado del diario, ver
 * `journalKey.ts` — la DEK nunca cambia y el respaldo nunca la toca; si se
 * borrara o reemplazara, todas las notas cifradas quedarían ilegibles para
 * siempre), `push_subscriptions` (un endpoint de push es de un
 * dispositivo/navegador concreto; restaurarlo en otro no significa nada) ni
 * `reminder_log` (bitácora del servidor).
 */

import {
  DAY_COMMENT_COLS,
  DEBT_COLS,
  ENTRY_COLS,
  EXPENSE_COLS,
  FIXED_EXPENSE_COLS,
  GOAL_COLS,
  GOAL_UPDATE_COLS,
  HABIT_COLS,
  IDEA_COLS,
  INCOME_COLS,
  JOURNAL_COLS,
  PAYMENT_COLS,
  SALARY_PERIOD_COLS,
  SAVINGS_CONTRIBUTION_COLS,
  SAVINGS_GOAL_COLS,
  TASK_COLS,
  dayCommentToRow,
  debtToRow,
  entryToRow,
  expenseToRow,
  fixedExpenseToRow,
  goalToRow,
  goalUpdateToRow,
  habitToRow,
  ideaToRow,
  incomeToRow,
  journalNoteToRow,
  paymentToRow,
  rowToDayComment,
  rowToDebt,
  rowToEntry,
  rowToExpense,
  rowToFixedExpense,
  rowToGoal,
  rowToGoalUpdate,
  rowToHabit,
  rowToIdea,
  rowToIncome,
  rowToJournalNote,
  rowToPayment,
  rowToSalaryPeriod,
  rowToSavingsContribution,
  rowToSavingsGoal,
  rowToTask,
  salaryPeriodToRow,
  savingsContributionToRow,
  savingsGoalToRow,
  taskToRow,
} from './rows'
import { KEYS, readList } from './storage'
import { assertOk, supabase, unwrap } from './supabase'
import type {
  DayComment,
  Debt,
  Expense,
  FixedExpense,
  GoalUpdate,
  Habit,
  HabitEntry,
  Idea,
  Income,
  JournalNote,
  Payment,
  SalaryPeriod,
  SavingsContribution,
  SavingsGoal,
  Task,
  WeeklyGoal,
} from './types'

const APP = 'productividad'
const VERSION = 2

/** Las dieciséis colecciones. */
export interface BackupData {
  habits: Habit[]
  entries: HabitEntry[]
  debts: Debt[]
  payments: Payment[]
  ideas: Idea[]
  tasks: Task[]
  journal: JournalNote[]
  weeklyGoals: WeeklyGoal[]
  goalUpdates: GoalUpdate[]
  dayComments: DayComment[]
  salaryPeriods: SalaryPeriod[]
  fixedExpenses: FixedExpense[]
  savingsGoals: SavingsGoal[]
  savingsContributions: SavingsContribution[]
  incomes: Income[]
  expenses: Expense[]
}

/** El archivo de respaldo tal como se descarga. */
export interface BackupFile {
  app: typeof APP
  version: number
  exportedAt: string
  data: BackupData
}

/**
 * `habits`, `entries`, `debts` y `payments` existen desde el primer formato
 * de respaldo (versión 1) y siempre se exigen. El resto se fue añadiendo
 * después (`ideas`... hasta las seis de Dinero en la versión 2): un respaldo
 * viejo simplemente no las trae.
 */
const REQUIRED_KEYS = ['habits', 'entries', 'debts', 'payments'] as const

const OPTIONAL_KEYS = [
  'ideas',
  'tasks',
  'journal',
  'weeklyGoals',
  'goalUpdates',
  'dayComments',
  'salaryPeriods',
  'fixedExpenses',
  'savingsGoals',
  'savingsContributions',
  'incomes',
  'expenses',
] as const

/**
 * El resultado de validar un archivo: los datos ya tipados, más QUÉ
 * colecciones venían de verdad en el archivo. Ver el porqué de `present` en
 * el comentario grande de `parseBackup`, más abajo -- es el dato que evita
 * que importar un respaldo viejo borre datos que ese respaldo nunca tuvo.
 */
export interface ParsedBackup {
  version: number
  data: BackupData
  present: ReadonlySet<keyof BackupData>
}

function wrap(data: BackupData): BackupFile {
  return { app: APP, version: VERSION, exportedAt: new Date().toISOString(), data }
}

/** Reúne el estado de la nube en un objeto de respaldo. */
export async function exportAll(): Promise<BackupFile> {
  const [
    habits,
    entries,
    debts,
    payments,
    ideas,
    tasks,
    journal,
    weeklyGoals,
    goalUpdates,
    dayComments,
    salaryPeriods,
    fixedExpenses,
    savingsGoals,
    savingsContributions,
    incomes,
    expenses,
  ] = await Promise.all([
    supabase.from('habits').select(HABIT_COLS),
    supabase.from('habit_entries').select(ENTRY_COLS),
    supabase.from('debts').select(DEBT_COLS),
    supabase.from('payments').select(PAYMENT_COLS),
    supabase.from('ideas').select(IDEA_COLS),
    supabase.from('tasks').select(TASK_COLS),
    supabase.from('journal_entries').select(JOURNAL_COLS),
    supabase.from('weekly_goals').select(GOAL_COLS),
    supabase.from('goal_updates').select(GOAL_UPDATE_COLS),
    supabase.from('day_comments').select(DAY_COMMENT_COLS),
    supabase.from('salary_periods').select(SALARY_PERIOD_COLS),
    supabase.from('fixed_expenses').select(FIXED_EXPENSE_COLS),
    supabase.from('savings_goal').select(SAVINGS_GOAL_COLS),
    supabase.from('savings_contributions').select(SAVINGS_CONTRIBUTION_COLS),
    supabase.from('incomes').select(INCOME_COLS),
    supabase.from('expenses').select(EXPENSE_COLS),
  ])
  return wrap({
    habits: unwrap(habits, 'exportAll hábitos').map(rowToHabit),
    entries: unwrap(entries, 'exportAll registros').map(rowToEntry),
    debts: unwrap(debts, 'exportAll deudas').map(rowToDebt),
    payments: unwrap(payments, 'exportAll pagos').map(rowToPayment),
    ideas: unwrap(ideas, 'exportAll ideas').map(rowToIdea),
    tasks: unwrap(tasks, 'exportAll tareas').map(rowToTask),
    journal: unwrap(journal, 'exportAll diario').map(rowToJournalNote),
    weeklyGoals: unwrap(weeklyGoals, 'exportAll metas').map(rowToGoal),
    goalUpdates: unwrap(goalUpdates, 'exportAll avances').map(rowToGoalUpdate),
    dayComments: unwrap(dayComments, 'exportAll comentarios del día').map(rowToDayComment),
    salaryPeriods: unwrap(salaryPeriods, 'exportAll sueldos').map(rowToSalaryPeriod),
    fixedExpenses: unwrap(fixedExpenses, 'exportAll gastos fijos').map(rowToFixedExpense),
    savingsGoals: unwrap(savingsGoals, 'exportAll metas de ahorro').map(rowToSavingsGoal),
    savingsContributions: unwrap(savingsContributions, 'exportAll aportes').map(
      rowToSavingsContribution,
    ),
    incomes: unwrap(incomes, 'exportAll ingresos').map(rowToIncome),
    expenses: unwrap(expenses, 'exportAll gastos').map(rowToExpense),
  })
}

/** Los datos que quedaron en `localStorage` de este dispositivo. */
export function readLocalBackup(): BackupData {
  return {
    habits: readList<Habit>(KEYS.habits),
    entries: readList<HabitEntry>(KEYS.entries),
    debts: readList<Debt>(KEYS.debts),
    payments: readList<Payment>(KEYS.payments),
    // Ideas, Tareas, Journal, Metas, el comentario del día y las seis de
    // Dinero nunca vivieron en localStorage: nacieron en la nube.
    ideas: [],
    tasks: [],
    journal: [],
    weeklyGoals: [],
    goalUpdates: [],
    dayComments: [],
    salaryPeriods: [],
    fixedExpenses: [],
    savingsGoals: [],
    savingsContributions: [],
    incomes: [],
    expenses: [],
  }
}

/** La copia local envuelta como archivo de respaldo, para descargarla. */
export function exportLocal(): BackupFile {
  return wrap(readLocalBackup())
}

/**
 * Cuántas filas hay HOY en la nube, tabla por tabla -- para mostrar junto a
 * las del archivo antes de confirmar un reemplazo (ver `SettingsView`). Usa
 * `count: 'exact', head: true`: cuenta sin traer las filas.
 */
export type CloudCounts = Record<keyof BackupData, number>

async function countTable(table: string): Promise<number> {
  const res = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (res.error) throw new Error(`countAll ${table}: ${res.error.message}`)
  return res.count ?? 0
}

export async function countAll(): Promise<CloudCounts> {
  const [
    habits,
    entries,
    debts,
    payments,
    ideas,
    tasks,
    journal,
    weeklyGoals,
    goalUpdates,
    dayComments,
    salaryPeriods,
    fixedExpenses,
    savingsGoals,
    savingsContributions,
    incomes,
    expenses,
  ] = await Promise.all([
    countTable('habits'),
    countTable('habit_entries'),
    countTable('debts'),
    countTable('payments'),
    countTable('ideas'),
    countTable('tasks'),
    countTable('journal_entries'),
    countTable('weekly_goals'),
    countTable('goal_updates'),
    countTable('day_comments'),
    countTable('salary_periods'),
    countTable('fixed_expenses'),
    countTable('savings_goal'),
    countTable('savings_contributions'),
    countTable('incomes'),
    countTable('expenses'),
  ])
  return {
    habits,
    entries,
    debts,
    payments,
    ideas,
    tasks,
    journal,
    weeklyGoals,
    goalUpdates,
    dayComments,
    salaryPeriods,
    fixedExpenses,
    savingsGoals,
    savingsContributions,
    incomes,
    expenses,
  }
}

/**
 * Valida que `value` sea un respaldo de Productividad y devuelve tanto los
 * datos como QUÉ colecciones venían de verdad en el archivo. Lanza un
 * `Error` claro si no es válido. No comprueba cada campo: son datos propios
 * de un solo usuario.
 *
 * ============================================================================
 * POR QUÉ EXISTE `present` -- LÉELO ANTES DE TOCAR ESTA FUNCIÓN O `applyBackup`
 * ============================================================================
 *
 * Antes de que este respaldo cubriera Dinero, una colección ausente del
 * archivo (por ejemplo `ideas`, en un respaldo de antes de que existiera esa
 * pestaña) se rellenaba con `?? []` y ya está: total, `applyBackup` tampoco
 * tocaba esas tablas todavía, así que "ausente" y "vacío" daban el mismo
 * resultado y nadie notó la diferencia.
 *
 * Eso dejó de ser inofensivo en cuanto `applyBackup` empezó a BORRAR e
 * insertar las seis tablas de Dinero. Si esta función siguiera rellenando
 * con `?? []` una colección ausente, el escenario sería:
 *
 *   1. Importas un respaldo de la versión 1 (de antes de este cambio: sin
 *      `incomes`, `expenses`, `salaryPeriods`, `fixedExpenses`,
 *      `savingsGoals` ni `savingsContributions` -- perfectamente válido,
 *      todos los que ya descargaste son así).
 *   2. `parseBackup` no encuentra esas seis claves en el archivo y las
 *      rellena con `[]`, IGUAL que rellenaría `ideas` en un respaldo más
 *      viejo todavía. `data.incomes` queda en `[]`, indistinguible de "este
 *      archivo dice que no tienes ingresos".
 *   3. `applyBackup` ve `data.incomes = []` y, sin más contexto, hace lo que
 *      hace con cualquier tabla: la BORRA por completo y no inserta nada
 *      (`data.incomes.length` es 0).
 *   4. Lo mismo con las otras cinco. Resultado: las seis tablas de Dinero
 *      quedan vacías EN SILENCIO, sin ningún aviso, solo por haber importado
 *      un respaldo de antes de que existieran.
 *
 * `present` es la corrección: en vez de que `applyBackup` decida qué borrar
 * mirando si la lista está vacía, decide mirando si la CLAVE estaba en el
 * archivo. Una colección ausente (`present` no la incluye) se deja
 * intacta en la nube, aunque `data` tenga que rellenarla con `[]` para que
 * el resto del código pueda seguir tipando `BackupData` sin `undefined` por
 * todas partes. Una colección presente pero vacía a propósito (el archivo
 * SÍ trae `"incomes": []` porque de verdad no tenías ingresos al exportar)
 * sigue vaciando la tabla como es debido -- ese es un reemplazo real, no un
 * hueco del formato.
 *
 * Si en el futuro simplificas esto para que `applyBackup` vuelva a mirar
 * solo `data.<tabla>.length`, estás reintroduciendo exactamente el bug de
 * arriba: cualquier respaldo anterior a la próxima tabla que se añada
 * borrará esa tabla en la nube sin que nadie lo pida.
 * ============================================================================
 */
export function parseBackup(value: unknown): ParsedBackup {
  if (typeof value !== 'object' || value === null) {
    throw new Error('El archivo no es un respaldo válido.')
  }
  const file = value as Record<string, unknown>
  if (file.app !== APP) {
    throw new Error('El archivo no parece un respaldo de Eos.')
  }
  if (typeof file.version !== 'number') {
    throw new Error('El archivo no es un respaldo válido.')
  }
  if (file.version > VERSION) {
    throw new Error(
      'Este respaldo se hizo con una versión más nueva de la app. Actualiza la app antes de importarlo.',
    )
  }
  if (typeof file.data !== 'object' || file.data === null) {
    throw new Error('El respaldo no contiene datos.')
  }

  const data = file.data as Record<string, unknown>

  for (const key of REQUIRED_KEYS) {
    if (!Array.isArray(data[key])) {
      throw new Error(`El respaldo no contiene la lista "${key}".`)
    }
  }
  // Las opcionales pueden faltar del todo (respaldo de una versión anterior a
  // esa colección) pero, si están, tienen que ser una lista -- nunca otra
  // cosa a medias.
  for (const key of OPTIONAL_KEYS) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`La lista "${key}" del respaldo no es válida.`)
    }
  }

  const present = new Set<keyof BackupData>(REQUIRED_KEYS)
  for (const key of OPTIONAL_KEYS) {
    if (data[key] !== undefined) present.add(key)
  }

  return {
    version: file.version,
    present,
    data: {
      habits: data.habits as Habit[],
      entries: data.entries as HabitEntry[],
      debts: data.debts as Debt[],
      payments: data.payments as Payment[],
      ideas: (data.ideas as Idea[] | undefined) ?? [],
      tasks: (data.tasks as Task[] | undefined) ?? [],
      journal: (data.journal as JournalNote[] | undefined) ?? [],
      weeklyGoals: (data.weeklyGoals as WeeklyGoal[] | undefined) ?? [],
      goalUpdates: (data.goalUpdates as GoalUpdate[] | undefined) ?? [],
      dayComments: (data.dayComments as DayComment[] | undefined) ?? [],
      salaryPeriods: (data.salaryPeriods as SalaryPeriod[] | undefined) ?? [],
      fixedExpenses: (data.fixedExpenses as FixedExpense[] | undefined) ?? [],
      savingsGoals: (data.savingsGoals as SavingsGoal[] | undefined) ?? [],
      savingsContributions:
        (data.savingsContributions as SavingsContribution[] | undefined) ?? [],
      incomes: (data.incomes as Income[] | undefined) ?? [],
      expenses: (data.expenses as Expense[] | undefined) ?? [],
    },
  }
}

/**
 * Reemplaza en la nube SOLO las colecciones que `present` marca como
 * incluidas en el archivo -- una colección ausente (respaldo de un formato
 * anterior a ella) se deja tal cual está en la nube, sin borrar nada. Ver el
 * comentario grande en `parseBackup` para el porqué exacto de `present`: sin
 * él, esta función borraría en silencio cualquier tabla que el archivo
 * importado no llegara a conocer.
 *
 * Borra en orden de claves foráneas (hijas primero) e inserta en el orden
 * inverso (padres primero):
 *   payments → debts ; habit_entries → habits ; goal_updates → weekly_goals ;
 *   expenses → fixed_expenses (on delete set null) ;
 *   savings_contributions → savings_goal (on delete cascade).
 *
 * NO es una transacción entre tablas: si falla a mitad, queda parcial y hay
 * que reintentar (por eso la interfaz exige bajar un respaldo antes). Con
 * las 16 tablas de hoy esa ventana de fallo parcial es más grande que cuando
 * este archivo cubría solo cuatro -- más pasos secuenciales, más ocasiones
 * para que uno falle a mitad del proceso. Arreglarlo de verdad requiere una
 * función RPC en Postgres que envuelva todo el borrado + inserción en una
 * sola transacción de base de datos (`begin`/`commit` del lado del
 * servidor); no se resuelve aquí, queda para un paso aparte si hace falta.
 */
export async function applyBackup(parsed: ParsedBackup): Promise<void> {
  const { data, present } = parsed
  const clear = (table: string) => supabase.from(table).delete().not('id', 'is', null)

  // --- Borrar: hijas antes que padres ---
  if (present.has('payments')) assertOk(await clear('payments'), 'reemplazar: borrar pagos')
  if (present.has('entries')) assertOk(await clear('habit_entries'), 'reemplazar: borrar registros')
  if (present.has('goalUpdates')) assertOk(await clear('goal_updates'), 'reemplazar: borrar avances')
  if (present.has('expenses')) assertOk(await clear('expenses'), 'reemplazar: borrar gastos')
  if (present.has('savingsContributions')) {
    assertOk(await clear('savings_contributions'), 'reemplazar: borrar aportes')
  }
  if (present.has('debts')) assertOk(await clear('debts'), 'reemplazar: borrar deudas')
  if (present.has('habits')) assertOk(await clear('habits'), 'reemplazar: borrar hábitos')
  if (present.has('weeklyGoals')) assertOk(await clear('weekly_goals'), 'reemplazar: borrar metas')
  if (present.has('ideas')) assertOk(await clear('ideas'), 'reemplazar: borrar ideas')
  if (present.has('tasks')) assertOk(await clear('tasks'), 'reemplazar: borrar tareas')
  if (present.has('journal')) assertOk(await clear('journal_entries'), 'reemplazar: borrar diario')
  if (present.has('dayComments')) {
    assertOk(await clear('day_comments'), 'reemplazar: borrar comentarios del día')
  }
  if (present.has('fixedExpenses')) {
    assertOk(await clear('fixed_expenses'), 'reemplazar: borrar gastos fijos')
  }
  if (present.has('savingsGoals')) assertOk(await clear('savings_goal'), 'reemplazar: borrar metas de ahorro')
  if (present.has('salaryPeriods')) assertOk(await clear('salary_periods'), 'reemplazar: borrar sueldos')
  if (present.has('incomes')) assertOk(await clear('incomes'), 'reemplazar: borrar ingresos')

  // --- Insertar: padres antes que hijas ---
  if (present.has('habits') && data.habits.length) {
    assertOk(await supabase.from('habits').insert(data.habits.map(habitToRow)), 'reemplazar: hábitos')
  }
  if (present.has('debts') && data.debts.length) {
    assertOk(await supabase.from('debts').insert(data.debts.map(debtToRow)), 'reemplazar: deudas')
  }
  if (present.has('weeklyGoals') && data.weeklyGoals.length) {
    assertOk(
      await supabase.from('weekly_goals').insert(data.weeklyGoals.map(goalToRow)),
      'reemplazar: metas',
    )
  }
  if (present.has('fixedExpenses') && data.fixedExpenses.length) {
    assertOk(
      await supabase.from('fixed_expenses').insert(data.fixedExpenses.map(fixedExpenseToRow)),
      'reemplazar: gastos fijos',
    )
  }
  if (present.has('savingsGoals') && data.savingsGoals.length) {
    assertOk(
      await supabase.from('savings_goal').insert(data.savingsGoals.map(savingsGoalToRow)),
      'reemplazar: metas de ahorro',
    )
  }
  if (present.has('salaryPeriods') && data.salaryPeriods.length) {
    assertOk(
      await supabase.from('salary_periods').insert(data.salaryPeriods.map(salaryPeriodToRow)),
      'reemplazar: sueldos',
    )
  }
  if (present.has('incomes') && data.incomes.length) {
    assertOk(await supabase.from('incomes').insert(data.incomes.map(incomeToRow)), 'reemplazar: ingresos')
  }
  if (present.has('entries') && data.entries.length) {
    assertOk(
      await supabase.from('habit_entries').insert(data.entries.map(entryToRow)),
      'reemplazar: registros',
    )
  }
  if (present.has('payments') && data.payments.length) {
    assertOk(
      await supabase.from('payments').insert(data.payments.map(paymentToRow)),
      'reemplazar: pagos',
    )
  }
  if (present.has('goalUpdates') && data.goalUpdates.length) {
    assertOk(
      await supabase.from('goal_updates').insert(data.goalUpdates.map(goalUpdateToRow)),
      'reemplazar: avances',
    )
  }
  if (present.has('ideas') && data.ideas.length) {
    assertOk(await supabase.from('ideas').insert(data.ideas.map(ideaToRow)), 'reemplazar: ideas')
  }
  if (present.has('tasks') && data.tasks.length) {
    assertOk(await supabase.from('tasks').insert(data.tasks.map(taskToRow)), 'reemplazar: tareas')
  }
  if (present.has('journal') && data.journal.length) {
    assertOk(
      await supabase.from('journal_entries').insert(data.journal.map(journalNoteToRow)),
      'reemplazar: diario',
    )
  }
  if (present.has('dayComments') && data.dayComments.length) {
    assertOk(
      await supabase.from('day_comments').insert(data.dayComments.map(dayCommentToRow)),
      'reemplazar: comentarios del día',
    )
  }
  if (present.has('savingsContributions') && data.savingsContributions.length) {
    assertOk(
      await supabase
        .from('savings_contributions')
        .insert(data.savingsContributions.map(savingsContributionToRow)),
      'reemplazar: aportes',
    )
  }
  if (present.has('expenses') && data.expenses.length) {
    assertOk(await supabase.from('expenses').insert(data.expenses.map(expenseToRow)), 'reemplazar: gastos')
  }
}

/** Valida y reemplaza en un paso. */
export async function importAll(value: unknown): Promise<void> {
  await applyBackup(parseBackup(value))
}
