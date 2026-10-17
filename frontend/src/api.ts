// One place for every backend call. Set VITE_USE_MOCK=false to hit the real
// FastAPI backend (proxied at /api); otherwise the app runs on mock data.
import { MOCK_HOUSEHOLDS, MOCK_RESULTS } from './mock/results'
import type { AuditRecord, BoxFolder, CheckResult, DecisionInput, HouseholdSummary, Me } from './types'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const BASE = '/api'

const MOCK_ME_KEY = 'fairhouse.mockRole'
const MOCK_STATE_KEY = 'fairhouse.mockState'
const checks = new Map<string, CheckResult>()

// Mock decisions and uploads live in sessionStorage so a refresh mid-demo keeps them.
interface MockState {
  decisions: Record<string, AuditRecord>
  uploads: Record<string, string[]>
}

function loadMock(): MockState {
  try {
    const raw = sessionStorage.getItem(MOCK_STATE_KEY)
    if (raw) return JSON.parse(raw) as MockState
  } catch {
    // storage unavailable or corrupt: start fresh
  }
  return { decisions: {}, uploads: {} }
}

const mock = loadMock()

function saveMock() {
  try {
    sessionStorage.setItem(MOCK_STATE_KEY, JSON.stringify(mock))
  } catch {
    // ignore
  }
}

function wait<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { credentials: 'include' })
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return res.json()
}

function readMockRole(): Me | null {
  try {
    const role = sessionStorage.getItem(MOCK_ME_KEY)
    if (role === 'analyst') return { name: 'Compliance reviewer', role }
    if (role === 'property_manager') return { name: 'Property manager', role, building: 'Juniper Court Apartments' }
  } catch {
    // storage unavailable: treat as signed out
  }
  return null
}

/** What the property manager still owes for a household. */
function mockMissing(h: HouseholdSummary): string[] {
  const d = mock.decisions[h.household_id]
  if (mock.uploads[h.household_id]?.length) return []
  if (d) return d.decision === 'request_info' ? d.requested_documents : []
  return h.missing_documents ?? []
}

