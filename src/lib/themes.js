// Colour themes. The CSS for each lives in index.css under [data-theme='<id>'] (light) and
// .dark[data-theme='<id>'] (dark), so every theme works in both modes. `swatch` is
// [page, accent] for the picker in Settings. 'default' is the original cream and orange.
export const THEMES = [
  { id: 'default', label: 'NineFlow', swatch: ['#FAF7F0', '#FF6A13'] },
  { id: 'ocean', label: 'Ocean', swatch: ['#F3F7FC', '#2563EB'] },
  { id: 'forest', label: 'Forest', swatch: ['#F4F8F3', '#16805A'] },
  { id: 'berry', label: 'Berry', swatch: ['#FCF5F8', '#BE2469'] },
  { id: 'graphite', label: 'Graphite', swatch: ['#F4F4F5', '#6348DC'] },
]

export const themeId = (settings) => (THEMES.some((t) => t.id === settings?.palette) ? settings.palette : 'default')

// 'system' follows the device's light/dark setting.
export const isDark = (settings) => settings?.theme === 'dark'
  || (settings?.theme === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches)

// Text size scales the whole page, px sizes included.
export const TEXT_SIZES = [{ value: 'normal', label: 'Normal', zoom: 1 }, { value: 'large', label: 'Large', zoom: 1.12 }, { value: 'larger', label: 'Larger', zoom: 1.25 }]

// Put the mode (dark class), the colour theme (data-theme) and the text size on an <html> element.
export function applyTheme(root, settings) {
  root.classList.toggle('dark', isDark(settings))
  const zoom = TEXT_SIZES.find((t) => t.value === settings?.textSize)?.zoom || 1
  root.style.zoom = zoom === 1 ? '' : String(zoom)
  const id = themeId(settings)
  if (id === 'default') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', id)
}
