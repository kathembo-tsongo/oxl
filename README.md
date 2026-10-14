# OXL Trade Facilitation Platform — MVP

Working prototype for the Kenya–Ghana pilot. Exporters post offers, importers post sourcing requests,
OXL ranks matches with reasons, verifies organisations in tiers, and gives financiers a consent-based
risk report. Target: demo-ready for the UK grant application by early December 2026.

## What's in here

| Path | What it is |
| --- | --- |
| `supabase/migrations/…_core_schema.sql` | Tables, enums, onboarding and verification functions, guard triggers |
| `supabase/migrations/…_rls_and_logic.sql` | Row-level security, matching engine (`match_offer`, `match_request`), `risk_report` |
| `supabase/migrations/…_storage_and_reference.sql` | Private `documents` storage bucket + policies |
| `supabase/seed.sql` | Countries, commodities, and **fictional** Kenya/Ghana demo organisations, offers and requests |
| `supabase/functions/extract-document/` | Edge Function: Claude reads an uploaded certificate and extracts fields + red flags |
| `web/` | React + Vite + Tailwind app (sign-in, onboarding, dashboards, matches, documents, risk report, finance, admin verification) |

### Scoring rules (all explainable, shown to users)

- **Match score (100):** grade 20 · quantity coverage 25 · price vs target 20 · Incoterm 10 · seller verification tier 15 · corridor 10 (intra-African flagged for AfCFTA).
- **Risk report (100):** verification tier 35 · approved key documents 20 · years trading 15 · completed OXL trades 15 · profile completeness 15. Bands A ≥ 75, B ≥ 55, C ≥ 35, D below.

Tested on Postgres 16: migrations + seed apply cleanly; users cannot self-verify, make themselves admin,
post listings for the wrong role, or read unshared reports/documents.

## Setup (run these yourself)

### 1. Create a new Supabase project
Use a **separate** project from Darasa. From Project Settings → API copy the Project URL, `anon` key and project ref.

### 2. Push the database
```bash
cd oxl-mvp
npx supabase init            # answer N to the prompts; keeps the existing migrations folder
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push         # applies the 3 migrations
```
Then load the demo data — Supabase dashboard → SQL Editor → paste `supabase/seed.sql` → Run.
Check it worked:
```sql
select role, country, count(*) from organisations group by 1,2 order by 1,2;
select org_name, score from match_request((select id from requests where org_id='a0000000-0000-0000-0000-000000000021'));
```
(The second query returns rows only in the SQL editor because it runs as `postgres`; in the app it runs as the signed-in user.)

### 3. Deploy the document-extraction function
```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-YOUR-KEY
# optional: npx supabase secrets set ANTHROPIC_MODEL=<the Claude model id you use in Darasa>
npx supabase functions deploy extract-document
```

### 4. Run the web app
```bash
cd web
cp .env.example .env.local   # paste your Project URL and anon key
npm install
npm run dev                  # http://localhost:5173
```

### 5. Make yourself the OXL admin
Sign up in the app first (Authentication → Providers → Email; turn off "Confirm email" while testing if you like), then in the SQL Editor:
```sql
insert into profiles (id, full_name, is_oxl_admin)
select id, 'OXL Admin', true from auth.users where email = 'YOUR-EMAIL'
on conflict (id) do update set is_oxl_admin = true;
```
Reload the app — a **Verification** tab appears.

### 6. Deploy
```bash
cd web && npm run build && npx vercel --prod
```
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project's environment variables.
`web/vercel.json` is included so deep links like `/report/…` work.

## Demo script (5 minutes)
1. Sign up as a Ghanaian cocoa exporter → onboarding → tier shows *Self-declared*.
2. Post 40 t Grade I cocoa, FOB, $7,900/t → **Find buyers** → *Nairobi Chocolate Works* ranks top with reasons.
3. Upload a registration certificate → AI fills company, number, dates, red flags.
4. As admin: approve the document, set tier to *Documents checked* → the exporter's risk score rises.
5. Exporter requests trade finance and shares the report with *Savannah Trade Finance Bank*.
6. Sign in as a financier account → sees the request and opens the shared report.

## Known limits (intended for the MVP)
- No payments, escrow or lending — referrals to licensed partners only.
- Either side can mark a deal "completed"; move this to admin confirmation before the pilot.
- Registry checks (Kenya BRS, Ghana ORC) are manual; the tier records the method used.
- Trade-rules assistant (AfCFTA Q&A) is the next module — reuse the Kenya MSME Advisor RAG pipeline.
- English only.
