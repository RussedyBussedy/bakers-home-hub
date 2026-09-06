import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { HAS_SUPABASE, SUPABASE_ANON_KEY, SUPABASE_URL, type Db } from './db'
import { createDemoDb } from './demoDb'
import { createSupabaseDb } from './supabaseDb'
import type { Household, Profile } from './types'

const MODE_KEY = 'hub-mode'

interface DbContextValue {
  db: Db
  isDemo: boolean
  canUseSupabase: boolean
  enterDemo: () => void
  leaveDemo: () => void
}

const DbContext = createContext<DbContextValue | null>(null)

function pickMode(): 'demo' | 'supabase' {
  if (!HAS_SUPABASE) return 'demo'
  try {
    return localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'supabase'
  } catch {
    return 'supabase'
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: true },
  },
})

export function DbProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'demo' | 'supabase'>(pickMode)
  const db = useMemo<Db>(() => {
    if (mode === 'supabase' && SUPABASE_URL && SUPABASE_ANON_KEY) return createSupabaseDb(SUPABASE_URL, SUPABASE_ANON_KEY)
    return createDemoDb()
  }, [mode])

  const enterDemo = useCallback(() => {
    localStorage.setItem(MODE_KEY, 'demo')
    queryClient.clear()
    setMode('demo')
  }, [])
  const leaveDemo = useCallback(() => {
    localStorage.removeItem(MODE_KEY)
    queryClient.clear()
    setMode(HAS_SUPABASE ? 'supabase' : 'demo')
  }, [])

  const value = useMemo(
    () => ({ db, isDemo: mode === 'demo', canUseSupabase: HAS_SUPABASE, enterDemo, leaveDemo }),
    [db, mode, enterDemo, leaveDemo],
  )

  return (
    <DbContext.Provider value={value}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </DbContext.Provider>
  )
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext)
  if (!ctx) throw new Error('useDb must be used inside DbProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Auth + household
// ---------------------------------------------------------------------------
interface AuthContextValue {
  userId: string | null
  loading: boolean
  household: Household | null
  profiles: Profile[]
  me: Profile | null
  partner: Profile | null
  profileById: (id: string | null | undefined) => Profile | undefined
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signUp: (input: { email: string; password: string; displayName: string; inviteCode?: string | null }) => Promise<{ error?: string; needsConfirmation?: boolean }>
  signOut: () => Promise<void>
  bundleError: string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { db } = useDb()
  const qc = useQueryClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    setReady(false)
    db.getUserId().then((id) => {
      if (!alive) return
      setUserId(id)
      setReady(true)
    })
    const off = db.onAuthChange((id) => {
      setUserId((prev) => {
        if (prev && !id) qc.clear()
        return id
      })
      setReady(true)
    })
    return () => {
      alive = false
      off()
    }
  }, [db, qc])

  const bundle = useQuery({
    queryKey: ['bundle', userId, db.mode],
    queryFn: () => db.getBundle(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  })

  const profiles = useMemo(() => bundle.data?.profiles ?? [], [bundle.data])
  const me = useMemo(() => profiles.find((p) => p.id === userId) ?? null, [profiles, userId])
  const partner = useMemo(() => profiles.find((p) => p.id !== userId) ?? null, [profiles, userId])
  const profileById = useCallback((id: string | null | undefined) => profiles.find((p) => p.id === id), [profiles])

  const value = useMemo<AuthContextValue>(
    () => ({
      userId,
      loading: !ready || (Boolean(userId) && bundle.isPending),
      household: bundle.data?.household ?? null,
      profiles,
      me,
      partner,
      profileById,
      signIn: (email, password) => db.signIn(email, password),
      signUp: (input) => db.signUp(input),
      signOut: () => db.signOut(),
      bundleError: bundle.error ? (bundle.error as Error).message : null,
    }),
    [userId, ready, bundle.isPending, bundle.data, bundle.error, profiles, me, partner, profileById, db],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
