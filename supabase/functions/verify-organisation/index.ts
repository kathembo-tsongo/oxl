// OXL — verify-organisation
// AI pre-check of one organisation for OXL staff. Gathers what OXL holds about it (profile, business
// activity, pinned location and its automatic check, what the AI read from its documents and IDs,
// identity progress, field visits, sanctions matches), asks Claude for a consistency review, and stores
// the result in public.org_ai_checks. The result supports OXL staff; it never changes a trust level.
//
// Deploy:   npx supabase functions deploy verify-organisation
// Secrets:  the same ANTHROPIC_API_KEY (and optional ANTHROPIC_MODEL) as extract-document
// Call:     supabase.functions.invoke('verify-organisation', { body: { org_id } })   (OXL staff only)

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const PROMPT = `You support the verification team of OXL, a platform that connects African businesses for cross-border trade
and shares trust reports with lenders. Below is everything OXL holds about one organisation, as JSON.
Check whether the facts are consistent with each other and with what such a business should look like.
Consider: name on registration documents vs profile name; names on identity documents vs the declared people;
registration and licence numbers; expiry dates (today is TODAY); the declared country and town vs the pinned map
location and its automatic check; the business activity vs the commodities and description; how the business
trades (individual, enterprise, cooperative, trader) vs the documents provided; red flags the document reader raised;
field visit findings; sanctions matches.
Return ONLY a JSON object, no prose:
{
  "summary": two or three plain sentences for the OXL analyst,
  "checks": [ { "area": one of "identity","registration","documents","location","activity","field_visits","sanctions",
                "result": "pass" | "warn" | "fail" | "missing", "detail": one short sentence } ],
  "red_flags": array of short strings,
  "next_steps": array of short, concrete actions for the analyst (e.g. "Ask for the second director's ID"),
  "suggested_tier": one of "self_declared","documents_checked","registry_checked","field_verified",
  "confidence": "high" | "medium" | "low"
}
Base every statement on the data given; when something is not in the data, mark it "missing" rather than guessing.
DATA:
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let org_id: string | undefined;
  let requested_by: string | null = null;
  try {
    ({ org_id } = await req.json());
    if (!org_id) return json({ error: "org_id is required" }, 400);

    // Only OXL staff (signed in with their second factor) may run it
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: isAdmin } = await asUser.rpc("is_oxl_admin");
    if (!isAdmin) return json({ error: "Only OXL staff signed in with two-step sign-in can run the AI pre-check" }, 403);
    const { data: { user } } = await asUser.auth.getUser();
    requested_by = user?.id ?? null;

    const { data: org, error: oErr } = await admin.from("organisations")
      .select("id, name, role, entity_type, country, city, registration_no, year_established, description, hs_codes, verification_tier, is_suspended, geo_status, created_at, business_categories(scheme, code, name), locations(name, country)")
      .eq("id", org_id).single();
    if (oErr || !org) return json({ error: "Organisation not found" }, 404);

    const [docs, people, identity, visits, history, producers, pin] = await Promise.all([
      admin.from("documents").select("doc_type, holder_name, holder_role, review_status, extraction_status, extracted, created_at").eq("org_id", org_id),
      admin.from("profiles").select("full_name").eq("org_id", org_id),
      asUser.rpc("identity_requirement", { p_org: org_id }),
      admin.from("field_visits").select("visit_date, visitor_name, location_text, lat, lon, outcome, findings").eq("org_id", org_id),
      admin.from("verifications").select("tier, method, created_at").eq("org_id", org_id),
      admin.from("seller_producers").select("producer_name, consent_method, commission_pct, withdrawn_at").eq("seller_org_id", org_id),
      admin.from("org_locations").select("lat, lon, accuracy_m, source, auto_check, set_at, reviewed_at, review_note").eq("org_id", org_id).maybeSingle(),
    ]);

    // Sanctions: exact name matches on the business and on the people named on its IDs
    const names = new Set<string>([org.name]);
    for (const d of docs.data ?? []) {
      if (d.holder_name) names.add(d.holder_name);
      // deno-lint-ignore no-explicit-any
      const h = (d.extracted as any)?.holder_name; if (h) names.add(String(h));
    }
    for (const p of people.data ?? []) if (p.full_name) names.add(p.full_name);
    const { data: sanctions } = await admin.from("sanctions_entries").select("name, country, list_name");
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const wanted = new Set([...names].map(norm));
    const sanctionMatches = (sanctions ?? []).filter((s) => wanted.has(norm(s.name)));

    const data = {
      organisation: org,
      pinned_location: pin.data ?? null,
      people_registered: (people.data ?? []).map((p) => p.full_name),
      identity_requirement: identity.data ?? null,
      documents: docs.data ?? [],
      field_visits: visits.data ?? [],
      verification_history: history.data ?? [],
      producers_sold_for: producers.data ?? [],
      sanctions_matches: sanctionMatches,
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 2048,
        messages: [{ role: "user", content: PROMPT.replace("TODAY", new Date().toISOString().slice(0, 10)) + JSON.stringify(data) }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    const out = await res.json();
    const text: string = out.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model did not return JSON");
    const result = { ...JSON.parse(match[0]), sanctions_matches: sanctionMatches };

    const { data: row } = await admin.from("org_ai_checks")
      .insert({ org_id, status: "done", result, model: MODEL, requested_by }).select().single();
    return json({ ok: true, check: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (org_id) await admin.from("org_ai_checks").insert({ org_id, status: "failed", error: msg.slice(0, 1000), model: MODEL, requested_by });
    return json({ error: msg }, 500);
  }
});
