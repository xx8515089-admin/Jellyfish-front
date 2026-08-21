import type React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import NotFound from './pages/NotFound'
import ProjectLobby from './pages/aiStudio/project/ProjectLobby'
import ProjectCreatePage from './pages/aiStudio/project/ProjectCreatePage'
import ProjectWorkbench from './pages/aiStudio/project/ProjectWorkbench'
import RoleDetailPage from './pages/aiStudio/project/ProjectWorkbench/RoleDetailPage'
import ChapterStudio from './pages/aiStudio/chapter/ChapterStudio'
import AssetManager from './pages/aiStudio/assets/AssetManager'
import ActorAssetEditPage from './pages/aiStudio/assets/ActorAssetEditPage.tsx'
import SceneAssetEditPage from './pages/aiStudio/assets/SceneAssetEditPage.tsx'
import PropAssetEditPage from './pages/aiStudio/assets/PropAssetEditPage.tsx'
import CostumeAssetEditPage from './pages/aiStudio/assets/CostumeAssetEditPage.tsx'
import PromptTemplateManager from './pages/aiStudio/prompts/PromptTemplateManager'
import FileManager from './pages/aiStudio/files/FileManager'
import VideoEditor from './pages/aiStudio/editor/VideoEditor'
import AgentManagement from './pages/aiStudio/agents/AgentManagement'
import AgentEdit from './pages/aiStudio/agents/AgentEdit.tsx'
import ModelManagement from './pages/aiStudio/models/ModelManagement'
import { ChapterShotsPage } from './pages/aiStudio/shots/ChapterShotsPage'
import { ChapterShotEditPage } from './pages/aiStudio/shots/ChapterShotEditPage'
import DirectorStagePage from './pages/aiStudio/director/DirectorStagePage'
import './App.css'
import Login from './pages/Login'
import RequireAuth from './components/RequireAuth'
import AdminUsers from './pages/AdminUsers'
import CanvasLobby from './pages/canvas/CanvasLobby'
import CanvasStudioPage from './pages/canvas/CanvasStudioPage'
import RoleManagement from './pages/system/RoleManagement'
import MenuManagement from './pages/system/MenuManagement'

const App: React.FC = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/projects/create" element={<RequireAuth><ProjectCreatePage /></RequireAuth>} />
        <Route path="/canvas/:canvasId" element={<RequireAuth><CanvasStudioPage /></RequireAuth>} />
        <Route path="/" element={<RequireAuth><MainLayout /></RequireAuth>}>
          <Route index element={<Navigate to="/projects" replace />} />
          <Route path="projects" element={<ProjectLobby />} />
          <Route path="canvases" element={<CanvasLobby />} />
          <Route path="projects/:projectId" element={<ProjectWorkbench />} />
          <Route path="projects/:projectId/roles/:characterId/edit" element={<RoleDetailPage />} />
          <Route path="projects/:projectId/chapters/:chapterId/prep/*" element={<Navigate to="../shots" replace />} />
          <Route path="projects/:projectId/chapters/:chapterId/studio" element={<ChapterStudio />} />
          <Route path="projects/:projectId/chapters/:chapterId/director-stage" element={<DirectorStagePage />} />
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
    </BrowserRouter>
  )
}

export default App


