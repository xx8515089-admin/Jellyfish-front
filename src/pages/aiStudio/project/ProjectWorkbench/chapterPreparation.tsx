import type { ReactNode } from 'react'
import {
  EditOutlined,
  FileSearchOutlined,
  ScissorOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import type { Chapter } from './hooks/useProjectData'
import { bilingualText } from '../../../../i18n/useBilingualText'

export type ChapterPreparationState = {
  key: 'edit_raw' | 'extract_shots' | 'prepare_shots' | 'shoot'
  text: string
  color: string
  hint: string
  primaryAction: string
  primaryIcon: ReactNode
}

export function getChapterPreparationState(chapter: Chapter): ChapterPreparationState {
  const hasRawText = !!chapter.rawText?.trim()
  const hasShots = (chapter.storyboardCount ?? 0) > 0
  if (!hasRawText) {
    return {
      key: 'edit_raw',
      text: bilingualText('待录入原文', 'Source text needed'),
      color: 'default',
      hint: bilingualText('先补章节原文，再进入分镜流程', 'Add the chapter source text before entering the storyboard workflow'),
      primaryAction: bilingualText('编辑原文', 'Edit source text'),
      primaryIcon: <EditOutlined />,
    }
  }
  if (!hasShots) {
    return {
      key: 'extract_shots',
      text: bilingualText('待提取分镜', 'Storyboard extraction needed'),
      color: 'gold',
      hint: bilingualText('已有章节原文，下一步建议先提取分镜', 'The source text is ready; extract storyboards next'),
      primaryAction: bilingualText('提取分镜', 'Extract storyboards'),
      primaryIcon: <ScissorOutlined />,
    }
  }
  if (chapter.status === 'shooting' || chapter.status === 'done') {
    return {
      key: 'shoot',
      text: bilingualText('可进入拍摄', 'Ready to shoot'),
      color: 'green',
      hint: bilingualText('当前章节已具备分镜，可继续进入拍摄', 'This chapter has storyboards and can proceed to shooting'),
      primaryAction: bilingualText('进入拍摄', 'Start shooting'),
      primaryIcon: <VideoCameraOutlined />,
    }
  }
  return {
    key: 'prepare_shots',
    text: bilingualText('待准备镜头', 'Shot preparation needed'),
    color: 'blue',
    hint: bilingualText('已有分镜，建议先进入分镜工作室补齐镜头准备', 'Open the storyboard studio to complete shot preparation'),
    primaryAction: bilingualText('进入分镜工作室', 'Open storyboard studio'),
    primaryIcon: <FileSearchOutlined />,
  }
}
