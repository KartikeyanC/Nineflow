// Gives every <select> on the page a <button><selectedcontent> as its first
// child, which the customizable select (see src/select.css) uses as the
// closed field. With an authored button the chosen label can shrink and end
// in "…", and the chevron stays in view; without one the browser's built-in
// label never shrinks. Done in the DOM rather than in JSX because React 18
// rejects a <button> inside a <select>. React only moves its own <option>
// nodes, so the extra first child is left alone. Browsers without
// customizable select are skipped and keep the native control.

function upgrade(select) {
  if (select.multiple || select.size > 1) return
  labelGroups(select)
  if (select.firstElementChild?.tagName === 'BUTTON') return
  const button = document.createElement('button')
  button.type = 'button'
  button.tabIndex = -1
  button.append(document.createElement('selectedcontent'))
  select.prepend(button)
}

// Group headings ("Category", "Priority"): each <optgroup> gets a <legend>
// holding its label. The customizable select shows that legend as the heading,
// so src/select.css lays it out like the options and it lines up with them;
// the browser's built-in label box has its own padding that CSS can't reach.
function labelGroups(select) {
  for (const group of select.querySelectorAll('optgroup')) {
    let legend = group.firstElementChild?.tagName === 'LEGEND' ? group.firstElementChild : null
    if (!legend) {
      legend = document.createElement('legend')
      group.prepend(legend)
    }
    if (legend.textContent !== group.label) legend.textContent = group.label
  }
}

function scan(root) {
  if (root.nodeType !== 1) return
  if (root.tagName === 'SELECT') upgrade(root)
  else if (root.tagName === 'OPTGROUP') { const select = root.closest('select'); if (select) labelGroups(select) }
  else root.querySelectorAll?.('select').forEach(upgrade)
}

if (typeof CSS !== 'undefined' && CSS.supports('appearance', 'base-select')) {
  scan(document.body)
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach(scan)
  }).observe(document.body, { childList: true, subtree: true })
}
