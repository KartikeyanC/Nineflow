import React from 'react'

// NineFlow brand: the "N" mark (public/brand/nineflow-tile.png) and the
// wordmark set in the app's own type, so it stays crisp and readable in dark
// mode. "Flow" carries the logo's gradient (orange, or the colour theme's).
export const BRAND = { name: 'NineFlow', tagline: 'Plan better. Flow forward.' }

// The mark is a white "N" on a coloured tile (hue-rotated to match the colour theme), so it reads on light and dark
// surfaces alike.
export function BrandMark({ size = 32, className = '' }) {
  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }}>
      <img src="/brand/nineflow-tile.png" alt="" className="h-full w-full object-contain" style={{ filter: 'var(--brand-filter)' }} draggable="false" />
    </span>
  )
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      Nine<span className="bg-gradient-to-r from-[rgb(var(--brand-a))] to-[rgb(var(--brand-b))] bg-clip-text text-transparent">Flow</span>
    </span>
  )
}
