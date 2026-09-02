import type React from 'react'
import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError, AuthService } from '../services/generated'
import {
  clearAuthSession,
  getAuthToken,
  getAuthUserView,
  getStoredAuthUser,
  hasAuthSession,
  updateStoredAuthUser,
} from '../auth'
import type { AuthUserSnapshot } from '../auth'
import { useAppStore } from '../store/useAppStore'
import { withTimeout } from '../utils/withTimeout'

/** 校验 bearer token，并定期刷新当前用户与额度展示。 */
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const location = useLocation()
  const setUser = useAppStore((state) => state.setUser)
  const setMenus = useAppStore((state) => state.setMenus)
  const [status, setStatus] = useState<'checking' | 'authenticated' | 'anonymous'>(hasAuthSession() ? 'checking' : 'anonymous')

  useEffect(() => {
    if (!hasAuthSession()) return
    let active = true
    let refreshInFlight = false

    const keepCurrentSession = () => {
      const storedUser = getStoredAuthUser()
      if (storedUser) setUser(getAuthUserView(storedUser))
      setStatus('authenticated')
    }

    const rejectCurrentSession = (requestToken: string) => {
      if (getAuthToken() !== requestToken) return
      clearAuthSession()
      setMenus([])
      setStatus('anonymous')
    }

    /** 从后端读取权威用户信息，只有明确的 401 才清除当前登录。 */
    const refreshCurrentUser = async () => {
      if (refreshInFlight) return
      const requestToken = getAuthToken()
      if (!requestToken) {
        if (active) setStatus('anonymous')
        return
      }
      refreshInFlight = true
      try {
        const response = await withTimeout(
          AuthService.meApiV1AuthMeGet(),
          5_000,
          'Auth check timed out',
        )
        if (!active) return
        if (response.code === 401) {
          rejectCurrentSession(requestToken)
          return
        }
        if (!response.data) {
          keepCurrentSession()
          return
        }
        const user = response.data as unknown as AuthUserSnapshot
        updateStoredAuthUser(user)
        setUser(getAuthUserView(user))
        setStatus('authenticated')
      } catch (error) {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          rejectCurrentSession(requestToken)
          return
        }
        keepCurrentSession()
      } finally {
        refreshInFlight = false
      }
    }

    void refreshCurrentUser()
    const timer = window.setInterval(() => { void refreshCurrentUser() }, 30_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [setMenus, setUser])

  if (status === 'checking') {
    return (
      <div className="app-auth-loading" role="status" aria-label="正在校验登录状态">
        <Spin size="large" />
      </div>
    )
  }
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return children
}

export default RequireAuth
