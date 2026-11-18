// Year picker: current year back to 1900, newest first.
export default function YearSelect({ id, value, onChange, from = 1900 }) {
  const now = new Date().getFullYear()
  const years = []
  for (let y = now; y >= from; y--) years.push(y)
  return (
    <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a year…</option>
      {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
    </select>
  )
}
