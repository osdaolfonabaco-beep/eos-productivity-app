/**
 * Estado de bloqueo del Journal: si ya existe una clave configurada, y si está
 * desbloqueada (la DEK en memoria). Vive en un contexto de React porque tanto
 * `JournalView` (Vida → Journal) como `SettingsView` (Ajustes → cambiar
 * contraseña) necesitan verlo, y no son descendiente uno del otro.
 *
 * La DEK nunca se guarda en ningún storage: solo existe en este estado, en
 * memoria, mientras el componente que la puso vivo. Dos formas de que
 * desaparezca, ambas por diseño y no por limpieza manual:
 * - `active` pasa a `false` (se sale de Vida → Journal a otra pestaña): el
 *   efecto de abajo la olvida.
 * - Se cierra sesión: `<JournalLockProvider>` solo se monta dentro del árbol
 *   autenticado de `App.tsx`, así que al cerrar sesión se desmonta entero y
 *   React descarta su estado con él.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getJournalKey } from './data/journalKey'
import type { JournalKey } from './data/types'

type KeyRecordStatus = 'loading' | 'error' | 'ready'

interface JournalLockValue {
  keyRecordStatus: KeyRecordStatus
  /** Solo válido cuando `keyRecordStatus === 'ready'`. `null` = aún no se configuró el cifrado. */
  keyRecord: JournalKey | null
  reloadKeyRecord: () => void
  /** Tras crear la clave o cambiar la contraseña: refresca la fila conocida. */
  setKeyRecord: (key: JournalKey) => void
  /** La DEK ya desenvuelta, o `null` si el Journal está bloqueado. */
  dek: Uint8Array | null
  unlock: (dek: Uint8Array) => void
  lock: () => void
}

const JournalLockContext = createContext<JournalLockValue | null>(null)

export function JournalLockProvider({
  active,
  children,
}: {
  /** Si la sección Vida → Journal es la que se está viendo ahora mismo. */
  active: boolean
  children: ReactNode
}) {
  const [keyRecordStatus, setKeyRecordStatus] = useState<KeyRecordStatus>('loading')
  const [keyRecord, setKeyRecordState] = useState<JournalKey | null>(null)
  const [dek, setDek] = useState<Uint8Array | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setKeyRecordStatus('loading')
    getJournalKey()
      .then((key) => {
        if (cancelled) return
        setKeyRecordState(key ?? null)
        setKeyRecordStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setKeyRecordStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  // Salir de Vida → Journal olvida la DEK: hay que volver a desbloquear al volver.
  useEffect(() => {
    if (!active) setDek(null)
  }, [active])

  const value: JournalLockValue = {
    keyRecordStatus,
    keyRecord,
    reloadKeyRecord: () => setReloadTick((t) => t + 1),
    setKeyRecord: setKeyRecordState,
    dek,
    unlock: setDek,
    lock: () => setDek(null),
  }

  return <JournalLockContext.Provider value={value}>{children}</JournalLockContext.Provider>
}

export function useJournalLock(): JournalLockValue {
  const ctx = useContext(JournalLockContext)
  if (!ctx) throw new Error('useJournalLock debe usarse dentro de JournalLockProvider')
  return ctx
}
