import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from './api'
import type { Me, Role } from './types'
import { Spinner } from './components/ui'

interface AuthState {
  me: Me | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setMe(await api.me())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signOut = useCallback(() => {
    setMe(null)
    void api.signOut()
  }, [])

  return <AuthContext.Provider value={{ me, loading, refresh, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** Gate a route by role. Roles come from Box folder permissions on the backend. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { me, loading } = useAuth()
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Checking your Box sign-in…" />
      </div>
    )
  if (!me) return <Navigate to="/signin" replace />
  if (me.role !== role) return <Navigate to={me.role === 'analyst' ? '/' : '/upload'} replace />
  return <>{children}</>
}
