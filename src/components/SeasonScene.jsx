import React from 'react'

// Flat season scenes for the Month banner (see lib/climate.js). 150 × 220, drawn so the
// bottom part reads on its own too (the narrow banner on smaller screens crops to it).
// Fixed colours: the scene shows the season, not the app's colour theme.

const Snow = () => [18, 44, 70, 96, 122, 30, 84, 110, 58, 136].map((x, i) => (
  <circle key={i} cx={x} cy={18 + (i % 4) * 20} r={i % 2 ? 2 : 1.4} fill="white" opacity="0.85" />
))

function Winter() {
  return (
    <>
      <Snow />
      <path d="M0 150 L40 80 L80 150 Z" fill="white" opacity="0.25" />
      <path d="M50 150 L100 70 L150 150 Z" fill="white" opacity="0.4" />
      <path d="M86 92 L100 70 L114 92 L106 88 L100 94 L94 88 Z" fill="white" />
      <path d="M0 220 L0 170 Q60 130 150 165 L150 220 Z" fill="#F8FAFC" />
      <rect x="58" y="150" width="30" height="24" rx="2" fill="#B91C1C" />
      <path d="M52 152 L73 134 L94 152 Z" fill="#F8FAFC" />
      <rect x="69" y="160" width="8" height="14" rx="1" fill="#FDE68A" />
      <rect x="80" y="138" width="5" height="10" fill="#7F1D1D" />
    </>
  )
}

function Spring() {
  const petals = [[20, 40], [48, 66], [118, 34], [132, 88], [30, 100], [96, 20]]
  return (
    <>
      {petals.map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="3" ry="1.8" fill="#FBCFE8" opacity="0.9" transform={`rotate(${i * 40} ${x} ${y})`} />)}
      <path d="M30 60 q4 -4 8 0 q4 -4 8 0" stroke="white" strokeWidth="1.6" fill="none" opacity="0.8" />
      <path d="M100 48 q3 -3 6 0 q3 -3 6 0" stroke="white" strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M0 220 L0 165 Q50 135 150 160 L150 220 Z" fill="#86EFAC" />
      <path d="M0 220 L0 190 Q80 160 150 185 L150 220 Z" fill="#4ADE80" />
      <rect x="70" y="118" width="7" height="50" rx="2" fill="#7C2D12" />
      {[[73, 100, 26], [52, 112, 18], [94, 110, 19], [62, 92, 14], [86, 92, 14]].map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={i % 2 ? '#F9A8D4' : '#FBCFE8'} />)}
      {[[66, 104], [82, 98], [58, 116], [92, 116]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.4" fill="#EC4899" />)}
    </>
  )
}

function Summer() {
  return (
    <>
      <circle cx="108" cy="58" r="22" fill="#FEF3C7" />
      <circle cx="108" cy="58" r="16" fill="#FDE68A" />
      {[...Array(10)].map((_, i) => { const a = (i / 10) * Math.PI * 2; return <line key={i} x1={108 + Math.cos(a) * 28} y1={58 + Math.sin(a) * 28} x2={108 + Math.cos(a) * 36} y2={58 + Math.sin(a) * 36} stroke="#FEF3C7" strokeWidth="2.4" strokeLinecap="round" opacity="0.9" /> })}
      <path d="M0 160 Q40 130 80 155 T150 150 L150 220 L0 220 Z" fill="#FCD34D" opacity="0.9" />
      <path d="M0 220 L0 185 Q70 160 150 182 L150 220 Z" fill="#F59E0B" />
      <path d="M10 200 q10 -6 20 0 t20 0 t20 0" stroke="#FEF3C7" strokeWidth="2" fill="none" opacity="0.7" />
      <rect x="34" y="128" width="4" height="40" rx="2" fill="#78350F" />
      {[-60, -20, 20, 60, 100].map((r, i) => <ellipse key={i} cx="36" cy="128" rx="18" ry="5" fill="#16A34A" transform={`rotate(${r} 36 128) translate(12 0)`} />)}
    </>
  )
}

function Monsoon() {
  return (
    <>
      {[[40, 34, 30], [96, 26, 34], [128, 46, 22]].map(([cx, cy, rx], i) => (
        <g key={i} opacity="0.55"><ellipse cx={cx} cy={cy} rx={rx} ry="13" fill="white" /><ellipse cx={cx - rx / 3} cy={cy - 8} rx={rx / 2} ry="11" fill="white" /></g>
      ))}
      {[...Array(16)].map((_, i) => { const x = 8 + (i * 9) % 146, y = 58 + ((i * 23) % 70); return <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 14} stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" /> })}
      <path d="M0 220 L0 160 Q45 128 90 150 T150 145 L150 220 Z" fill="#22C55E" />
      <path d="M0 220 L0 186 Q75 160 150 184 L150 220 Z" fill="#15803D" />
      <ellipse cx="96" cy="204" rx="26" ry="5" fill="#BAE6FD" opacity="0.7" />
      <path d="M44 150 q14 -18 28 0 Z" fill="#FACC15" />
      <line x1="58" y1="150" x2="58" y2="170" stroke="#1E293B" strokeWidth="1.8" />
      <path d="M58 170 q0 4 4 4" stroke="#1E293B" strokeWidth="1.8" fill="none" />
    </>
  )
}

function Autumn() {
  const leaves = [[22, 40, '#FB923C'], [50, 70, '#F87171'], [120, 36, '#FBBF24'], [134, 92, '#FB923C'], [36, 104, '#FBBF24'], [100, 18, '#F87171']]
  return (
    <>
      {leaves.map(([x, y, c], i) => <ellipse key={i} cx={x} cy={y} rx="4" ry="2.4" fill={c} transform={`rotate(${i * 55} ${x} ${y})`} />)}
      <path d="M0 220 L0 165 Q60 138 150 162 L150 220 Z" fill="#FCD34D" opacity="0.85" />
      <path d="M0 220 L0 190 Q80 164 150 186 L150 220 Z" fill="#B45309" />
      <rect x="70" y="118" width="7" height="52" rx="2" fill="#451A03" />
      {[[73, 100, 26, '#F97316'], [52, 112, 18, '#EF4444'], [94, 110, 19, '#FBBF24'], [62, 90, 14, '#FB923C'], [86, 92, 14, '#DC2626']].map(([cx, cy, r, c], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={c} />)}
      {[[40, 196], [110, 200], [128, 192]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="4" ry="2" fill="#FB923C" />)}
    </>
  )
}

const SCENES = { winter: Winter, spring: Spring, summer: Summer, monsoon: Monsoon, autumn: Autumn }

export default function SeasonScene({ season, className, preserve = 'xMidYMax meet', viewBox = '0 0 150 220' }) {
  const Scene = SCENES[season] || Winter
  return (
    <svg viewBox={viewBox} className={className} preserveAspectRatio={preserve} aria-hidden="true">
      <Scene />
    </svg>
  )
}
