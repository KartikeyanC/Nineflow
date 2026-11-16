// Shared script for the NineFlow portfolio pages.
// 1. Each .phone gets a screen with a status bar (time, signal, wifi, battery) above its screenshot,
//    sized from the phone's width, so the camera cut-out sits over the bar and not over the app.
// 2. Elements with .reveal fade in as they scroll into view.
document.documentElement.classList.add('js')

const BAR_ICONS =
  '<svg width="1.1em" height=".75em" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
  '<svg width="1em" height=".75em" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.4 10.4 0 0 0 8 .4 10.4 10.4 0 0 0 .8 3.3L2 4.6a8.6 8.6 0 0 1 6-2.4Zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.2-1.3A6.7 6.7 0 0 0 8 4a6.7 6.7 0 0 0-4.6 1.8l1.2 1.3A4.9 4.9 0 0 1 8 5.8Zm0 3.6c.4 0 .8.2 1.1.4L8 11.6 6.9 9.8c.3-.2.7-.4 1.1-.4Z"/></svg>' +
  '<svg width="1.6em" height=".8em" viewBox="0 0 26 13" fill="none" aria-hidden="true"><rect x=".5" y=".5" width="22" height="12" rx="3.5" stroke="currentColor" opacity=".4"/><rect x="2.5" y="2.5" width="16" height="8" rx="2" fill="currentColor"/><rect x="24" y="4.5" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".4"/></svg>'

function framePhones() {
  for (const phone of document.querySelectorAll('.phone')) {
    let screen = phone.querySelector('.screen')
    if (!screen) {
      const img = phone.querySelector('img')
      if (!img) continue
      screen = document.createElement('div')
      screen.className = 'screen' + (/dark/.test(img.getAttribute('src')) ? ' dark' : '')
      const sb = document.createElement('div')
      sb.className = 'sb'
      sb.innerHTML = '<span>9:41</span><span>' + BAR_ICONS + '</span>'
      img.replaceWith(screen)
      screen.append(sb, img)
    }
    const w = phone.getBoundingClientRect().width
    if (!w) continue
    phone.style.setProperty('--w', w + 'px')
    const sb = screen.querySelector('.sb')
    sb.style.height = (w * 0.125) + 'px'
    sb.style.fontSize = (w * 0.042) + 'px'
    sb.style.paddingTop = (w * 0.01) + 'px'
  }
}
framePhones()
addEventListener('resize', () => requestAnimationFrame(framePhones))

const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
  }, { rootMargin: '0px 0px -8% 0px' })
  : null
for (const el of document.querySelectorAll('.reveal')) io ? io.observe(el) : el.classList.add('in')
