import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { CloseOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons'
import { useBilingualText } from '../../../i18n/useBilingualText'
import './ImageViewer.css'

type ImageViewerProps = {
  open: boolean
  imageUrl?: string
  alt?: string
  onClose: () => void
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.1

type Point = {
  x: number
  y: number
}

const CENTER: Point = { x: 0, y: 0 }

export default function ImageViewer({ open, imageUrl, alt = '', onClose }: ImageViewerProps) {
  const l = useBilingualText()
  const [zoom, setZoom] = useState(1)
  const [showActualSize, setShowActualSize] = useState(false)
  const [offset, setOffset] = useState<Point>(CENTER)
  const [dragging, setDragging] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragStartRef = useRef<{ pointerId: number; clientX: number; clientY: number; offset: Point } | null>(null)

  useEffect(() => {
    if (!open) return
    setZoom(1)
    setShowActualSize(false)
    setOffset(CENTER)
    setDragging(false)
    dragStartRef.current = null
  }, [imageUrl, open])

  if (!open || !imageUrl) return null

  const clampOffset = (nextOffset: Point, nextZoom: number, actualSize = false): Point => {
    const viewport = viewportRef.current
    const image = imageRef.current
    if (!viewport || !image) return nextOffset

    const scale = actualSize ? 1 : nextZoom
    const maxX = Math.max(0, (image.clientWidth * scale - viewport.clientWidth) / 2)
    const maxY = Math.max(0, (image.clientHeight * scale - viewport.clientHeight) / 2)

    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y)),
    }
  }

  const applyZoom = (nextZoom: number, clientPoint?: Point) => {
    const normalizedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))))

    if (showActualSize) {
      setShowActualSize(false)
      setZoom(normalizedZoom)
      setOffset(CENTER)
      return
    }

    setOffset((currentOffset) => {
      if (!clientPoint || !viewportRef.current) return clampOffset(currentOffset, normalizedZoom)

      const viewportRect = viewportRef.current.getBoundingClientRect()
      const pointerFromCenter = {
        x: clientPoint.x - (viewportRect.left + viewportRect.width / 2),
        y: clientPoint.y - (viewportRect.top + viewportRect.height / 2),
      }
      const scaleRatio = normalizedZoom / zoom
      const anchoredOffset = {
        x: pointerFromCenter.x - (pointerFromCenter.x - currentOffset.x) * scaleRatio,
        y: pointerFromCenter.y - (pointerFromCenter.y - currentOffset.y) * scaleRatio,
      }
      return clampOffset(anchoredOffset, normalizedZoom)
    })
    setZoom(normalizedZoom)
  }

  const changeZoom = (delta: number) => {
    applyZoom((showActualSize ? 1 : zoom) + delta)
  }

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.deltaY === 0) return
    const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
    applyZoom((showActualSize ? 1 : zoom) + delta, { x: event.clientX, y: event.clientY })
  }

  const canPan = showActualSize || zoom > 1

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canPan || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      offset,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current
    if (!dragStart || dragStart.pointerId !== event.pointerId) return
    event.preventDefault()
    setOffset(clampOffset({
      x: dragStart.offset.x + event.clientX - dragStart.clientX,
      y: dragStart.offset.y + event.clientY - dragStart.clientY,
    }, zoom, showActualSize))
  }

  const finishDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragStartRef.current = null
    setDragging(false)
  }

  const toggleActualSize = () => {
    setShowActualSize((current) => !current)
    setOffset(CENTER)
  }

  return (
    <div className="shared-image-viewer" role="dialog" aria-modal="true" aria-label={l('图片预览', 'Image preview')}>
      <button
        type="button"
        className="shared-image-viewer__close"
        aria-label={l('关闭图片预览', 'Close image preview')}
        onClick={onClose}
      >
        <CloseOutlined />
      </button>

      <div
        ref={viewportRef}
        className={`shared-image-viewer__viewport${canPan ? ' is-pannable' : ''}${dragging ? ' is-dragging' : ''}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDragging}
        onPointerCancel={finishDragging}
      >
        <img
          ref={imageRef}
          className={showActualSize ? 'is-actual-size' : ''}
          src={imageUrl}
          alt={alt}
          draggable={false}
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${showActualSize ? 1 : zoom})` }}
          onDragStart={(event) => event.preventDefault()}
        />
      </div>

      <div className="shared-image-viewer__controls" aria-label={l('图片缩放', 'Image zoom')}>
        <button
          type="button"
          aria-label={l('缩小', 'Zoom out')}
          disabled={!showActualSize && zoom <= MIN_ZOOM}
          onClick={() => changeZoom(-0.25)}
        >
          <MinusOutlined />
        </button>
        <output aria-live="polite">{showActualSize ? '1:1' : `${Math.round(zoom * 100)}%`}</output>
        <button
          type="button"
          aria-label={l('放大', 'Zoom in')}
          disabled={!showActualSize && zoom >= MAX_ZOOM}
          onClick={() => changeZoom(0.25)}
        >
          <PlusOutlined />
        </button>
        <button
          type="button"
          className={showActualSize ? 'is-selected' : ''}
          aria-label={l('按原始尺寸显示', 'Show at actual size')}
          onClick={toggleActualSize}
        >
          1:1
        </button>
      </div>
    </div>
  )
}
