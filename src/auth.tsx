import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase.ts'
import { loadProfile } from './data.ts'
import type { Profile } from './types.ts'

type AuthState = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  configured: false,
  loading: false,
  session: null,
  user: null,
  profile: null,
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabaseConfigured)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  const refreshProfile = async () => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    setProfile(await loadProfile(session.user.id))
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let ignore = false
    supabase.auth.getSession().then(({ data }) => {
      if (!ignore) setSession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      ignore = true
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setLoading(false)
      return
    }
    let ignore = false
    setLoading(true)
    loadProfile(session.user.id).then((next) => {
      if (ignore) return
      setProfile(next)
      setLoading(false)
    })
    return () => {
      ignore = true
    }
  }, [session?.user?.id])

  const value = useMemo<AuthState>(
    () => ({
      configured: supabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      refreshProfile,
    }),
    [loading, session, profile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
