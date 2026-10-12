// Pastel palette. Each entry maps a colour id to the Tailwind classes that
// read the matching CSS variables, so dark mode needs no extra classes.
export const PALETTE = {
  lav: { label: 'Lavender', bg: 'bg-violet', text: 'text-violet-fg', dot: 'bg-violet-fg', var: '--violet-fg', bgVar: '--violet' },
  sky: { label: 'Sky', bg: 'bg-sky', text: 'text-sky-fg', dot: 'bg-sky-fg', var: '--sky-fg', bgVar: '--sky' },
  butter: { label: 'Butter', bg: 'bg-butter', text: 'text-butter-fg', dot: 'bg-butter-fg', var: '--butter-fg', bgVar: '--butter' },
  coral: { label: 'Coral', bg: 'bg-coral', text: 'text-coral-fg', dot: 'bg-coral-fg', var: '--coral-fg', bgVar: '--coral' },
  mint: { label: 'Mint', bg: 'bg-mint', text: 'text-mint-fg', dot: 'bg-mint-fg', var: '--mint-fg', bgVar: '--mint' },
  peach: { label: 'Peach', bg: 'bg-peach', text: 'text-peach-fg', dot: 'bg-peach-fg', var: '--peach-fg', bgVar: '--peach' },
  rose: { label: 'Rose', bg: 'bg-rose', text: 'text-rose-fg', dot: 'bg-rose-fg', var: '--rose-fg', bgVar: '--rose' },
  teal: { label: 'Teal', bg: 'bg-teal', text: 'text-teal-fg', dot: 'bg-teal-fg', var: '--teal-fg', bgVar: '--teal' },
}

export const COLOR_IDS = Object.keys(PALETTE)

export const colorOf = (id) => PALETTE[id] || PALETTE.lav

// For inline styles (Recharts, heatmap) where a class can't be used.
export const cssVar = (name, alpha = 1) => `rgb(var(${name}) / ${alpha})`

export const PRIORITY_STYLE = {
  high: 'bg-coral text-coral-fg',
  medium: 'bg-peach text-peach-fg',
  low: 'bg-mint text-mint-fg',
}
