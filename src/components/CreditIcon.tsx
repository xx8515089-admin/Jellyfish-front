import type { CSSProperties } from 'react'

/** A solid faceted gem gives credits a clear silhouette at compact price-label sizes. */
export default function CreditIcon({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`anticon credit-icon ${className}`} role="img" aria-hidden="true" style={{ color: '#8fc9e8', fontSize: 'max(1em, 15px)', flexShrink: 0, ...style }}>
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
      <path d="M6 4.5h12l4 5L12 21 2 9.5l4-5Z" fill="currentColor" fillOpacity="0.7" />
      <path d="m8 9.5 4-5 4 5-4 11.5L8 9.5Z" fill="currentColor" />
      <path d="M6 4.5h6l-4 5H2l4-5Z" fill="currentColor" fillOpacity="0.9" />
    </svg>
  </span>
}
