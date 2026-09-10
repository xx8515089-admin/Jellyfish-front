import type React from 'react';
import { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, theme, Dropdown, Space, Avatar, Select, Breadcrumb, Tag, Tooltip, Button } from 'antd'
import type { MenuProps } from 'antd'
import { PanelLeftClose, PanelLeftOpen, UserRound } from 'lucide-react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { useTranslation } from 'react-i18next'
import { clearAuthSession, getFirstMenuPath } from '../auth'
import type { AuthMenuSnapshot } from '../auth'
import { MenuIconPreview } from '../components'
import { AuthService, StudioProjectsService } from '../services/generated'

const { Header, Sider, Content } = Layout

const HEADER_HEIGHT = 64
const CONTENT_PADDING = 5

type CurrentMenuMatch = {
  key: string
  ancestorKeys: string[]
}

type SidebarProject = {
  id: string
  name: string
  description: string
}

const getMenuKey = (menu: AuthMenuSnapshot) => `auth-menu-${menu.id}`

/** 只把后端允许展示的目录和菜单转换成 Ant Design 导航项。 */
function buildNavigationItems(menus: AuthMenuSnapshot[]): MenuProps['items'] {
  return getVisibleMenus(menus).map((menu) => {
    const children = buildNavigationItems(menu.children ?? [])
    const hasChildren = Boolean(children?.length)
    return {
      key: getMenuKey(menu),
      icon: menu.icon ? <MenuIconPreview value={menu.icon} /> : undefined,
      label: menu.path ? <Link to={menu.path}>{menu.name}</Link> : menu.name,
      children: hasChildren ? children : undefined,
      disabled: !menu.path && !hasChildren,
    }
  })
}

/** 根据完整路径（包括查询参数）定位当前菜单，子页面则选中最长的父路由。 */
function findCurrentMenu(
  menus: AuthMenuSnapshot[],
  pathname: string,
  search: string,
): CurrentMenuMatch | null {
  const candidates: Array<CurrentMenuMatch & { score: number }> = []

  const visit = (items: AuthMenuSnapshot[], ancestorKeys: string[]) => {
    getVisibleMenus(items).forEach((menu) => {
      const key = getMenuKey(menu)
      const route = parseMenuPath(menu.path)
      if (route && isPathPrefix(route.pathname, pathname)) {
        const exactPath = route.pathname === pathname
        const queryMatches = requiredQueryMatches(route.search, search)
        const score = route.pathname.length
          + (exactPath ? 10_000 : 0)
          + (route.search && queryMatches ? 100_000 : 0)
        candidates.push({ key, ancestorKeys, score })
      }
      visit(menu.children ?? [], [...ancestorKeys, key])
    })
  }

  visit(menus, [])
  candidates.sort((first, second) => second.score - first.score)
  const match = candidates[0]
  return match ? { key: match.key, ancestorKeys: match.ancestorKeys } : null
}

function getVisibleMenus(menus: AuthMenuSnapshot[]): AuthMenuSnapshot[] {
  return menus
    .filter((menu) => menu.active && menu.menuType !== 'button')
    .sort((first, second) => first.sortOrder - second.sortOrder || first.id - second.id)
}

function parseMenuPath(path?: string | null): { pathname: string; search: string } | null {
  if (!path?.startsWith('/')) return null
  const queryIndex = path.indexOf('?')
  if (queryIndex < 0) return { pathname: normalizePathname(path), search: '' }
  return {
    pathname: normalizePathname(path.slice(0, queryIndex)),
    search: path.slice(queryIndex + 1),
  }
}

function normalizePathname(pathname: string): string {
  if (pathname === '/') return pathname
  return pathname.replace(/\/+$/, '')
}

function isPathPrefix(menuPathname: string, currentPathname: string): boolean {
  const current = normalizePathname(currentPathname)
  return current === menuPathname || current.startsWith(`${menuPathname}/`)
}

function requiredQueryMatches(requiredSearch: string, currentSearch: string): boolean {
  if (!requiredSearch) return true
  const required = new URLSearchParams(requiredSearch)
  const current = new URLSearchParams(currentSearch)
  for (const [key, value] of required) {
    if (!current.getAll(key).includes(value)) return false
  }
  return true
}

function getProjectIdFromPathname(pathname: string): string | null {
  const segments = normalizePathname(pathname).replace(/^\/+/, '').split('/').filter(Boolean)
  if (segments[0] !== 'projects' || !segments[1] || segments[1] === 'create') return null
  try {
    return decodeURIComponent(segments[1])
  } catch {
    return segments[1]
  }
}

