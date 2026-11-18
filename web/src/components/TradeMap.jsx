import { useMemo } from 'react'
import { SHAPES } from './africaShapes'

// Africa by country, with trade routes between real trading towns. Ghana and Kenya (the pilot countries) are highlighted.
const PILOT = ['GH', 'KE']
const TONES = ['#2B3D66', '#32476F', '#3A5078', '#2F4268', '#36497A']

const CITIES = {
  kumasi: { at: [-1.6, 6.7], pilot: true },
  tema: { at: [0, 5.6], pilot: true },
  nairobi: { at: [36.8, -1.3], pilot: true },
  mombasa: { at: [39.7, -4], pilot: true },
  lagos: { at: [3.4, 6.4] },
  abidjan: { at: [-4, 5.3] },
  dakar: { at: [-17.4, 14.7] },
  casablanca: { at: [-7.6, 33.6] },
  alexandria: { at: [29.9, 31.2] },
  djibouti: { at: [43.1, 11.6] },
  dar: { at: [39.3, -6.8] },
  durban: { at: [31, -29.9] },
  capetown: { at: [18.4, -33.9] },
  kinshasa: { at: [15.3, -4.3] },
  luanda: { at: [13.2, -8.8] },
}
const ROUTES = [
  ['kumasi', 'tema'], ['tema', 'lagos'], ['abidjan', 'tema'], ['dakar', 'abidjan'], ['lagos', 'kinshasa'], ['kinshasa', 'nairobi'],
  ['nairobi', 'mombasa'], ['mombasa', 'dar'], ['dar', 'durban'], ['durban', 'capetown'], ['capetown', 'luanda'], ['luanda', 'kinshasa'],
  ['alexandria', 'djibouti'], ['djibouti', 'nairobi'], ['casablanca', 'alexandria'], ['casablanca', 'dakar'], ['mombasa', 'djibouti'],
]

const X = (lon) => (lon + 19) * 10
const Y = (lat) => (39 - lat) * 10

function arc(a, b) {
  const x1 = X(a[0]), y1 = Y(a[1]), x2 = X(b[0]), y2 = Y(b[1])
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const k = 0.22
  return `M${x1} ${y1} Q${mx - (dy / len) * len * k} ${my + (dx / len) * len * k} ${x2} ${y2}`
}

export default function TradeMap({ className = '' }) {
  const countries = useMemo(() => Object.entries(SHAPES).map(([code, s], i) => ({ code, ...s, fill: PILOT.includes(code) ? '#C2583A' : TONES[i % TONES.length] })), [])
  const routes = useMemo(() => ROUTES.map(([a, b]) => arc(CITIES[a].at, CITIES[b].at)), [])

  return (
    <svg viewBox="0 0 710 760" className={className} role="img" aria-label="Map of Africa with trade routes; Ghana and Kenya highlighted">
      <style>{`
        @keyframes oxl-flow { to { stroke-dashoffset: -24; } }
        @keyframes oxl-pulse { 0% { r: 5; opacity: .8; } 100% { r: 24; opacity: 0; } }
        .oxl-route { stroke-dasharray: 4 8; animation: oxl-flow 2.6s linear infinite; }
        .oxl-pulse { animation: oxl-pulse 2.4s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .oxl-route, .oxl-pulse { animation: none; } }
      `}</style>
      <g stroke="rgba(255,255,255,0.32)" strokeWidth="0.8" strokeLinejoin="round">
        {countries.map((c) => <path key={c.code} d={c.d} fill={c.fill}><title>{c.n}</title></path>)}
      </g>
      {routes.map((d, i) => <path key={i} d={d} className="oxl-route" fill="none" stroke="#F3C3AA" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />)}
      {Object.entries(CITIES).map(([k, c]) => {
        const x = X(c.at[0]), y = Y(c.at[1])
        return (
          <g key={k}>
            {c.pilot && <circle cx={x} cy={y} r="5" fill="#fff" className="oxl-pulse" />}
            <circle cx={x} cy={y} r={c.pilot ? 4.6 : 3} fill="#fff" stroke="#1C2B4A" strokeWidth="1.4" />
          </g>
        )
      })}
      <g fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="26" fill="#fff" stroke="#0c1426" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round">
        <text x={X(-1.2)} y={Y(9.5)} textAnchor="middle">Ghana</text>
        <text x={X(37.8)} y={Y(4.8)} textAnchor="middle">Kenya</text>
      </g>
    </svg>
  )
}
