import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './data/supabase'

/**
 * La sesión de Supabase, o `null` si no hay.
 *
 * `loading` es `true` solo hasta la primera resolución: puede ser una sesión ya
 * guardada, o la vuelta del enlace mágico que se procesa al cargar.
 */
export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return { session, loading }
}
