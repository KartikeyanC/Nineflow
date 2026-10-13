import { useLayoutEffect } from 'react'
import { usePlanner } from '../store/PlannerContext'

// The sidebar shows its labels from 1024px wide and is an icon rail below that. Minimizing
// it keeps the rail on wide windows too. The choice is saved in settings (sidebarMin) and
// mirrored onto <html data-rail>, which the `wide:` Tailwind variant reads, so the sidebar
// and every button inside it follow without each one having to know about it.
export function useSidebarRail() {
  const { settings, updateSettings } = usePlanner()
  const min = !!settings.sidebarMin
  // A layout effect, so a saved minimized sidebar never flashes open on load.
  useLayoutEffect(() => {
    const root = document.documentElement
    if (min) root.setAttribute('data-rail', '')
    else root.removeAttribute('data-rail')
    return () => root.removeAttribute('data-rail')
  }, [min])
  return { min, toggle: () => updateSettings({ sidebarMin: !min }) }
}
