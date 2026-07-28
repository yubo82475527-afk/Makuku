# Makuku Usage Assistant Guide (English)

## B1 Product scope

Makuku 1.0 focuses on price intelligence only: field capture → AI recognition → price review → real prices → price index / reports.

Out of scope: distribution, display, shelf OSA, stockout/visibility analytics; and live business metric lookups (counts/amounts).

Placeholder (not production facts): Perfect Store 2.0, Goal Execution 2.0.

Timezone Asia/Jakarta, currency IDR.

## B2 Price flow

1. Maintain master data (own SKUs, competitor SKUs, stores) plus benchmarking/match rules  
2. Field agents pick a store on mobile, upload price-tag/shelf photos, submit  
3. AI analyzes; Store Visit Records shows status and quality  
4. Risky/exception candidates go to Price Review; approvals become Real Prices  
5. Price Index and Report Center use confirmed price facts  

If index/real prices look empty: check visit analysis first, then Price Review backlog.

## B3 Role tasks

- Ops: master data & matching, visit monitor, price review, admin  
- Regional managers: price index, real prices, visit records, report subscriptions  
- Analysts: real-price export, index validation, visit quality metrics  

Sidebar follows page permissions; data scope may be all or by organization.

## B4 Module cards

### Price Index `/dashboard`

- Purpose: weekly own vs competitor price coefficients  
- Audience: regional managers, analysts  
- Filters: month, org, own series/pack, competitor pack; configurable expand dimensions  
- Actions: export  
- Outcome: management view; drill to Real Prices when suspicious  
- Pitfalls: wrong filters, bad benchmark mapping, review backlog  

### Real Prices `/prices`

- Purpose: confirmed price snapshot details  
- Audience: analysts, regional, ops  
- Filters: ownership/brand/series/size/date; region/store/SKU/visit code/org  
- Actions: export; bulk delete for test cleanup only  
- Outcome: feeds index and analysis  
- Pitfalls: data scope, over-filtering, accidental deletes  

### Store Visit Records `/store-visit-monitor`

- Purpose: monitor uploads, AI status, latency, parse quality  
- Audience: ops, regional  
- Views: by visit / promoter / store  
- Actions: detail, export; admins may rerun matching  
- Outcome: retake or price review follow-up  
- Pitfalls: action_required/failed backlog, missing rerun permission  

### Price Review `/offline-price-candidates`

- Purpose: human confirm AI price candidates  
- Audience: ops  
- Tabs: pending / done; filter date, visit code, reason  
- Actions: confirm, edit pack price & pcs, rematch, mark wrong; export/import unmatched  
- Outcome: approved rows become real prices  
- Pitfalls: unclear reasons, missing master data, editing without re-validate  

### Competitor Benchmarking `/competitor-mappings`

- Purpose: competitor series → Makuku series and default benchmarks  
- Audience: ops  
- Actions: save/apply, delete, set/clear benchmark  
- Pitfalls: wrong mapping breaks index comparison  

### Product Match Rules `/product-match-normalizations`

- Purpose: raw text → normalized brand/series/size/pcs  
- Audience: ops  
- Actions: add/edit/delete (history kept)  
- Pitfalls: normalized value not in active master; repeating manual fixes  

### Own Products `/sku-master`

- Purpose: material import and segment grade  
- Audience: ops  
- Actions: Excel/CSV import, inline grade save  
- Pitfalls: wrong column order, missing grades  

### Competitor Products `/competitor-products`

- Purpose: competitor SKU master  
- Audience: ops  
- Actions: filter, export, import, drawer edit  
- Pitfalls: locked code, dirty brand/series rows  

### Stores `/offline-stores`

- Purpose: store lookup, org assignment, enable/disable  
- Audience: ops  
- Actions: batch org change, enable/disable; disabled stores hidden on mobile  
- Pitfalls: unassigned org, data-scope limits  

### Report Center `/report-center`

- Purpose: subscriptions and delivery history  
- Audience: ops / regional / analysts  
- Enabled now: Daily Price Country report  
- Actions: subscribe, preview, regenerate/resend  
- Pitfalls: disabled report definitions are unavailable  

### System admin

- Organizations `/organizations`: region rules and user links  
- Users `/users`: accounts, roles, status, password reset, Feishu Open ID  
- Roles `/roles`: page permissions and data scope  
- Usage Assistant KB `/usage-assistant-knowledge`: view/maintain assistant knowledge (admin)  

### Placeholders

Perfect Store 2.0 and Goal Execution 2.0 are mock pages — not production facts.

## B5 Master data & matching

When matching fails: fix competitor/own masters → add normalization rules → rerun matching if needed → review prices again. Benchmark mapping affects Price Index comparisons.

## B6 Mobile capture

Pick org/store → upload photos (own shelf / competitor shelf / storefront) → submit. Shoot face-on, close, small area, clear digits; avoid angled whole-shelf shots. Follow up on PC in Store Visit Records and Price Review.

## B7 Permissions & data scope

Missing menu: check role page permissions. Missing orgs/stores/prices: check organization data scope and store org assignment.

## B8 FAQ

- Q: Visit done but no real price? A: Check analysis status, then Price Review backlog.  
- Q: What does a review reason mean? A: Use Price Review filter labels (facts layer).  
- Q: Does Perfect Store have real data? A: Placeholder only.  
- Q: Only country daily report? A: That is the currently enabled report.  
- Q: How many pending reviews today? A: Assistant does not query counts; open Price Review or contact IT.  

## B9 Assistant boundaries

Answers how to use the system only. No live metrics, no price edits, no proxy approvals. If knowledge is missing, asks you to contact IT to add it.
