import type { StudioAssetLookItem } from '../../../services/studioAssetGeneration'
import type { AssetImageOptionsInput } from './AssetGenerationWorkspace'

export const DEFAULT_ASSET_IMAGE_RATIO_OPTIONS = ['9:16', '4:3', '16:9', '3:4', '1:1', '21:9']

let lastImageOptionsClientRevision = 0

export const createImageOptionsClientRevision = () => {
  lastImageOptionsClientRevision = Math.max(Date.now(), lastImageOptionsClientRevision + 1)
  return lastImageOptionsClientRevision
}

export const selectInitialAssetLook = <T extends { status?: number | null; defaultLook?: boolean }>(
  looks: T[],
): T | undefined => looks.find((look) => look.status === 1)
  ?? looks.find((look) => look.defaultLook)
  ?? looks[0]

/** Keep valid user choices; defaults can only come from the model's API capabilities. */
export const selectImageResolution = (supported: number[], selection?: string): string => {
  const available = supported.filter((value) => Number.isInteger(value) && value > 0)
  const selected = Number(selection?.trim().replace(/k$/i, ''))
  if (available.includes(selected)) return String(selected)
  const preferred = available.includes(2) ? 2 : available[0]
  return preferred === undefined ? '' : String(preferred)
}

type AssetImageOptionsSource = {
  asset: {
    prompt?: string
    aspectRatio?: string
    styleName?: string
    visualStyleId?: number | null
  }
  look?: StudioAssetLookItem
  ratio: string
  ratioOptions: string[]
  styleOptions: Array<{ id?: string | number; name: string }>
  queuedInput?: AssetImageOptionsInput
  noStyleName: string
}

const positiveInteger = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const isNoStyleName = (name: string) => {
  const normalized = name.trim().toLowerCase()
  return normalized === '无风格' || normalized === 'no style'
}

/** Resolve the same saved asset/look options for card and workspace generation. */
export const resolveAssetImageOptions = ({
  asset,
  look,
  ratio,
  ratioOptions,
  styleOptions,
  queuedInput,
  noStyleName,
}: AssetImageOptionsSource): AssetImageOptionsInput => {
  const lookId = positiveInteger(look?.id)
  const availableRatios = ratioOptions.map((value) => value.trim()).filter(Boolean)
  if (queuedInput && queuedInput.lookId === lookId) {
    return {
      ...queuedInput,
      aspectRatio: availableRatios.includes(queuedInput.aspectRatio)
        ? queuedInput.aspectRatio
        : availableRatios[0] ?? '',
    }
  }
  const aspectRatio = [look?.aspectRatio, asset.aspectRatio, ratio]
    .map((value) => value?.trim())
    .find((value): value is string => Boolean(value && availableRatios.includes(value)))
    ?? availableRatios[0]
    ?? ''

  const assetStyleName = asset.styleName?.trim() ?? ''
  const assetStyleId = positiveInteger(asset.visualStyleId)
  let styleName = assetStyleName
  let visualStyleId = assetStyleId
  if (asset.visualStyleId === null || isNoStyleName(assetStyleName)) {
    styleName = noStyleName
    visualStyleId = null
  } else {
    const style = assetStyleId === null
      ? styleOptions.find((option) => option.name.trim() === assetStyleName)
      : styleOptions.find((option) => positiveInteger(option.id) === assetStyleId)
    styleName = style?.name.trim() || assetStyleName
    visualStyleId = assetStyleId ?? positiveInteger(style?.id)
  }

  if (look?.visualStyleId === null) {
    styleName = noStyleName
    visualStyleId = null
  } else {
    const lookStyleId = positiveInteger(look?.visualStyleId)
    if (lookStyleId !== null) {
      const lookStyle = styleOptions.find((option) => positiveInteger(option.id) === lookStyleId)
      styleName = lookStyle?.name.trim() || (lookStyleId === visualStyleId ? styleName : '')
      visualStyleId = lookStyleId
    }
  }

  return {
    prompt: look ? look.prompt ?? '' : asset.prompt ?? '',
    lookId,
    styleName,
    visualStyleId,
    aspectRatio,
  }
}
