// OXL — sync-sanctions
// Downloads the UN Security Council Consolidated List (free, public XML) and replaces the UN rows in
// public.sanctions_entries. Names added by hand are never touched. Run it daily from a schedule; staff can also
// run it from Reference data > Sanctions list.
//
// Deploy:   npx supabase functions deploy sync-sanctions --no-verify-jwt
// Secret:   npx supabase secrets set SANCTIONS_CRON_SECRET=<a long random string>   (used only by the schedule)
// Call:     staff: supabase.functions.invoke('sync-sanctions')      schedule: header x-cron-secret: <the secret>

import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { parseUnList } from "./un_parse.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const UN_URL = "https://scsanctions.un.org/resources/xml/en/consolidated.xml";
const UN_LIST = "UN Security Council Consolidated List";
const SOURCE_PAGE = "https://scsanctions.un.org/search/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Who is calling: the schedule (shared secret) or a signed-in OXL staff member
  const secret = Deno.env.get("SANCTIONS_CRON_SECRET");
  let allowed = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!allowed) {
    const auth = req.headers.get("Authorization");
    if (auth) {
      const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data } = await asUser.rpc("is_oxl_admin");
      allowed = data === true;
    }
  }
  if (!allowed) return json({ ok: false, error: "OXL staff only" }, 403);

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const res = await fetch(UN_URL, { headers: { Accept: "application/xml" }, signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`The UN site answered ${res.status}`);
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
    const rows = parseUnList(parser.parse(xml), SOURCE_PAGE);
    const { data, error } = await svc.rpc("replace_sanctions_list", { p_list: UN_LIST, p_rows: rows });
    if (error) throw new Error(error.message);
    if (typeof data === "number" && data < 0) throw new Error(`Only ${rows.length} entries were read; the list was left unchanged`);
    return json({ ok: true, list: UN_LIST, entries: data, individuals: rows.filter((r) => r.kind === "individual" && !r.alias).length, entities: rows.filter((r) => r.kind === "entity" && !r.alias).length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await svc.from("sanctions_sync_log").insert({ list_name: UN_LIST, entries: 0, ok: false, message });
    return json({ ok: false, error: message }, 502);
  }
});
