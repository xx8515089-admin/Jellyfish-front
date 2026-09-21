import { uiText } from '../../../../i18n/uiText'
import React from 'react'
import {
  HomeOutlined,
  UnorderedListOutlined,
  UserOutlined,
  PictureOutlined,
  ScissorOutlined,
  FileImageOutlined,
  VideoCameraOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type { ChapterStatus } from '../../../../services/generated'

export type TabKey =
  | 'dashboard'
  | 'chapters'
  | 'actors'
  | 'roles'
  | 'scenes'
  | 'props'
  | 'costumes'
  | 'files'
  | 'edit'
  | 'settings'

const TAB_KEYS: TabKey[] = [
  'dashboard',
  'chapters',
  'actors',
  'roles',
  'scenes',
  'props',
  'costumes',
  'files',
  'edit',
  'settings',
]

export function isTabKey(s: string): s is TabKey {
  return TAB_KEYS.includes(s as TabKey)
}

export const DEFAULT_TAB: TabKey = 'dashboard'

export const TAB_CONFIG: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', get label() { return uiText("仪表盘") }, icon: <HomeOutlined /> },
  { key: 'chapters', get label() { return uiText("章节") }, icon: <UnorderedListOutlined /> },
  { key: 'actors', get label() { return uiText("演员") }, icon: <UserOutlined /> },
  { key: 'roles', get label() { return uiText("角色") }, icon: <UserOutlined /> },
  { key: 'scenes', get label() { return uiText("场景") }, icon: <PictureOutlined /> },
  { key: 'props', get label() { return uiText("道具") }, icon: <ScissorOutlined /> },
  { key: 'costumes', get label() { return uiText("服装") }, icon: <ScissorOutlined /> },
  { key: 'files', get label() { return uiText("文件") }, icon: <FileImageOutlined /> },
  { key: 'edit', get label() { return uiText("剪辑") }, icon: <VideoCameraOutlined /> },
  { key: 'settings', get label() { return uiText("设置") }, icon: <SettingOutlined /> },
]

export const chapterStatusMap: Record<ChapterStatus, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  shooting: { color: 'processing', text: '拍摄中' },
  done: { color: 'success', text: '完成' },
}
