import { Button, Tag, Tooltip } from 'antd'
import { DisplayImageCard } from '../../assets/components/DisplayImageCard'
import { resolveAssetUrl } from '../../assets/utils'
import type {
  EntityNameExistenceItem,
  ShotAssetOverviewItem,
  ShotExtractionSummaryRead,
} from '../../../../services/generated'
import { useBilingualText } from '../../../../i18n/useBilingualText'

type AssetKind = 'scene' | 'actor' | 'prop' | 'costume'
type AssetVM = {
  name: string
  thumbnail?: string | null
  id?: string | null
  file_id?: string | null
  description?: string | null
  kind: AssetKind
  status: 'linked' | 'new'
  candidateId?: number
  candidateStatus?: ShotAssetOverviewItem['candidate_status']
}

type ChapterShotAssetConfirmationProps = {
  projectId: string
  extraction: ShotExtractionSummaryRead
  unionAssets: Record<AssetKind, AssetVM[]>
  expandedKinds: Record<AssetKind, boolean>
  candidateActionIds: Record<number, boolean>
  existenceByKindName: Record<AssetKind, Record<string, EntityNameExistenceItem>>
  onToggleExpanded: (kind: AssetKind) => void
  onIgnoreCandidate: (asset: AssetVM) => void
  onHandleNewAsset: (asset: AssetVM) => void
}

function assetDetailUrl(kind: AssetKind, id: string, projectId: string) {
  if (kind === 'scene') return `/assets/scenes/${encodeURIComponent(id)}/edit`
  if (kind === 'prop') return `/assets/props/${encodeURIComponent(id)}/edit`
  if (kind === 'costume') return `/assets/costumes/${encodeURIComponent(id)}/edit`
  return `/projects/${encodeURIComponent(projectId)}/roles/${encodeURIComponent(id)}/edit`
}