export const api = {
  /** Full-page redirect into Box OAuth. In mock mode, signs in locally. */
  signIn(role: Me['role'] = 'analyst') {
    if (USE_MOCK) {
      try {
        sessionStorage.setItem(MOCK_ME_KEY, role)
      } catch {
        // ignore
      }
      return
    }
    window.location.href = `${BASE}/auth/box/login`
  },

  /** Backup sign-in when the backend runs with AUTH_MODE=demo. */
  demoSignInUrl(role: Me['role']) {
    return `${BASE}/auth/demo/login?role=${role}`
  },

  /** Mock mode only: forget demo decisions and uploads. */
  resetMock() {
    mock.decisions = {}
    mock.uploads = {}
    checks.clear()
    saveMock()
  },

  /** "mock", "box" or "demo" (the backend's fallback sign-in). */
  async authMode(): Promise<string> {
    if (USE_MOCK) return 'mock'
    try {
      return (await get<{ auth_mode: string }>('/health')).auth_mode
    } catch {
      return 'box'
    }
  },

  async signOut() {
    try {
      sessionStorage.removeItem(MOCK_ME_KEY)
    } catch {
      // ignore
    }
    checks.clear()
    if (!USE_MOCK) await post('/auth/logout').catch(() => undefined)
  },

  async me(): Promise<Me | null> {
    if (USE_MOCK) return wait(readMockRole(), 50)
    try {
      return await get<Me>('/me')
    } catch {
      return null
    }
  },

  async households(): Promise<HouseholdSummary[]> {
    if (USE_MOCK) {
      return wait(
        MOCK_HOUSEHOLDS.map((h) => {
          const d = mock.decisions[h.household_id]
          return {
            ...h,
            decided: d && { decision: d.decision, record_id: d.record_id },
            missing_documents: mockMissing(h),
            new_documents: mock.uploads[h.household_id] ?? [],
          }
        }),
      )
    }
    return get('/households')
  },

  async boxFolder(): Promise<BoxFolder | null> {
    if (USE_MOCK) return wait({ name: 'Juniper Court Apartments', synced_at: new Date().toISOString() }, 50)
    try {
      return await get<BoxFolder>('/box/folder')
    } catch {
      return null
    }
  },

  /** A finished check already in memory, so the review can skip the progress screen. */
  cachedCheck(householdId: string): CheckResult | undefined {
    return checks.get(householdId)
  },

  /** Runs the AI check. Results are cached so the decision screen reuses them.
   *  `quick` skips the mock's pipeline-length delay for screens that only need the data. */
  async check(householdId: string, { fresh = false, quick = false } = {}): Promise<CheckResult> {
    const cached = checks.get(householdId)
    if (cached && !fresh) return cached
    let result: CheckResult
    if (USE_MOCK) {
      const r = MOCK_RESULTS[householdId]
      if (!r) throw new Error('Household not found')
      // Long enough to show the pipeline stages, like a real Textract + Claude run.
      result = await wait(r, quick ? 300 : 5200)
      if (fresh && mock.uploads[householdId]) {
        delete mock.uploads[householdId]
        delete mock.decisions[householdId]
        saveMock()
      }
    } else {
      result = await post(`/households/${householdId}/check`)
    }
    checks.set(householdId, result)
    return result
  },

  /** URL the PDF viewer loads for a file. */
  fileUrl(fileId: string): string {
    if (USE_MOCK) return `/demo/${fileId}`
    return `${BASE}/files/${encodeURIComponent(fileId)}`
  },

  async decide(householdId: string, input: DecisionInput): Promise<AuditRecord> {
    if (USE_MOCK) {
      const r = MOCK_RESULTS[householdId]
      const now = new Date()
      const status = { approve: 'Approved', request_info: 'Waiting on documents', not_eligible: 'Not eligible' }[input.decision]
      const record: AuditRecord = {
        record_id: `FH-2026-${String(1517 + Object.keys(mock.decisions).length)}`,
        household_id: householdId,
        household_name: r.name,
        unit: r.unit,
        decision: input.decision,
        note: input.note,
        requested_documents: input.requested_documents ?? [],
        decided_by: 'Compliance reviewer',
        decided_at: now.toISOString(),
        ai_status: r.status,
        evidence: r.steps.flatMap((s) => (s.result === 'pass' ? [] : s.evidence)),
        box_path: `Reviews / Final decisions / ${r.building} · Unit ${r.unit} · signed decision ${now.toISOString().slice(0, 10)}.pdf`,
        ai_review_path: `Reviews / AI reviews / ${r.building} · Unit ${r.unit} · AI review ${now.toISOString().slice(0, 10)}.pdf`,
        locked: true,
        rules_version: r.rules_version,
        box_metadata: {
          Status: status,
          'Projected income': `$${r.projected_annual_income.toLocaleString('en-US')}`,
          'Income limit': `$${r.income_limit.toLocaleString('en-US')}`,
          'Reviewed by': 'Compliance reviewer',
          'Reviewed at': now.toLocaleDateString('en-US', { dateStyle: 'medium' }),
        },
      }
      mock.decisions[householdId] = record
      saveMock()
      return wait(record, 1200)
    }
    return post(`/households/${householdId}/decision`, input)
  },

  async record(householdId: string): Promise<AuditRecord | null> {
    if (USE_MOCK) return wait(mock.decisions[householdId] ?? null, 50)
    return get(`/households/${householdId}/record`)
  },

  /** Every signed decision, newest first. */
  async auditLog(): Promise<AuditRecord[]> {
    if (USE_MOCK) {
      return wait(Object.values(mock.decisions).sort((a, b) => b.decided_at.localeCompare(a.decided_at)), 150)
    }
    return get('/audit')
  },

  async upload(householdId: string, file: File): Promise<void> {
    if (USE_MOCK) {
      mock.uploads[householdId] = [...(mock.uploads[householdId] ?? []), file.name]
      saveMock()
      return wait(undefined, 1000)
    }
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/households/${householdId}/upload`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  },
}
