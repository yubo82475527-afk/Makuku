# Makuku Competitive Intelligence MVP

Internal operations dashboard for Makuku Indonesia competitor SKU, price, promotion, offline OCR, alert, and AI response workflows.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- Supabase Postgres, Auth, Storage
- Supabase SQL migrations and seed data
- OpenAI-compatible Chat Completions server route, with deterministic mock fallback
- Vercel deployment ready

## Local Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Without Supabase env vars, pages render demo data so the MVP can be reviewed immediately. Write operations require Supabase configuration.

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=gpt-4o
AI_MAX_TOKENS=1800
OPENAI_API_KEY=
```

Frontend/server-rendered reads use the anon key. Mutating API routes use `SUPABASE_SERVICE_ROLE_KEY` on the server only. Do not expose the service role key to browser code.
AI routes use OpenAI-compatible `/chat/completions`. Set `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, and optionally `AI_MAX_TOKENS` for a custom provider. `OPENAI_API_KEY` remains supported as a legacy fallback key when `AI_API_KEY` is absent.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/202605260001_initial_schema.sql` in Supabase SQL editor or through Supabase CLI.
3. Run `supabase/seed.sql` to load Makuku, 5 competitor brands, SKU master, competitor products, price snapshots, promo events, AI recommendations, and alert rules.
4. Confirm the `offline-uploads` Storage bucket exists. The migration creates it and basic authenticated Storage policies.
5. Enable Supabase Auth for your internal users. RLS policies allow authenticated users to read, insert, and update business tables.

## Key Routes

- `/dashboard`: daily KPIs, promo event flow, high-risk AI suggestions
- `/sku-master`: Makuku standard SKU list and creation form
- `/competitors`: competitor product list, filters, SKU match fields
- `/prices`: daily competitor price snapshots with floor/target highlighting
- `/offline-uploads`: store photo upload, mock OCR result review, event creation
- `/promo-events`: event stream with severity/channel/brand/city filters
- `/promo-events/[id]`: event detail and AI recommendation generation
- `/alerts`: alert list and mark-read action

## Business Logic

Core functions live in `src/lib/business.ts`:

- `normalizePriceSnapshot`
- `detectPromoEvent`
- `calculatePriceGapVsMakuku`
- `generateAIStrategy`
- `mockOcrFromUpload`
- `shouldCreateAlertFromPromoEvent`

Price normalization is also enforced in Postgres by the `normalize_price_snapshot` trigger.

## API Routes

- `POST /api/sku-master`
- `POST /api/competitors`
- `POST /api/price-snapshots`
- `POST /api/offline-uploads`
- `POST /api/offline-uploads/[id]/confirm`
- `POST /api/promo-events/[id]/ai-strategy`
- `PATCH /api/ai-recommendations/[id]`
- `PATCH /api/alerts/[id]`

AI routes use `AI_API_KEY`/`AI_MODEL` when present. Strategy and single-image analysis fall back to mock JSON when absent or on provider error; store-level visit analysis records a failed analysis status so field users can retry.

## Deploy To Vercel

1. Push this repository to GitHub.
2. Import it in Vercel as a Next.js project.
3. Add all environment variables in Vercel Project Settings.
4. Deploy.
5. In Supabase, add the Vercel domain to Auth URL allowlists if you add login screens in the next phase.

## Verification

```bash
npm run lint
npm run build
```

Both commands pass in the current workspace.
