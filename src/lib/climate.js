// The Month screen's banner follows the climate: each month gets its season's scene and
// its own colours. Seasons depend on where you are, so the climate comes from Settings
// (settings.climate), or by default from this device's time zone.
//
//   monsoon   South Asia (India and neighbours): winter, spring, summer, monsoon, autumn
//   northern  the four seasons, Dec–Feb winter
//   southern  the four seasons, flipped: Jun–Aug winter

export const CLIMATES = [
  { id: 'auto', label: 'Automatic' },
  { id: 'monsoon', label: 'Monsoon (South Asia)' },
  { id: 'northern', label: 'Northern hemisphere' },
  { id: 'southern', label: 'Southern hemisphere' },
]

const MONSOON_ZONES = ['Asia/Kolkata', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Colombo', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Karachi', 'Asia/Thimphu', 'Indian/Maldives', 'Asia/Yangon', 'Asia/Rangoon']
const SOUTHERN = /^(Australia\/|Antarctica\/|Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Noumea)|America\/(Argentina\/|Buenos_Aires|Sao_Paulo|Santiago|Montevideo|Asuncion|Punta_Arenas)|Africa\/(Johannesburg|Maputo|Windhoek|Harare|Gaborone|Maseru|Mbabane|Lusaka|Blantyre)|Indian\/(Mauritius|Reunion|Antananarivo))/

export function detectClimate(zone) {
  let tz = zone
  try { tz ??= Intl.DateTimeFormat().resolvedOptions().timeZone } catch { tz = '' }
  if (MONSOON_ZONES.includes(tz)) return 'monsoon'
  if (SOUTHERN.test(tz || '')) return 'southern'
  return 'northern'
}

export const climateOf = (settings) => (settings?.climate && settings.climate !== 'auto' ? settings.climate : detectClimate())

// Month 0 = January.
const SEASONS = {
  monsoon: ['winter', 'spring', 'summer', 'summer', 'summer', 'monsoon', 'monsoon', 'monsoon', 'monsoon', 'autumn', 'autumn', 'winter'],
  northern: ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'],
}
SEASONS.southern = SEASONS.northern.map((_, m) => SEASONS.northern[(m + 6) % 12])

// Top → bottom colours. All dark enough for the large white month name (3:1 or more).
const GRADIENTS = {
  northern: [
    ['#1E3A8A', '#2563EB'], ['#312E81', '#4F46E5'], ['#065F46', '#059669'], ['#9D174D', '#DB2777'],
    ['#166534', '#15803D'], ['#B45309', '#C2410C'], ['#C2410C', '#DC2626'], ['#9A3412', '#B91C1C'],
    ['#92400E', '#A16207'], ['#9A3412', '#C2410C'], ['#57534E', '#78716C'], ['#0F172A', '#1E40AF'],
  ],
  monsoon: [
    ['#1E3A8A', '#2563EB'], ['#9D174D', '#DB2777'], ['#B45309', '#C2410C'], ['#C2410C', '#DC2626'],
    ['#9A3412', '#B91C1C'], ['#334155', '#475569'], ['#1E293B', '#0F766E'], ['#14532D', '#15803D'],
    ['#134E4A', '#0F766E'], ['#9A3412', '#C2410C'], ['#92400E', '#A16207'], ['#0F172A', '#1E40AF'],
  ],
}
GRADIENTS.southern = GRADIENTS.northern.map((_, m) => GRADIENTS.northern[(m + 6) % 12])

export const SEASON_LABEL = { winter: 'Winter', spring: 'Spring', summer: 'Summer', monsoon: 'Monsoon', autumn: 'Autumn' }

export function monthLook(monthIndex, climate) {
  const c = SEASONS[climate] ? climate : 'northern'
  const season = SEASONS[c][monthIndex]
  const [from, to] = GRADIENTS[c][monthIndex]
  return { season, label: SEASON_LABEL[season], from, to }
}