export function ChapterShotAssetConfirmation({
  projectId,
  extraction,
  unionAssets,
  expandedKinds,
  candidateActionIds,
  existenceByKindName,
  onToggleExpanded,
  onIgnoreCandidate,
  onHandleNewAsset,
}: ChapterShotAssetConfirmationProps) {
  const l = useBilingualText()
  const pendingCount = Object.values(unionAssets).reduce(
    (sum, items) => sum + items.filter((item) => item.status === 'new').length,
    0,
  )
  const assetStatus = (() => {
    if (extraction.state === 'skipped') {
      return { text: l('已跳过', 'Skipped'), color: 'blue' as const }
    }
    if (extraction.state === 'not_extracted') {
      return { text: l('未提取', 'Not extracted'), color: 'gold' as const }
    }
    if ((extraction.asset_candidate_total ?? 0) === 0 && extraction.state === 'extracted_empty') {
      return { text: l('已提取无候选', 'Extracted; no candidates'), color: 'default' as const }
    }
    if (pendingCount > 0) {
      return { text: l(`待处理 ${pendingCount}`, `${pendingCount} pending`), color: 'gold' as const }
    }
    return { text: l('已完成', 'Completed'), color: 'green' as const }
  })()

  const emptyStateText =
    extraction.state === 'skipped'
      ? l('当前镜头已标记为无需提取，资产候选已按完成处理', 'This shot requires no extraction; asset candidates are treated as complete')
      : extraction.state === 'not_extracted'
        ? l('当前还没有执行提取，先在上方点击“提取并刷新候选”', 'Extraction has not run yet. Click Extract and refresh candidates above.')
        : extraction.state === 'extracted_empty'
          ? l('已执行提取，但当前没有识别到资产候选', 'Extraction completed but found no asset candidates')
          : l('当前没有待确认的资产候选', 'There are no asset candidates awaiting confirmation')

  const renderAssetCard = (asset: AssetVM) => {
    const existence = existenceByKindName[asset.kind][asset.name]
    const actionLabel = existence ? (existence.exists ? l('关联', 'Link') : l('新建', 'Create')) : '…'
    const candidateBusy = asset.candidateId ? !!candidateActionIds[asset.candidateId] : false
    const footer =
      asset.status === 'new' ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] text-gray-500 truncate">
            {existence
              ? existence.linked_to_project
                ? l('项目内可关联', 'Available in project')
                : existence.exists
                  ? l('资产库已有', 'Available in asset library')
                  : l('需新建', 'Create needed')
              : l('正在检查…', 'Checking…')}
          </div>
          <div className="flex items-center gap-1">
            {asset.candidateId ? (
              <Button
                size="small"
                type="text"
                danger
                loading={candidateBusy}
                onClick={() => onIgnoreCandidate(asset)}
              >
                {l('忽略', 'Ignore')}
              </Button>
            ) : null}
            <Button size="small" disabled={!existence || candidateBusy} onClick={() => onHandleNewAsset(asset)}>
              {actionLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-gray-500">{l('当前镜头已关联', 'Linked to current shot')}</div>
      )
    return (
      <div key={`${asset.kind}:${asset.name}`} className="col-span-12 md:col-span-6 xl:col-span-3 2xl:col-span-2">
        <DisplayImageCard
          title={
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                {asset.id ? (
                  <Button
                    type="link"
                    size="small"
                    className="!p-0 !h-auto"
                    onClick={() =>
                      window.open(assetDetailUrl(asset.kind, asset.id!, projectId), '_blank', 'noopener,noreferrer')
                    }
                  >
                    <span className="truncate inline-block max-w-[140px] align-bottom">{asset.name}</span>
                  </Button>
                ) : (
                  <Tooltip title={l('该资产仅提取结果，尚未落库', 'This asset exists only in extraction results and has not been saved')}>
                    <span className="truncate inline-block max-w-[140px] text-gray-400 cursor-not-allowed align-bottom">{asset.name}</span>
                  </Tooltip>
                )}
              </div>
              {asset.status === 'linked' ? <Tag color="blue">{l('已关联', 'Linked')}</Tag> : <Tag color="magenta">{l('新提取', 'Newly extracted')}</Tag>}
            </div>
          }
          imageUrl={resolveAssetUrl(asset.thumbnail)}
          imageAlt={asset.name}
          enablePreview
          hoverable={false}
          size="small"
          imageHeightClassName="h-24"
          footer={footer}
        />
      </div>
    )
  }

  const renderAssetGrid = (kind: AssetKind, titleLabel: string, items: AssetVM[]) => {
    const linkedItems = items.filter((item) => item.status === 'linked')
    const candidateItems = items.filter((item) => item.status === 'new')
    const expanded = expandedKinds[kind]
    const linkedVisible = expanded ? linkedItems : linkedItems.slice(0, 6)
    const candidateVisible = expanded ? candidateItems : candidateItems.slice(0, 6)
    const hiddenCount = Math.max(0, linkedItems.length + candidateItems.length - linkedVisible.length - candidateVisible.length)
    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-gray-600 font-medium">
            {titleLabel}（{items.length}）
          </div>
          {items.length > 12 ? (
            <Button type="link" size="small" onClick={() => onToggleExpanded(kind)}>
              {expanded ? l('收起', 'Collapse') : l(`更多（+${hiddenCount}）`, `More (+${hiddenCount})`)}
            </Button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-xs text-slate-500">
            {emptyStateText}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-slate-600">{l(`当前已关联（${linkedItems.length}）`, `Currently linked (${linkedItems.length})`)}</div>
                {linkedItems.length > 0 ? <Tag color="blue">{l('当前状态', 'Current status')}</Tag> : null}
              </div>
              {linkedItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
                  {l(`当前镜头还没有关联${titleLabel}`, `No ${titleLabel} linked to this shot`)}
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-2">
                  {linkedVisible.map((asset) => renderAssetCard(asset))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-slate-600">{l(`待确认候选（${candidateItems.length}）`, `Pending candidates (${candidateItems.length})`)}</div>
                {candidateItems.length > 0 ? <Tag color="magenta">{l('待确认', 'Pending')}</Tag> : null}
              </div>
              {candidateItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
                  {l(`当前没有待确认的${titleLabel}候选`, `No pending ${titleLabel} candidates`)}
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-2">
                  {candidateVisible.map((asset) => renderAssetCard(asset))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white/80 px-4 py-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-semibold text-white">
              2.1
            </span>
            <div className="text-sm font-medium text-slate-900">{l('资产候选确认', 'Asset candidate confirmation')}</div>
            <Tag color={assetStatus.color} className="m-0">
              {assetStatus.text}
            </Tag>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{l('这里处理系统提取出的场景、角色、道具和服装候选。', 'Review scene, character, prop, and costume candidates extracted by the system.')}</div>
        </div>
      </div>
      <div className="space-y-4">
        {renderAssetGrid('scene', l('场景', 'scenes'), unionAssets.scene)}
        {renderAssetGrid('actor', l('角色', 'characters'), unionAssets.actor)}
        {renderAssetGrid('prop', l('道具', 'props'), unionAssets.prop)}
        {renderAssetGrid('costume', l('服装', 'costumes'), unionAssets.costume)}
      </div>
    </div>
  )
}
