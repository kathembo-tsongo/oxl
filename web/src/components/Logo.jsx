// OXL logo: the woven diamond. variant="light" for light backgrounds, "dark" for navy ones.
const COLORS = {
  light: { a: '#1C2B4A', b: '#C2583A', c: '#2E6B45', d: '#E2A33B' },
  dark: { a: '#FFFFFF', b: '#C2583A', c: '#5DB07E', d: '#E2A33B' },
}

export function LogoMark({ size = 32, variant = 'light', className = '' }) {
  const c = COLORS[variant] ?? COLORS.light
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden="true">
      <path d="M48 6 90 48 48 48z" fill={c.b} />
      <path d="M90 48 48 90 48 48z" fill={c.d} />
      <path d="M48 90 6 48 48 48z" fill={c.c} />
      <path d="M6 48 48 6 48 48z" fill={c.a} />
    </svg>
  )
}

export default function Logo({ size = 32, variant = 'light', wordmark = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} variant={variant} />
      {wordmark && <span className={`font-serif font-bold tracking-[0.04em] ${variant === 'dark' ? 'text-white' : 'text-navy'}`} style={{ fontSize: Math.round(size * 0.85), lineHeight: 1 }}>OXL</span>}
    </span>
  )
}
