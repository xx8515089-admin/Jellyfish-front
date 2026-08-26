import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import GlobalAiChat from './components/GlobalAiChat'
import './App.css'
import './theme/dark.css'

const MainLayout = lazy(() => import('./layouts/MainLayout'))
const NotFound = lazy(() => import('./pages/NotFound'))
const ProjectLobby = lazy(() => import('./pages/aiStudio/project/ProjectLobby'))
const ProjectCreatePage = lazy(() => import('./pages/aiStudio/project/ProjectCreatePage'))
const ProjectWorkbench = lazy(() => import('./pages/aiStudio/project/ProjectWorkbench'))
const RoleDetailPage = lazy(() => import('./pages/aiStudio/project/ProjectWorkbench/RoleDetailPage'))
const ChapterStudio = lazy(() => import('./pages/aiStudio/chapter/ChapterStudio'))
const AssetManager = lazy(() => import('./pages/aiStudio/assets/AssetManager'))
const ActorAssetEditPage = lazy(() => import('./pages/aiStudio/assets/ActorAssetEditPage'))
const SceneAssetEditPage = lazy(() => import('./pages/aiStudio/assets/SceneAssetEditPage'))
const PropAssetEditPage = lazy(() => import('./pages/aiStudio/assets/PropAssetEditPage'))
const CostumeAssetEditPage = lazy(() => import('./pages/aiStudio/assets/CostumeAssetEditPage'))
const PromptTemplateManager = lazy(() => import('./pages/aiStudio/prompts/PromptTemplateManager'))
const FileManager = lazy(() => import('./pages/aiStudio/files/FileManager'))
const VideoEditor = lazy(() => import('./pages/aiStudio/editor/VideoEditor'))
const AgentManagement = lazy(() => import('./pages/aiStudio/agents/AgentManagement'))
const AgentEdit = lazy(() => import('./pages/aiStudio/agents/AgentEdit'))
const ModelManagement = lazy(() => import('./pages/aiStudio/models/ModelManagement'))
const ChapterShotsPage = lazy(() =>
  import('./pages/aiStudio/shots/ChapterShotsPage').then((module) => ({
    default: module.ChapterShotsPage,
  })),
)
const ChapterShotEditPage = lazy(() =>
  import('./pages/aiStudio/shots/ChapterShotEditPage').then((module) => ({
    default: module.ChapterShotEditPage,
  })),
)
const DirectorDeskStandalonePage = lazy(() => import('./pages/directorDesk/DirectorDeskStandalonePage'))
const Login = lazy(() => import('./pages/Login'))
const AdminUsers = lazy(() => import('./pages/AdminUsers'))
const CanvasLobby = lazy(() => import('./pages/canvas/CanvasLobby'))
const CanvasStudioPage = lazy(() => import('./pages/canvas/CanvasStudioPage'))
const EfficiencyOverview = lazy(() => import('./pages/aiStudio/efficiency/EfficiencyOverview'))
const RoleManagement = lazy(() => import('./pages/system/RoleManagement'))
const MenuManagement = lazy(() => import('./pages/system/MenuManagement'))

const routeFallback = <div className="app-route-loading" aria-label="页面加载中" aria-live="polite" />

const App = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={routeFallback}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/projects/create" element={<RequireAuth><ProjectCreatePage /></RequireAuth>} />
          <Route path="/canvas/:canvasId" element={<RequireAuth><CanvasStudioPage /></RequireAuth>} />
          <Route path="/director-desk/workspace/:deskId" element={<RequireAuth><DirectorDeskStandalonePage /></RequireAuth>} />
          <Route path="/projects/:projectId/chapters/:chapterId/director-stage" element={<RequireAuth><DirectorDeskStandalonePage /></RequireAuth>} />
          <Route path="/efficiency-overview" element={<RequireAuth><EfficiencyOverview /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><MainLayout /></RequireAuth>}>
            <Route index element={<Navigate to="/projects" replace />} />
            <Route path="projects" element={<ProjectLobby />} />
            <Route path="canvases" element={<CanvasLobby />} />
            <Route path="director-desk" element={<DirectorDeskStandalonePage embeddedHome />} />
            <Route path="projects/:projectId" element={<ProjectWorkbench />} />
            <Route path="projects/:projectId/roles/:characterId/edit" element={<RoleDetailPage />} />
            <Route path="projects/:projectId/chapters/:chapterId/prep/*" element={<Navigate to="../shots" replace />} />
            <Route path="projects/:projectId/chapters/:chapterId/studio" element={<ChapterStudio />} />
            <Route path="projects/:projectId/chapters/:chapterId/shots/:shotId/edit" element={<ChapterShotEditPage />} />
            <Route path="projects/:projectId/chapters/:chapterId/shots" element={<ChapterShotsPage />} />
            <Route path="projects/:projectId/chapters/:chapterId/prep-drafts" element={<Navigate to="../shots" replace />} />
            <Route path="projects/:projectId/editor" element={<VideoEditor />} />
            <Route path="assets" element={<AssetManager />} />
            <Route path="assets/actors/:actorImageId/edit" element={<ActorAssetEditPage />} />
            <Route path="assets/scenes/:sceneId/edit" element={<SceneAssetEditPage />} />
            <Route path="assets/props/:propId/edit" element={<PropAssetEditPage />} />
            <Route path="assets/costumes/:costumeId/edit" element={<CostumeAssetEditPage />} />
            <Route path="prompts" element={<PromptTemplateManager />} />
            <Route path="files" element={<FileManager />} />
            <Route path="agents/:id/edit" element={<AgentEdit />} />
            <Route path="agents" element={<AgentManagement />} />
            <Route path="models" element={<ModelManagement />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="system/users" element={<AdminUsers />} />
            <Route path="system/roles" element={<RoleManagement />} />
            <Route path="system/menus" element={<MenuManagement />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
      <GlobalAiChat />
    </BrowserRouter>
  )
}

export default App


