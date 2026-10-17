# FairHouseAI frontend

React + Vite + TypeScript + Tailwind. PDF viewing and highlighting use react-pdf (PDF.js).

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

By default the app runs on **mock data** (`src/mock/results.ts`) and serves the demo PDFs from `public/demo/`.
To use the real backend (FastAPI on `:8000`, proxied at `/api`):

```bash
VITE_USE_MOCK=false npm run dev
```

`node scripts/check-quotes.mjs` verifies every mock quote can be found in its PDF.

## Screens

- `/signin`: Sign in with Box (mock mode also has "sign in as property manager")
- `/`: dashboard (analyst)
- `/households/:id`: review: document + highlighted proof, one finding at a time
- `/households/:id/decision`: approve / request info / not eligible, required reason, Box Sign
- `/households/:id/record`: signed audit record
- `/upload`: property manager upload for requested documents

## API the frontend expects (see `src/api.ts`, `src/types.ts`)

- `GET /auth/box/login`: redirect to Box OAuth
- `GET /me` → `{ name, role: "analyst" | "property_manager", building? }`
- `GET /households` → `HouseholdSummary[]`
- `POST /households/{id}/check` → `CheckResult`
- `GET /files/{file_id}` → PDF bytes
- `POST /households/{id}/decision` with `{ decision: "approve" | "request_info" | "not_eligible", note, requested_documents }` → `AuditRecord`
- `GET /households/{id}/record` → `AuditRecord`
- `POST /households/{id}/upload` (multipart `file`)
- `POST /auth/logout`: called on sign out
- `GET /health` → `{ auth_mode }`: when `"demo"`, the sign-in page shows backup links to `/auth/demo/login?role=...`
- `GET /audit` → `AuditRecord[]`, newest first (Audit log page)
- `GET /box/folder` → `{ name, url?, synced_at }` (optional; the dashboard's "Connected to Box" strip, and "Open in Box" when `url` is set)

Additions to the original result format, all optional:
- `step.headline`: a one-line, plain-language headline for the finding
- `step.result_label`, e.g. `"Over limit"`
- `CheckResult.documents`: the files the reviewer can open, as `[{ file_id, file_name, label }]`. Never includes the demographic form.
- `HouseholdSummary.summary`, `projected_annual_income`, `income_limit`, `missing_documents`, `decided`
- `HouseholdSummary.files`: `[{ file_name, label, excluded? }]`, the files in the household's Box folder (demographic form marked `excluded`)
- `HouseholdSummary.new_documents`: file names uploaded since the last check. The dashboard shows "New documents" and a "Run check" button.
- `HouseholdSummary.missing_documents` should list the documents requested by a "request more information" decision, so the property manager sees them
- `AuditRecord.audit_url`: link to the signed record in Box ("Open in Box")
- `AuditRecord.box_metadata`: the `fairhouseReview` labels applied to the household folder, e.g. `{ "Status": "Approved", "Projected income": "$49,920", ... }`
- `AuditRecord.household_name`, `unit`: shown in the audit log
- `AuditRecord.box_path`: the signed decision in `Reviews / Final decisions /` (locked folder)
- `AuditRecord.ai_review_path`: the AI's findings report in `Reviews / AI reviews /`
- `AuditRecord.locked`: true once signed (shows "Locked"); `record_sha256`: optional checksum of the signed record, shown as a fingerprint

The decision endpoint should save two files: the AI review report to `Reviews / AI reviews /` and the signed decision to `Reviews / Final decisions /`, then lock the signed file (Box retention policy if the account allows it, otherwise file lock and read-only access). It applies the `fairhouseReview` metadata to the household folder and never modifies the tenant's original documents. Corrections add a new record; signed records are never edited.

Mock mode keeps decisions and uploads in sessionStorage. Use "Reset demo data" on the sign-in page before a demo.

Every `evidence.quote` must be an exact substring of the PDF text (whitespace is normalized), or the highlight won't appear.
