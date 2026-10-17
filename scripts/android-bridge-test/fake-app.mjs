const listeners = {}
export const App = {
  addListener: async (name, fn) => { (listeners[name] ||= new Set()).add(fn); return { remove: () => listeners[name].delete(fn) } },
  emit: (name, data) => [...(listeners[name] || [])].forEach((f) => f(data)),
  count: (name) => (listeners[name] ? listeners[name].size : 0),
}
