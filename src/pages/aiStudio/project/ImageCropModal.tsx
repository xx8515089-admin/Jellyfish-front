import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import './ImageCropModal.css'

export type CropImageSource = {
  dataUrl: string
  fileName: string
  mimeType: string
}

type ImageCropModalProps = {
  open: boolean
  source?: CropImageSource
  onCancel: () => void
  onConfirm: (dataUrl: string, fileName: string) => void
}

type ImageSize = {
  width: number
  height: number
  element: HTMLImageElement
}

type Point = { x: number; y: number }

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const OUTPUT_SIZE = 800

export default function ImageCropModal({ open, source, onCancel, onConfirm }: ImageCropModalProps) {
  const l = useBilingualText()
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point }>()
  const [image, setImage] = useState<ImageSize>()
  const [viewportSize, setViewportSize] = useState(500)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })

  useEffect(() => {
    if (!open || !source) return
    const nextImage = new Image()
    nextImage.onload = () => {
      setImage({ width: nextImage.naturalWidth, height: nextImage.naturalHeight, element: nextImage })
      setZoom(MIN_ZOOM)
      setOffset({ x: 0, y: 0 })
    }
    nextImage.src = source.dataUrl
  }, [open, source])

  useEffect(() => {
    if (!open || !viewportRef.current) return
    const viewport = viewportRef.current
    const updateSize = () => setViewportSize(viewport.clientWidth || 500)
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [open])

  const layout = useMemo(() => {
    if (!image) return undefined
    const scale = Math.max(viewportSize / image.width, viewportSize / image.height) * zoom
    const width = image.width * scale
    const height = image.height * scale
    return {
      scale,
      width,
      height,
      left: (viewportSize - width) / 2 + offset.x,
      top: (viewportSize - height) / 2 + offset.y,
    }
  }, [image, offset.x, offset.y, viewportSize, zoom])

  const clampOffset = (next: Point, nextZoom = zoom) => {
    if (!image) return { x: 0, y: 0 }
    const scale = Math.max(viewportSize / image.width, viewportSize / image.height) * nextZoom
    const maxX = Math.max(0, (image.width * scale - viewportSize) / 2)
    const maxY = Math.max(0, (image.height * scale - viewportSize) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!image) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: offset,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset(clampOffset({
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    }))
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!image) return
    event.preventDefault()
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom - event.deltaY * 0.0015))
    setOffset((current) => clampOffset(current, nextZoom))
    setZoom(nextZoom)
  }

  const handleConfirm = () => {
    if (!image || !layout || !source) return
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const context = canvas.getContext('2d')
    if (!context) return

    const sourceSize = viewportSize / layout.scale
    const sourceX = Math.max(0, -layout.left / layout.scale)
    const sourceY = Math.max(0, -layout.top / layout.scale)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      image.element,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    )
    const outputType = source.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
    onConfirm(canvas.toDataURL(outputType, 0.9), source.fileName)
  }

  return (
    <Modal
      open={open}
      centered
      width={560}
      footer={null}
      closable={false}
      destroyOnClose
      maskClosable={false}
      zIndex={1100}
      className="image-crop-modal"
      onCancel={onCancel}
    >
      <div className="image-crop-modal__header">
        <h2>{l('裁剪图片', 'Crop image')}</h2>
        <button type="button" className="image-crop-modal__close" aria-label={l('关闭', 'Close')} onClick={onCancel}>
          <CloseOutlined />
        </button>
      </div>

      <div className="image-crop-modal__body">
        <div
          ref={viewportRef}
          className="image-crop-modal__viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
          onDoubleClick={() => {
            setZoom(MIN_ZOOM)
            setOffset({ x: 0, y: 0 })
          }}
        >
          {source && layout && (
            <img
              src={source.dataUrl}
              alt=""
              draggable={false}
              style={{
                width: layout.width,
                height: layout.height,
                left: layout.left,
                top: layout.top,
              }}
            />
          )}
          <div className="image-crop-modal__grid" aria-hidden="true">
            <i className="is-v1" />
            <i className="is-v2" />
            <i className="is-h1" />
            <i className="is-h2" />
          </div>
        </div>

        <div className="image-crop-modal__footer">
          <Button onClick={onCancel}>{l('取消', 'Cancel')}</Button>
          <Button type="primary" disabled={!image} onClick={handleConfirm}>{l('确认裁剪', 'Confirm crop')}</Button>
        </div>
      </div>
    </Modal>
  )
}
