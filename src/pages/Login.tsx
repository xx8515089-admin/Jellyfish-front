import type React from 'react'
import { useState } from 'react'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, AuthService } from '../services/generated'
import {
  createAuthSession,
  getAuthUserView,
  getFirstMenuPath,
  getLoginAccessToken,
  getLoginMenus,
  getStoredAuthMenus,
  hasAuthSession,
} from '../auth'
import type { AuthUserSnapshot } from '../auth'
import { useAppStore } from '../store/useAppStore'
import PrismaticBurst from '../components/PrismaticBurst'
import { withTimeout } from '../utils/withTimeout'
import './Login.css'

interface LoginValues { username: string; password: string }

/** 调用后端登录接口，并只保存后端签发的 bearer session。 */
const Login: React.FC = () => {
  const { t } = useTranslation('login')
  const navigate = useNavigate()
  const location = useLocation()
  const setUser = useAppStore((state) => state.setUser)
  const setMenus = useAppStore((state) => state.setMenus)
  const [form] = Form.useForm<LoginValues>()
  const [messageApi, contextHolder] = message.useMessage()
  const [submitting, setSubmitting] = useState(false)
  if (hasAuthSession()) return <Navigate to={getFirstMenuPath(getStoredAuthMenus()) ?? '/projects'} replace />

  const handleFormKeyDown: React.KeyboardEventHandler<HTMLFormElement> = (event) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    form.submit()
  }

  /** 发送账号密码到 Java 后端，并兼容新的 camelCase 登录响应。 */
  const handleSubmit = async (values: LoginValues) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const response = await withTimeout(
        AuthService.loginApiV1AuthLoginPost({ requestBody: values }),
        10_000,
        '登录接口响应超时，请检查后端服务是否启动',
      )
      if (response.code !== undefined && response.code !== 0 && response.code >= 400) {
        throw new Error(response.message || t('failed'))
      }
      const payload = response.data as unknown as { user?: AuthUserSnapshot | null } | null
      const token = getLoginAccessToken(response.data)
      if (!token || !payload?.user) throw new Error(response.message || t('failed'))
      const menus = getLoginMenus(response.data)
      createAuthSession(token, payload.user, menus)
      setUser(getAuthUserView(payload.user))
      setMenus(menus)
      void messageApi.success(t('success'))
      navigate(
        (location.state as { from?: string } | null)?.from ?? getFirstMenuPath(menus) ?? '/projects',
        { replace: true },
      )
    } catch (error) {
      const detail = error instanceof ApiError
        ? error.body?.message
        : error instanceof Error
          ? error.message
          : undefined
      void messageApi.error(detail ?? t('failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      {contextHolder}
      <div className="login-page__background" aria-hidden="true">
        <PrismaticBurst
          animationType="rotate"
          intensity={1}
          speed={1}
          distort={0}
          rayCount={0}
          colors={[]}
          mixBlendMode="lighten"
        />
      </div>

      <div className="login-page__brand" aria-label="Reelmax AI 短剧工作台">
        <img src="/logo.svg" alt="" />
        <div>
          <span className="login-page__brand-name">Reelmax</span>
          <span className="login-page__brand-subtitle">AI 短剧工作台</span>
        </div>
      </div>

      <Card className="login-card">
        <div className="login-card__heading">
          <Typography.Title level={1}>{t('submit')}</Typography.Title>
          <Typography.Text type="secondary">{t('subtitle')}</Typography.Text>
        </div>
        <Form<LoginValues>
          form={form}
          className="login-form"
          layout="vertical"
          onFinish={handleSubmit}
          onKeyDown={handleFormKeyDown}
          requiredMark={false}
        >
          <Form.Item name="username" label={t('username')} rules={[{ required: true, message: t('usernameRequired') }]}>
            <Input prefix={<UserOutlined />} size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label={t('password')} rules={[{ required: true, message: t('passwordRequired') }]}>
            <Input.Password prefix={<LockOutlined />} size="large" autoComplete="current-password" />
          </Form.Item>
          <Button
            className="login-form__submit"
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={submitting}
            disabled={submitting}
          >
            {t('submit')}
          </Button>
        </Form>
        <Typography.Paragraph type="secondary" className="login-card__notice">{t('secureNotice')}</Typography.Paragraph>
      </Card>
    </main>
  )
}
export default Login
