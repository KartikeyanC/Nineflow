const listeners = {}
export const Browser = {
  opened: [], closed: 0,
  open: async ({ url }) => { Browser.opened.push(url) },
  close: async () => { Browser.closed += 1 },
  addListener: async (name, fn) => { (listeners[name] ||= new Set()).add(fn); return { remove: () => listeners[name].delete(fn) } },
  emit: (name, data) => [...(listeners[name] || [])].forEach((f) => f(data)),
}
