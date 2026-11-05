// Public holidays from Nager.Date (India's are built in, below): free, no key, no sign-in. One request per country
// and year, cached in this browser for a week. The country is picked in Settings; left
// blank, it comes from the browser's language (en-IN → IN).
import { useEffect, useState } from 'react'

const API = 'https://date.nager.at/api/v3'
const CACHE_KEY = 'nineflow:holidays-cache-v2'
const FRESH_MS = 7 * 24 * 60 * 60_000

// What Settings offers (Nager.Date covers about a hundred countries; these are the common ones).
export const COUNTRIES = [
  ['AU', 'Australia'], ['BR', 'Brazil'], ['CA', 'Canada'], ['DE', 'Germany'], ['ES', 'Spain'], ['FR', 'France'],
  ['GB', 'United Kingdom'], ['IN', 'India'], ['ID', 'Indonesia'], ['IE', 'Ireland'], ['IT', 'Italy'], ['JP', 'Japan'], ['MX', 'Mexico'],
  ['NG', 'Nigeria'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['PH', 'Philippines'], ['PL', 'Poland'], ['PT', 'Portugal'],
  ['SE', 'Sweden'], ['SG', 'Singapore'], ['US', 'United States'], ['ZA', 'South Africa'],
]
// Nager.Date has no data for India, so its list is built in: the 17 central government gazetted holidays
// (DoPT OM F.No.12/2/2023-JCA: 3 July 2025 for 2026, 16 July 2026 for 2027), which every central office
// keeps; states add their own. Add the next year when DoPT publishes it (usually in July). Years not
// listed get the three national holidays, whose dates never change.
const INDIA = {
  2026: {
    '01-26': 'Republic Day', '03-04': 'Holi', '03-21': 'Id-ul-Fitr', '03-26': 'Ram Navami', '03-31': 'Mahavir Jayanti',
    '04-03': 'Good Friday', '05-01': 'Buddha Purnima', '05-27': 'Id-ul-Zuha (Bakrid)', '06-26': 'Muharram',
    '08-15': 'Independence Day', '08-26': 'Milad-un-Nabi', '09-04': 'Janmashtami', '10-02': 'Gandhi Jayanti',
    '10-20': 'Dussehra', '11-08': 'Diwali', '11-24': 'Guru Nanak Jayanti', '12-25': 'Christmas',
  },
  2027: {
    '01-26': 'Republic Day', '03-10': 'Id-ul-Fitr', '03-23': 'Holi', '03-26': 'Good Friday', '04-15': 'Ram Navami',
    '04-19': 'Mahavir Jayanti', '05-17': 'Id-ul-Zuha (Bakrid)', '05-20': 'Buddha Purnima', '06-16': 'Muharram',
    '08-15': 'Independence Day / Milad-un-Nabi', '08-25': 'Janmashtami', '10-02': 'Gandhi Jayanti',
    '10-09': 'Dussehra', '10-29': 'Diwali', '11-14': 'Guru Nanak Jayanti', '12-25': 'Christmas',
  },
}
const INDIA_FIXED = { '01-26': 'Republic Day', '08-15': 'Independence Day', '10-02': 'Gandhi Jayanti' }
export function indiaYear(year) {
  return Object.fromEntries(Object.entries(INDIA[year] || INDIA_FIXED).map(([md, name]) => [`${year}-${md}`, name]))
}

export const countryFromBrowser = () => {
  try { return (navigator.language || '').split('-')[1]?.toUpperCase() || '' } catch { return '' }
}

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} } }
const writeCache = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)) } catch { /* ignore */ } }

// { 'yyyy-MM-dd': 'Holiday name' } for a country and year ({} when there is no data).
export async function loadYear(country, year) {
  if (country === 'IN') return indiaYear(year)
  const id = `${country}-${year}`
  const cache = readCache()
  if (cache[id] && Date.now() - cache[id].at < FRESH_MS) return cache[id].days
  const r = await fetch(`${API}/PublicHolidays/${year}/${country}`)
  if (r.status === 404 || r.status === 204) return {}
  if (!r.ok) throw new Error('Could not load public holidays.')
  const list = await r.json()
  const days = {}
  for (const h of Array.isArray(list) ? list : []) {
    // "global" ones apply nationwide; regional ones (counties) are left out so a day isn't marked wrongly.
    if (h.global === false && !(h.types || []).includes('Public')) continue
    const name = h.localName || h.name
    const have = days[h.date] ? days[h.date].split(' / ') : []
    if (!have.includes(name)) days[h.date] = [...have, name].join(' / ') // the service lists a day once per kind
  }
  writeCache({ ...cache, [id]: { at: Date.now(), days } })
  return days
}

// The holiday map for the years in `years`, or null while Settings has it off.
export function useHolidays(holidays, years) {
  const country = holidays?.on ? (holidays.country || countryFromBrowser()) : ''
  const wanted = [...new Set(years)].sort().join(',')
  const [map, setMap] = useState({})
  useEffect(() => {
    if (!country) { setMap({}); return undefined }
    let live = true
    Promise.all(wanted.split(',').filter(Boolean).map((y) => loadYear(country, y).catch(() => ({}))))
      .then((all) => live && setMap(Object.assign({}, ...all)))
    return () => { live = false }
  }, [country, wanted])
  return country ? map : null
}
