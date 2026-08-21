function getRatioShape(value: string) {
  const [rawWidth, rawHeight] = value.split(':').map(Number)
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 16
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 9
  const maxSize = 16

  return width >= height
    ? { width: maxSize, height: Math.max(6, Math.round((maxSize * height) / width)) }
    : { width: Math.max(6, Math.round((maxSize * width) / height)), height: maxSize }
}

export default function StudioRatioOption({ value }: { value: string }) {
  return (
    <span className="studio-select__ratio-option">
      <i aria-hidden="true" style={getRatioShape(value)} />
      <span>{value}</span>
    </span>
  )
}
