import type { AuthUser } from '@shared/types'
import { getSupabase } from './supabase'

function toUser(u: { id: string; email?: string } | null | undefined): AuthUser | null {
  if (!u) return null
  return { id: u.id, email: u.email ?? '' }
}

export async function signUp(email: string, password: string): Promise<AuthUser | null> {
  const { data, error } = await getSupabase().auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  // se la conferma email è attiva, data.user esiste ma senza sessione
  return toUser(data.user)
}

export async function signIn(email: string, password: string): Promise<AuthUser | null> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return toUser(data.user)
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) throw new Error(error.message)
}

/** Utente corrente (sessione persistita), o null. */
export async function currentUser(): Promise<AuthUser | null> {
  const { data } = await getSupabase().auth.getUser()
  return toUser(data.user)
}

/** True se c'è una sessione valida (per gating della sync). */
export async function isAuthenticated(): Promise<boolean> {
  const { data } = await getSupabase().auth.getSession()
  return !!data.session
}
