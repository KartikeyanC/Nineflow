// The Drive files attached to a task (lib/picker.js): { id, name, url, icon }, at most 8. Kept in its own
// small file so the stored-data code can use it without loading any Google code.
// Only Google's own addresses are kept as links, so an entry can't be made to point anywhere else.
export const MAX_FILES = 8
export const isDriveLink = (u) => /^https:\/\/(docs|drive|sheets|slides|forms)\.google\.com\//.test(String(u || ''))
export const cleanFiles = (list) => (Array.isArray(list) ? list : [])
  .filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string' && isDriveLink(f.url))
  .slice(0, MAX_FILES)
  .map((f) => ({ id: f.id, name: f.name.slice(0, 120), url: f.url, icon: /^https:\/\/\S+$/.test(f.icon || '') ? f.icon : '' }))
