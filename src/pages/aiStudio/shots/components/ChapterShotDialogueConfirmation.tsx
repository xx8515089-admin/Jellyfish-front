import { Button, Input, Spin, Tooltip } from 'antd'
import { DeleteOutlined, FireOutlined, PlusOutlined, SmileOutlined } from '@ant-design/icons'
import type {
  ShotDialogLineRead,
  ShotExtractionSummaryRead,
  ShotExtractedDialogueCandidateRead,
} from '../../../../services/generated'
import { bilingualText, useBilingualText } from '../../../../i18n/useBilingualText'

function dialogTitle(speaker?: string | null, target?: string | null) {
  const s = (speaker ?? '').trim() || bilingualText('未知', 'Unknown')
  const t = (target ?? '').trim() || bilingualText('未知', 'Unknown')
  return `${s} → ${t}`
}

type ChapterShotDialogueConfirmationProps = {
  extraction: ShotExtractionSummaryRead
  savedDialogLines: ShotDialogLineRead[]
  extractedDialogLines: ShotExtractedDialogueCandidateRead[]
  batchDialogAdding: boolean
  dialogLoading: boolean
  dialogDeletingIds: Record<number, boolean>
  dialogAddingKeys: Record<string, boolean>
  onAcceptAll: () => void
  onIgnoreAll: () => void
  onDeleteSavedDialogLine: (lineId: number) => void
  onUpdateSavedDialogText: (lineId: number, text: string) => void
  onAddExtractedDialogLine: (line: ShotExtractedDialogueCandidateRead) => void
  onIgnoreExtractedDialogLine: (line: ShotExtractedDialogueCandidateRead) => void
  onUpdateExtractedDialogText: (candidateId: number, text: string) => void
}

export function ChapterShotDialogueConfirmation({
  extraction,
  savedDialogLines,
  extractedDialogLines,
  batchDialogAdding,
  dialogLoading,
  dialogDeletingIds,
  dialogAddingKeys,
  onAcceptAll,
  onIgnoreAll,
  onDeleteSavedDialogLine,
  onUpdateSavedDialogText,
  onAddExtractedDialogLine,
  onIgnoreExtractedDialogLine,
  onUpdateExtractedDialogText,
}: ChapterShotDialogueConfirmationProps) {
  const l = useBilingualText()
  const pendingCount = extractedDialogLines.length
  const dialogueStatus = (() => {
    if (extraction.state === 'skipped') {
      return { text: l('已跳过', 'Skipped'), tone: 'blue' as const }
    }
    if (extraction.state === 'not_extracted') {
      return { text: l('未提取', 'Not extracted'), tone: 'gold' as const }
    }
    if ((extraction.dialogue_candidate_total ?? 0) === 0 && extraction.state === 'extracted_empty') {
      return { text: l('已提取无候选', 'Extracted; no candidates'), tone: 'default' as const }
    }
    if (pendingCount > 0) {
      return { text: l(`待处理 ${pendingCount}`, `${pendingCount} pending`), tone: 'gold' as const }
    }
    return { text: l('已完成', 'Completed'), tone: 'green' as const }
  })()
  const emptyStateText =
    extraction.state === 'skipped'
      ? l('当前镜头已标记为无需提取，对白候选已按完成处理', 'This shot requires no extraction; dialogue candidates are treated as complete')
      : extraction.state === 'not_extracted'
        ? l('当前还没有执行提取，先在上方点击“提取并刷新候选”', 'Extraction has not run yet. Click Extract and refresh candidates above.')
        : extraction.state === 'extracted_empty'
          ? l('已执行提取，但当前没有识别到对白候选', 'Extraction completed but found no dialogue candidates')
          : l('当前没有待确认对白；如果需要，也可以直接补录最终对白', 'There is no dialogue awaiting confirmation; you can add final dialogue directly if needed')

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white/80 px-4 py-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-semibold text-white">
              2.2
            </span>
            <div className="text-sm font-medium text-slate-900">{l('对白确认', 'Dialogue confirmation')}</div>
            <span
              className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
              style={{
                background:
                  dialogueStatus.tone === 'green'
                    ? '#dcfce7'
                    : dialogueStatus.tone === 'blue'
                      ? '#dbeafe'
                      : dialogueStatus.tone === 'default'
                        ? '#f1f5f9'
                        : '#fef3c7',
                color:
                  dialogueStatus.tone === 'green'
                    ? '#166534'
                    : dialogueStatus.tone === 'blue'
                      ? '#1d4ed8'
                      : dialogueStatus.tone === 'default'
                        ? '#475569'
                        : '#92400e',
              }}
            >
              {dialogueStatus.text}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{l('这里处理系统提取出的对白候选，并确认最终对白内容。', 'Review extracted dialogue candidates and confirm the final dialogue.')}</div>
        </div>
        <div className="flex items-center gap-2">
          {extractedDialogLines.length > 0 ? (
            <>
              <Button size="small" loading={batchDialogAdding} onClick={onAcceptAll}>
                {l('全部接受', 'Accept all')}
              </Button>
              <Button size="small" disabled={batchDialogAdding} onClick={onIgnoreAll}>
                {l('全部忽略', 'Ignore all')}
              </Button>
            </>
          ) : null}
          {dialogLoading ? <Spin size="small" /> : null}
        </div>
      </div>

      <div className="space-y-2">
        {savedDialogLines.length === 0 && extractedDialogLines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-xs text-slate-500">
            {emptyStateText}
          </div>
        ) : null}

        {savedDialogLines.length > 0 ? (
          <div className="space-y-2">
            {savedDialogLines
              .slice()
              .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
              .map((line) => (
                <div key={line.id} className="flex items-start gap-2">
                  <Tooltip title={l('已保存', 'Saved')}>
                    <span className="mt-1 text-gray-500">
                      <SmileOutlined />
                    </span>
                  </Tooltip>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    loading={!!dialogDeletingIds[line.id]}
                    onClick={() => onDeleteSavedDialogLine(line.id)}
                  />
                  <div className="w-36 shrink-0 text-xs text-gray-700 mt-1 truncate">
                    {dialogTitle(line.speaker_name, line.target_name)}
                  </div>
                  <Input.TextArea
                    value={line.text ?? ''}
                    onChange={(e) => onUpdateSavedDialogText(line.id, e.target.value)}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    placeholder={l('对白内容', 'Dialogue text')}
                  />
                </div>
              ))}
          </div>
        ) : null}

        {extractedDialogLines.length > 0 ? (
          <div className="space-y-2">
            {extractedDialogLines.map((line) => (
              <div key={line.id} className="flex items-start gap-2">
                <Tooltip title={l('新提取', 'Newly extracted')}>
                  <span className="mt-1 text-red-600">
                    <FireOutlined />
                  </span>
                </Tooltip>
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  loading={!!dialogAddingKeys[String(line.id)]}
                  onClick={() => onAddExtractedDialogLine(line)}
                />
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={!!dialogAddingKeys[String(line.id)]}
                  onClick={() => onIgnoreExtractedDialogLine(line)}
                />
                <div className="w-36 shrink-0 text-xs text-gray-700 mt-1 truncate">
                  {dialogTitle(line.speaker_name, line.target_name)}
                </div>
                <Input.TextArea
                  value={line.text ?? ''}
                  onChange={(e) => onUpdateExtractedDialogText(line.id, e.target.value)}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder={l('对白内容', 'Dialogue text')}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
