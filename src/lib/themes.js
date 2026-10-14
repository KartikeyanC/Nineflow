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

// Put the mode (dark class) and the colour theme (data-theme) on an <html> element.
export function applyTheme(root, settings) {
  root.classList.toggle('dark', settings?.theme === 'dark')
  const id = themeId(settings)
  if (id === 'default') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', id)
}
