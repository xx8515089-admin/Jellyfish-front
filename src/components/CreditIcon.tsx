import type { CSSProperties } from 'react'

/** Stacked coins remain distinct from add controls at small balance and price sizes. */
export default function CreditIcon({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`anticon credit-icon ${className}`} role="img" aria-hidden="true" style={{ color: 'var(--jf-text, #e6e8ed)', fontSize: 'max(1em, 15px)', flexShrink: 0, ...style }}>
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
      <path d="M3.5 7v10c0 2.2 3.8 4 8.5 4s8.5-1.8 8.5-4V7" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="12" cy="7" rx="8.5" ry="4" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 12c0 2.2 3.8 4 8.5 4s8.5-1.8 8.5-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </span>
}
