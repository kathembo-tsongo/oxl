// OXL — extract-document
// Reads an uploaded certificate (PDF or image) from the 'documents' bucket, asks Claude to pull out
// the key fields as JSON, and saves them on public.documents.extracted for an OXL admin to review.
//
// Deploy:   npx supabase functions deploy extract-document
// Secrets:  npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...  [ANTHROPIC_MODEL=<model id>]
// Call:     supabase.functions.invoke('extract-document', { body: { document_id } })

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function encodeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";

const PROMPT = `You are checking a trade document uploaded by an African agribusiness to a trade-facilitation platform.
Return ONLY a JSON object, no prose, with these keys (use null when a value is not visible):
{
  "detected_doc_type": one of "business_registration","export_licence","tax_certificate","quality_certificate","phytosanitary_certificate","invoice","other",
  "issuing_authority": string,
  "company_name": string,
  "registration_or_licence_no": string,
  "country": ISO 3166 alpha-2 code,
  "issue_date": "YYYY-MM-DD",
  "expiry_date": "YYYY-MM-DD",
  "commodities": array of strings,
  "is_expired": boolean (compare expiry_date with today's date: TODAY),
  "red_flags": array of short strings (e.g. "name differs from profile", "no stamp or signature visible", "document appears edited"),
  "confidence": "high" | "medium" | "low"
}
The organisation's profile name is: ORG_NAME. Flag a mismatch if the document names a different company.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let document_id: string | undefined;
  try {
    ({ document_id } = await req.json());
    if (!document_id) return json({ error: "document_id is required" }, 400);

    // Client acting as the caller: RLS decides whether they may see this document
    const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: doc, error: docErr } = await asUser
      .from("documents").select("id, org_id, storage_path, file_name, organisations(name)")
      .eq("id", document_id).single();
    if (docErr || !doc) return json({ error: "Document not found or not yours" }, 404);

    // Service client for storage download and the result write
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("documents").update({ extraction_status: "processing" }).eq("id", document_id);

    const { data: file, error: dlErr } = await admin.storage.from("documents").download(doc.storage_path);
    if (dlErr || !file) throw new Error("Could not download file: " + dlErr?.message);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) throw new Error("File larger than 20 MB");
    const b64 = encodeBase64(bytes);
    const name = doc.file_name.toLowerCase();
    const mediaType = name.endsWith(".pdf") ? "application/pdf"
      : name.endsWith(".png") ? "image/png"
      : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const filePart = mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data: b64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };

    // deno-lint-ignore no-explicit-any
    const orgName = (doc as any).organisations?.name ?? "unknown";
    const prompt = PROMPT.replace("TODAY", new Date().toISOString().slice(0, 10)).replace("ORG_NAME", orgName);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: [filePart, { type: "text", text: prompt }] }],
      }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    const out = await res.json();
    const text: string = out.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model did not return JSON");
    const extracted = { ...JSON.parse(match[0]), model: MODEL, extracted_at: new Date().toISOString() };

    await admin.from("documents").update({ extracted, extraction_status: "done" }).eq("id", document_id);
    return json({ ok: true, extracted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      if (document_id) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await admin.from("documents").update({ extraction_status: "failed", review_notes: msg.slice(0, 500) }).eq("id", document_id);
      }
    } catch { /* ignore */ }
    return json({ error: msg }, 500);
  }
});
