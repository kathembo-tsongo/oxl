import { useMemo } from 'react'

// A dotted map of Africa with trade routes between real trading towns. Drawn in code: no image files.
const OUTLINE = [
  [-5.9, 35.8], [-2, 35.1], [3, 36.8], [10, 37.2], [11, 33.8], [15, 32.4], [20, 32.2], [21, 33], [25, 31.6], [29.9, 31.2], [32.3, 31.3],
  [32.6, 30], [34, 27], [35.5, 24], [37.2, 21], [37.4, 18.5], [39, 15.6], [43.1, 12.7], [43.2, 11.5], [45, 10.4], [51.2, 11.8], [49, 6],
  [48, 4.5], [45.3, 2], [42.5, -1], [40.1, -3], [39.2, -5.1], [39.5, -8], [40.5, -11], [40.6, -15], [37, -18], [35, -20], [35.5, -23.9],
  [33, -25.5], [32.9, -27], [31, -30], [28, -33], [25.6, -34], [22, -34.1], [18.5, -34.1], [17.8, -32], [15.2, -27], [14.4, -22.5],
  [12.3, -18], [11.7, -16.5], [13.7, -12], [13.2, -9], [12.2, -6], [9.3, -0.8], [9.5, 1], [9.7, 3.9], [8.5, 4.5], [6, 4.3], [3.4, 6.4],
  [1.2, 6.1], [-1.8, 4.8], [-4, 5.2], [-7.5, 4.4], [-9.5, 5.2], [-12.5, 7.4], [-13.7, 9.5], [-16.7, 12.3], [-17.5, 14.7], [-16.5, 19],
  [-16, 21], [-17, 21.3], [-13.2, 27.6], [-10, 29.4], [-9.8, 31.2], [-8.5, 33.2], [-6.8, 34],
]

const CITIES = {
  kumasi: { name: 'Kumasi', at: [-1.6, 6.7], pilot: 'Ghana' },
  tema: { name: 'Tema', at: [0, 5.6], pilot: 'Ghana' },
  nairobi: { name: 'Nairobi', at: [36.8, -1.3], pilot: 'Kenya' },
  mombasa: { name: 'Mombasa', at: [39.7, -4] , pilot: 'Kenya' },
  lagos: { name: 'Lagos', at: [3.4, 6.4] },
  abidjan: { name: 'Abidjan', at: [-4, 5.3] },
  dakar: { name: 'Dakar', at: [-17.4, 14.7] },
  casablanca: { name: 'Casablanca', at: [-7.6, 33.6] },
  alexandria: { name: 'Alexandria', at: [29.9, 31.2] },
  djibouti: { name: 'Djibouti', at: [43.1, 11.6] },
  dar: { name: 'Dar es Salaam', at: [39.3, -6.8] },
  durban: { name: 'Durban', at: [31, -29.9] },
  capetown: { name: 'Cape Town', at: [18.4, -33.9] },
  kinshasa: { name: 'Kinshasa', at: [15.3, -4.3] },
  luanda: { name: 'Luanda', at: [13.2, -8.8] },
}
const ROUTES = [
  ['kumasi', 'tema'], ['tema', 'lagos'], ['abidjan', 'tema'], ['dakar', 'abidjan'], ['lagos', 'kinshasa'], ['kinshasa', 'nairobi'],
  ['nairobi', 'mombasa'], ['mombasa', 'dar'], ['dar', 'durban'], ['durban', 'capetown'], ['capetown', 'luanda'], ['luanda', 'kinshasa'],
  ['alexandria', 'djibouti'], ['djibouti', 'nairobi'], ['casablanca', 'alexandria'], ['casablanca', 'dakar'], ['mombasa', 'djibouti'],
]

const X = (lon) => (lon + 19) * 10
const Y = (lat) => (39 - lat) * 10

function inside(lon, lat) {
  let c = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i]; const [xj, yj] = OUTLINE[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

function arc(a, b) {
  const x1 = X(a[0]), y1 = Y(a[1]), x2 = X(b[0]), y2 = Y(b[1])
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const k = 0.22
  return `M${x1} ${y1} Q${mx - (dy / len) * len * k} ${my + (dx / len) * len * k} ${x2} ${y2}`
}

export default function TradeMap({ className = '' }) {
  const dots = useMemo(() => {
    let d = ''
    for (let lon = -18; lon <= 52; lon += 1.5) for (let lat = 38; lat >= -35; lat -= 1.5) if (inside(lon, lat)) d += `M${X(lon).toFixed(1)} ${Y(lat).toFixed(1)}h0`
    return d
  }, [])
  const routes = useMemo(() => ROUTES.map(([a, b]) => arc(CITIES[a].at, CITIES[b].at)), [])

  return (
    <svg viewBox="0 0 710 760" className={className} role="img" aria-label="Trade routes between African towns and ports">
      <style>{`
        @keyframes oxl-flow { to { stroke-dashoffset: -24; } }
        @keyframes oxl-pulse { 0% { r: 5; opacity: .75; } 100% { r: 22; opacity: 0; } }
        .oxl-route { stroke-dasharray: 4 8; animation: oxl-flow 2.6s linear infinite; }
        .oxl-pulse { animation: oxl-pulse 2.4s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .oxl-route, .oxl-pulse { animation: none; } }
      `}</style>
      <path d={dots} stroke="rgba(255,255,255,0.22)" strokeWidth="4.2" strokeLinecap="round" fill="none" />
      {routes.map((d, i) => <path key={i} d={d} className="oxl-route" fill="none" stroke="#E08A66" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />)}
      {Object.entries(CITIES).map(([k, c]) => {
        const x = X(c.at[0]), y = Y(c.at[1])
        return (
          <g key={k}>
            {c.pilot && <circle cx={x} cy={y} r="5" fill="#E08A66" className="oxl-pulse" />}
            <circle cx={x} cy={y} r={c.pilot ? 5 : 3.2} fill={c.pilot ? '#E08A66' : '#fff'} stroke="#1C2B4A" strokeWidth="1.5" />
          </g>
        )
      })}
      <g fontFamily="Inter, system-ui, sans-serif" fontWeight="600" fill="#fff">
        <text x={X(-1.6) - 14} y={Y(6.7) - 16} fontSize="17" textAnchor="end">Ghana</text>
        <text x={X(36.8) - 14} y={Y(-1.3) - 14} fontSize="17" textAnchor="end">Kenya</text>
      </g>
    </svg>
  )
}
