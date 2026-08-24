import { bilingualText } from './i18n/useBilingualText'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import App from './App.tsx'
import 'antd/dist/reset.css'
import './index.css'
import './i18n'
import './services/openapi'
import { useAppStore } from './store/useAppStore'

type AppRoot = ReturnType<typeof ReactDOM.createRoot>
type WindowWithAppRoot = Window & {
  __jellyfishReactRoot?: AppRoot
}

const RootApp: React.FC = () => {
  const language = useAppStore((state) => state.language)
  const antdLocale = language === 'en-US' ? enUS : zhCN

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: '#d7d9df',
          colorPrimaryHover: '#f0f1f5',
          colorPrimaryActive: '#aeb2bb',
          colorPrimaryBg: 'rgba(255, 255, 255, 0.08)',
          colorPrimaryBgHover: 'rgba(255, 255, 255, 0.12)',
          colorInfo: '#d7d9df',
          colorBgBase: '#111111',
          colorBgLayout: '#171717',
          colorBgContainer: '#242424',
          colorBgElevated: '#2e2e2e',
          colorBorder: '#3d3d3d',
          colorBorderSecondary: '#2d2d2d',
          colorText: '#f2f2f2',
          colorTextSecondary: '#c9c9c9',
          colorTextTertiary: '#909090',
          borderRadius: 6,
        },
        components: {
          Button: {
            defaultBg: '#2b2b2b',
            defaultBorderColor: '#424242',
            defaultColor: '#cfcfcf',
            primaryShadow: '0 8px 18px rgba(0, 0, 0, 0.22)',
          },
          Card: {
            colorBgContainer: '#242424',
          },
          Layout: {
            headerBg: '#121212',
            siderBg: '#111111',
            bodyBg: '#171717',
          },
          Menu: {
            itemBg: '#111111',
            itemColor: '#c9c9c9',
            itemHoverBg: 'rgba(255, 255, 255, 0.075)',
            itemHoverColor: '#f2f2f2',
            itemSelectedBg: 'rgba(255, 255, 255, 0.105)',
            itemSelectedColor: '#f2f2f2',
            subMenuItemBg: '#111111',
            darkItemBg: '#111111',
            darkItemHoverBg: 'rgba(255, 255, 255, 0.075)',
            darkItemHoverColor: '#f2f2f2',
            darkItemSelectedBg: 'rgba(255, 255, 255, 0.105)',
            darkItemSelectedColor: '#f2f2f2',
          },
          Table: {
            headerBg: '#242424',
            rowHoverBg: '#2e2e2e',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  )
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <h2>{bilingualText('页面加载出错', 'Page failed to load')}</h2>
          <pre style={{ color: '#c00', overflow: 'auto' }}>
            {this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

function renderApp() {
  const root = document.getElementById('root')
  if (!root) return
  const windowWithRoot = window as WindowWithAppRoot
  windowWithRoot.__jellyfishReactRoot ??= ReactDOM.createRoot(root)
  windowWithRoot.__jellyfishReactRoot.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <RootApp />
      </AppErrorBoundary>
    </React.StrictMode>,
  )
}

// 先立即渲染，避免初始化逻辑阻塞导致白屏。
renderApp()
