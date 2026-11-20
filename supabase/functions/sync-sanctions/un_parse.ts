// Turns the UN Security Council consolidated list (XML) into rows for public.replace_sanctions_list.
// Individuals and entities (companies, groups) are both kept; every alias becomes its own row, except aliases
// the UN marks as low quality (they are too vague and would block innocent names).
export type Row = { name: string; ref: string; kind: "entity" | "individual"; alias: boolean; listed_on: string; source_url: string };

const clean = (v: unknown): string => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const day = (v: unknown): string => { const s = clean(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; };

export function parseUnList(doc: any, sourceUrl: string): Row[] {
  const root = doc?.CONSOLIDATED_LIST ?? {};
  const rows: Row[] = [];
  const add = (kind: Row["kind"], item: any, name: string, aliases: any[]) => {
    const ref = clean(item.REFERENCE_NUMBER) || clean(item.DATAID);
    if (!name || !ref) return;
    const listed_on = day(item.LISTED_ON);
    const seen = new Set<string>([name.toLowerCase()]);
    rows.push({ name, ref, kind, alias: false, listed_on, source_url: sourceUrl });
    for (const a of aliases) {
      if (/low/i.test(clean(a.QUALITY))) continue;
      const an = clean(a.ALIAS_NAME);
      if (!an || seen.has(an.toLowerCase())) continue;
      seen.add(an.toLowerCase());
      rows.push({ name: an, ref, kind, alias: true, listed_on, source_url: sourceUrl });
    }
  };
  for (const i of arr<any>(root.INDIVIDUALS?.INDIVIDUAL)) {
    add("individual", i, [i.FIRST_NAME, i.SECOND_NAME, i.THIRD_NAME, i.FOURTH_NAME].map(clean).filter(Boolean).join(" "), arr<any>(i.INDIVIDUAL_ALIAS));
  }
  for (const e of arr<any>(root.ENTITIES?.ENTITY)) {
    add("entity", e, clean(e.FIRST_NAME), arr<any>(e.ENTITY_ALIAS));
  }
  return rows;
}
