import { createClient, type PostgrestError } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Ponlas en .env.local ' +
      '(ver .env.example) y reinicia el servidor de desarrollo.',
  )
}

/**
 * El único cliente de Supabase de la app.
 *
 * Ahora mismo solo lo usa la autenticación. Guarda la sesión en `localStorage`
 * y renueva el token por su cuenta; también detecta el token del enlace mágico
 * al cargar la página. Todo eso viene activado por defecto.
 */
export const supabase = createClient(url, anonKey)

/**
 * Envía un enlace mágico al correo. Al abrirlo, el enlace vuelve a la app en
 * este mismo origen y la sesión queda iniciada.
 */
export function signInWithEmail(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
}

/** Cierra la sesión actual. */
export function signOut() {
  return supabase.auth.signOut()
}

/**
 * Para lecturas (y escrituras con `.select()`): devuelve las filas o lanza un
 * `Error` con contexto si Supabase reportó error.
 */
export function unwrap<T>(
  res: { data: T | null; error: PostgrestError | null },
  context: string,
): T {
  if (res.error) throw new Error(`${context}: ${res.error.message}`)
  if (res.data === null) throw new Error(`${context}: respuesta vacía`)
  return res.data
}

/** Para escrituras sin `.select()`: lanza si hubo error, si no no devuelve nada. */
export function assertOk(res: { error: PostgrestError | null }, context: string): void {
  if (res.error) throw new Error(`${context}: ${res.error.message}`)
}
