// OXL — find-prospects
// AI prospecting for OXL staff (Richmond, 13 Nov 2026): Claude searches public sources (export agency
// and chamber directories, trade fair exhibitor lists, company websites) for businesses in a country that
// trade a product, and returns them with the page each was found on. They are added to Prospects as
// "New" for staff to review before anyone is contacted. Only published business contacts are kept.
//
// Deploy:   npx supabase functions deploy find-prospects
// Secrets:  the same ANTHROPIC_API_KEY (and optional ANTHROPIC_MODEL) as extract-document.
//           Web search must be allowed for the API key's organisation in the Claude Console.
// Call:     supabase.functions.invoke('find-prospects', { body: { country, hs_code, role, limit } })   (OXL staff only)

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PROMPT = `Find real businesses for OXL, a platform that connects verified African businesses for cross-border trade.
Look for: ROLE_TEXT in COUNTRY_NAME (COUNTRY) that trade PRODUCT_NAME (HS code HSCODE).
Search public sources such as national export promotion agency and chamber of commerce directories, trade fair exhibitor lists,
cooperative registers and company websites. Return at most LIMIT businesses you actually found on a page during this search.
Rules:
- Never invent a business, a website or a contact. Every business must have the URL of the page where you found it.
- Only keep contacts the business publishes for business enquiries (company email, company phone, website). No personal phone numbers or private emails.
- Skip businesses in this list, which OXL already knows: KNOWN.
Return ONLY a JSON object, no prose:
{ "prospects": [ { "name": string, "city": string or null, "website": string or null, "public_contact": string or null,
  "source": short name of the source (e.g. "GEPA exporter directory"), "source_url": string, "why": one sentence on why they fit } ] }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { country, hs_code, role = "exporter", limit = 8 } = await req.json();
    if (!country || !hs_code) return json({ error: "country and hs_code are required" }, 400);

    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: isAdmin } = await asUser.rpc("is_oxl_admin");
    if (!isAdmin) return json({ error: "Only OXL staff signed in with two-step sign-in can search for prospects" }, 403);
    const { data: { user } } = await asUser.auth.getUser();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const [{ data: c }, { data: p }, { data: known1 }, { data: known2 }] = await Promise.all([
      admin.from("countries").select("code, name").eq("code", country).maybeSingle(),
      admin.from("commodities").select("hs_code, name").eq("hs_code", hs_code).maybeSingle(),
      admin.from("prospects").select("name").eq("country", country),
      admin.from("organisations").select("name").eq("country", country),
    ]);
    if (!c || !p) return json({ error: "Unknown country or product" }, 400);
    const known = [...(known1 ?? []), ...(known2 ?? [])].map((x) => x.name);
    const n = Math.max(1, Math.min(Number(limit) || 8, 15));

    const prompt = PROMPT
      .replace("ROLE_TEXT", role === "importer" ? "importers, processors and wholesale buyers" : "exporters, producers, cooperatives and aggregators")
      .replace("COUNTRY_NAME", c.name).replace("(COUNTRY)", `(${c.code})`).replace("PRODUCT_NAME", p.name).replace("HSCODE", p.hs_code)
      .replace("LIMIT", String(n)).replace("KNOWN", known.length ? known.slice(0, 200).join("; ") : "none");

    // Claude with the web search tool; continue if the turn pauses for long searches
    const messages: unknown[] = [{ role: "user", content: prompt }];
    let text = "";
    for (let round = 0; round < 3; round++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, max_tokens: 4096, messages,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }] }),
      });
      if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
      const out = await res.json();
      text += (out.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
      if (out.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: out.content });
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The AI did not return a list. Try again or narrow the product.");
    const found = (JSON.parse(match[0]).prospects ?? []) as Record<string, string | null>[];

    const seen = new Set(known.map((x) => x.toLowerCase().trim()));
    const rows = found
      .filter((x) => x?.name && x?.source_url && /^https?:\/\//.test(String(x.source_url)) && !seen.has(String(x.name).toLowerCase().trim()))
      .slice(0, n)
      .map((x) => ({
        name: String(x.name).trim(), role, country, city: x.city || null, hs_codes: [hs_code],
        website: x.website || null, public_contact: x.public_contact || null,
        source: `AI web search: ${x.source || "public web page"}`, source_url: x.source_url,
        notes: x.why ? `Why: ${x.why}` : null, created_by: user?.id ?? null,
      }));
    if (rows.length) {
      const { error } = await admin.from("prospects").insert(rows);
      if (error) throw new Error(error.message);
      await asUser.rpc("score_all_prospects");
    }
    return json({ ok: true, added: rows.length, skipped: found.length - rows.length, names: rows.map((r) => r.name) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
