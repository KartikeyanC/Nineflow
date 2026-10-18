// True on a phone-sized screen (under 640px, where the website switches to its phone layout).
import { useEffect, useState } from 'react'

const QUERY = '(max-width: 639px)'

export function usePhone() {
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const h = (e) => setV(e.matches)
    mq.addEventListener('change', h)
    setV(mq.matches)
    return () => mq.removeEventListener('change', h)
  }, [])
  return v
}
