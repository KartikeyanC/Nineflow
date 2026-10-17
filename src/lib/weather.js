// Today's weather (and the week ahead) from Open-Meteo: free, no key, no sign-in.
// The place is a city the person picks in Settings (the site doesn't ask for the
// device's location). Forecasts are cached for an hour per place, in this browser only.
import { useEffect, useState } from 'react'

const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const CACHE_KEY = 'nineflow:weather-cache'
const FRESH_MS = 60 * 60_000

// WMO weather codes → words and an icon name (lucide-react).
const CODES = [
  [[0], 'Clear', 'Sun'],
  [[1], 'Mostly clear', 'Sun'],
  [[2], 'Partly cloudy', 'CloudSun'],
  [[3], 'Cloudy', 'Cloud'],
  [[45, 48], 'Fog', 'CloudFog'],
  [[51, 53, 55, 56, 57], 'Drizzle', 'CloudDrizzle'],
  [[61, 63, 66, 80, 81], 'Rain', 'CloudRain'],
  [[65, 67, 82], 'Heavy rain', 'CloudRain'],
  [[71, 73, 75, 77, 85, 86], 'Snow', 'CloudSnow'],
  [[95, 96, 99], 'Thunderstorm', 'CloudLightning'],
]
export function describeCode(code) {
  const hit = CODES.find(([list]) => list.includes(code))
  return hit ? { label: hit[1], icon: hit[2] } : { label: 'Weather', icon: 'Cloud' }
}

// City search for Settings: [{ name, region, country, lat, lon }]
export async function searchPlaces(text) {
  const name = String(text || '').trim()
  if (name.length < 2) return []
  const r = await fetch(`${GEOCODE}?${new URLSearchParams({ name, count: '6', language: 'en', format: 'json' })}`)
  if (!r.ok) throw new Error('Could not search places right now.')
  const d = await r.json()
  return (d.results || []).map((p) => ({ name: p.name, region: p.admin1 || '', country: p.country || '', lat: p.latitude, lon: p.longitude }))
}

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null } }
const writeCache = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)) } catch { /* ignore */ } }
const placeId = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`

// { now: { temp, code }, days: [{ date, code, max, min, rain }] } for the place.
export async function loadForecast(place) {
  const id = placeId(place)
  const cached = readCache()
  if (cached && cached.id === id && Date.now() - cached.at < FRESH_MS) return cached.data
  const q = new URLSearchParams({
    latitude: String(place.lat), longitude: String(place.lon), timezone: 'auto', forecast_days: '7',
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  })
  const r = await fetch(`${FORECAST}?${q}`)
  if (!r.ok) throw new Error('Could not load the weather.')
  const d = await r.json()
  const data = {
    now: { temp: Math.round(d.current?.temperature_2m), code: d.current?.weather_code },
    days: (d.daily?.time || []).map((date, i) => ({
      date, code: d.daily.weather_code[i],
      max: Math.round(d.daily.temperature_2m_max[i]), min: Math.round(d.daily.temperature_2m_min[i]),
      rain: d.daily.precipitation_probability_max?.[i] ?? null,
    })),
  }
  writeCache({ id, at: Date.now(), data })
  return data
}

// { state: 'off' | 'loading' | 'ok' | 'error', data }
export function useWeather(weather) {
  const place = weather?.on ? weather.place : null
  const key = place ? placeId(place) : ''
  const [st, setSt] = useState({ state: 'off', data: null })
  useEffect(() => {
    if (!place) { setSt({ state: 'off', data: null }); return undefined }
    let live = true
    const go = () => loadForecast(place)
      .then((data) => live && setSt({ state: 'ok', data }))
      .catch(() => live && setSt((s) => ({ state: s.data ? 'ok' : 'error', data: s.data })))
    setSt((s) => ({ state: s.data ? s.state : 'loading', data: s.data }))
    go()
    const id = setInterval(go, FRESH_MS)
    return () => { live = false; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return st
}