const MainLayout: React.FC = () => {
  const { t, i18n } = useTranslation('layout')
  const location = useLocation()
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const collapsed = useAppStore((state) => state.siderCollapsed)
  const toggleCollapsed = useAppStore((state) => state.toggleSider)
  const user = useAppStore((state) => state.user)
  const language = useAppStore((state) => state.language)
  const setLanguage = useAppStore((state) => state.setLanguage)
  const authMenus = useAppStore((state) => state.menus)
  const setAuthMenus = useAppStore((state) => state.setMenus)
  const sidebarToggleLabel = collapsed
    ? t('actions.expandSidebar', { defaultValue: language === 'en-US' ? 'Expand sidebar' : '展开侧边栏' })
    : t('actions.collapseSidebar', { defaultValue: language === 'en-US' ? 'Collapse sidebar' : '收起侧边栏' })
  const currentProjectId = useMemo(() => getProjectIdFromPathname(location.pathname), [location.pathname])
  const [sidebarProject, setSidebarProject] = useState<SidebarProject | null>(null)

  useEffect(() => {
    let ignore = false
    if (!currentProjectId) {
      setSidebarProject(null)
      return () => {
        ignore = true
      }
    }

    void StudioProjectsService.getProjectApiV1StudioProjectsProjectIdGet({ projectId: currentProjectId })
      .then((response) => {
        if (ignore) return
        const project = response.data
        setSidebarProject(project
          ? {
            id: project.id,
            name: project.name,
            description: project.description ?? '',
          }
          : null)
      })
      .catch(() => {
        if (!ignore) setSidebarProject(null)
      })

    return () => {
      ignore = true
    }
  }, [currentProjectId])

  const menuItems = useMemo(() => buildNavigationItems(authMenus), [authMenus])
  const homePath = useMemo(() => getFirstMenuPath(authMenus) ?? '/projects', [authMenus])
  const appTitle = t('title', { defaultValue: 'Reelmax' })
  const appSubtitle = t('subtitle', { defaultValue: language === 'en-US' ? 'AI Short-form Studio' : 'AI 短剧工作台' })
  const brandTitle = sidebarProject?.name?.trim() || appTitle
  const brandSubtitle = currentProjectId
    ? sidebarProject?.description?.trim() || t('breadcrumb.projectWorkspace', { defaultValue: language === 'en-US' ? 'Project Workspace' : '项目工作台' })
    : appSubtitle
  const currentMenu = useMemo(
    () => findCurrentMenu(authMenus, location.pathname, location.search),
    [authMenus, location.pathname, location.search],
  )
  const selectedKeys = currentMenu ? [currentMenu.key] : []
  const defaultOpenKeys = currentMenu?.ancestorKeys ?? []

  const breadcrumbItems = useMemo(() => {
    const path = location.pathname.replace(/^\/+/, '').split('/').filter(Boolean)
    if (path.length === 0) return [{ title: t('title') }]
    const items: { title: React.ReactNode; key: string }[] = []
    const pathLabels: Record<string, string> = {
      projects: t('menu.projects'),
      canvases: t('menu.canvas'),
      'director-desk': language === 'en-US' ? '3D Director Desk' : '3D 导演台',
      assets: t('menu.assets'),
      prompts: t('menu.prompts'),
      files: t('menu.files'),
      agents: t('menu.agents'),
      models: t('menu.models'),
      system: language === 'en-US' ? 'System Management' : '系统管理',
      users: language === 'en-US' ? 'User Management' : '用户管理',
      roles: language === 'en-US' ? 'Role Management' : '角色管理',
      menus: language === 'en-US' ? 'Menu Management' : '菜单管理',
      voices: language === 'en-US' ? 'Voice Management' : '音色管理',
      admin: language === 'en-US' ? 'Administration' : '管理',
      chapters: t('breadcrumb.chapters'),
      studio: t('breadcrumb.studio'),
      shots: t('breadcrumb.shots'),
      editor: t('breadcrumb.editor'),
      edit: t('breadcrumb.edit'),
    }
    path.forEach((segment, i) => {
      // 特殊处理：不展示章节详情路由中的 chapterId 段，避免出现多余的章节层级。
      if (path[0] === 'projects' && path[2] === 'chapters' && i === 3) {
        return
      }

      // 默认按原始路径逐段拼接。
      let href = path.slice(0, i + 1).join('/')
      href = `/${href}`

      // 特殊处理：章节相关的中间路径在路由中不存在，需要映射到有效地址。
      // /projects/:projectId/chapters/:chapterId/*
      if (path[0] === 'projects' && path[2] === 'chapters') {
        const projectId = path[1]
        const chapterId = path[3]
        if (segment === 'chapters' && i === 2) {
          // “章节管理”实际位于项目工作台页面。
          href = `/projects/${projectId}?tab=chapters`
        } else if (i === 3) {
          href = `/projects/${projectId}/chapters/${chapterId}/shots`
        }
      }

      const isLast = i === path.length - 1
      const label = pathLabels[segment] ?? (path[0] === 'projects' && i === 1 ? t('breadcrumb.projectWorkspace') : segment)
      items.push({
        key: href,
        title: isLast ? label : <Link to={href}>{label}</Link>,
      })
    })
    return items
  }, [language, location.pathname, t])

  const userMenuItems = [
    {
      key: 'logout',
      label: t('user.logout'),
      onClick: () => {
        void AuthService.logoutApiV1AuthLogoutPost().catch(() => undefined)
        clearAuthSession()
        setAuthMenus([])
        navigate('/login', { replace: true })
      },
    },
  ]

  return (
    <Layout
      style={{
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'row',
      }}
    >
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        style={{
          flexShrink: 0,
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'auto',
        }}
      >
        <div
          className={`flex items-center h-16 border-b ${collapsed ? 'justify-center px-2' : 'px-4'}`}
          style={{ borderColor: token.colorBorderSecondary }}
        >
          <Link to={homePath} className="flex items-center gap-2 min-w-0">
            <img src="/logo.svg" alt="Reelmax" className={`${collapsed ? 'w-7 h-7' : 'w-8 h-8'} shrink-0`} />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-base font-semibold text-gray-900 truncate">
                  {brandTitle}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {brandSubtitle}
                </div>
              </div>
            )}
          </Link>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          style={{ borderRight: 'none', paddingTop: 8 }}
        />
      </Sider>

      <Layout
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <Header
          className="flex items-center justify-between"
          style={{
            flexShrink: 0,
            height: HEADER_HEIGHT,
            lineHeight: 'normal',
            padding: '0 16px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Space size={8} align="center" className="flex-1 min-w-0">
            <Button
              type="text"
              aria-label={sidebarToggleLabel}
              icon={collapsed
                ? <PanelLeftOpen size={18} strokeWidth={1.75} />
                : <PanelLeftClose size={18} strokeWidth={1.75} />}
              onClick={toggleCollapsed}
              style={{
                width: 32,
                height: 32,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 18,
              }}
            />
            <Breadcrumb
              items={breadcrumbItems}
              className="hidden sm:block"
              style={{ lineHeight: '32px' }}
            />
          </Space>

          <Space size="middle">
            <Tooltip
              title={
                user.isAdmin
                  ? (language === 'en-US' ? 'Administrators have unlimited API quota' : '管理员 API 额度不限')
                  : (language === 'en-US'
                    ? 'Used ' + user.apiUsed + ' of ' + user.apiQuota
                    : '已使用 ' + user.apiUsed + ' / ' + user.apiQuota)
              }
            >
              <Tag color={user.isAdmin ? 'blue' : user.apiRemaining > 0 ? 'green' : 'red'} className="m-0">
                {user.isAdmin
                  ? (language === 'en-US' ? 'API Unlimited' : 'API 不限')
                  : (language === 'en-US' ? 'API remaining: ' : 'API 剩余：') + user.apiRemaining}
              </Tag>
            </Tooltip>
            <Select
              size="small"
              value={language}
              style={{ width: 120 }}
              onChange={(value) => {
                setLanguage(value)
                void i18n.changeLanguage(value)
                window.localStorage.setItem('jellyfish_language', value)
                document.documentElement.lang = value === 'en-US' ? 'en' : 'zh-CN'
              }}
              options={[
                { label: t('lang.zh'), value: 'zh-CN' },
                { label: t('lang.en'), value: 'en-US' },
              ]}
            />

            <Dropdown
              menu={{
                items: userMenuItems,
              }}
              placement="bottomRight"
            >
              <div className="flex items-center gap-2 cursor-pointer">
                <Avatar size={32} icon={<UserRound size={16} strokeWidth={1.75} />} />
                <div className="hidden md:flex flex-col leading-tight">
                  <span className="text-sm font-medium text-gray-800">{user.name}</span>
                  <span className="text-xs text-gray-500">{user.role}</span>
                </div>
              </div>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: 0,
            padding: CONTENT_PADDING,
            background: token.colorBgLayout,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="w-full h-full min-h-0 overflow-hidden flex flex-col">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
