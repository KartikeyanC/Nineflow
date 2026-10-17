// The page Microsoft sends the person back to after they sign in (the redirect address registered in Azure).
// It hands the answer to the NineFlow tab that opened this window (same site, over a BroadcastChannel) and
// closes. lib/microsoft.js does the rest; nothing here is stored.
(function () {
  var p = new URLSearchParams(location.search)
  try {
    var ch = new BroadcastChannel('nineflow-ms')
    ch.postMessage({ code: p.get('code') || '', state: p.get('state') || '', error: p.get('error_description') || p.get('error') || '' })
    ch.close()
  } catch (e) { /* no BroadcastChannel: the NineFlow tab will say the window closed without connecting */ }
  window.close()
})()
