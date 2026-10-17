# FairHouse frontend

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

Additions to the original result format, all optional:
- `step.headline`: a one-line, plain-language headline for the finding
- `step.result_label`, e.g. `"Over limit"`
- `CheckResult.documents`: the files the reviewer can open, as `[{ file_id, file_name, label }]`. Never includes the demographic form.
- `HouseholdSummary.summary`, `projected_annual_income`, `income_limit`, `missing_documents`, `decided`

Every `evidence.quote` must be an exact substring of the PDF text (whitespace is normalized), or the highlight won't appear.
