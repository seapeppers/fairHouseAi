// One place for every backend call. Set VITE_USE_MOCK=false to hit the real
// FastAPI backend (proxied at /api); otherwise the app runs on mock data.
import { MOCK_HOUSEHOLDS, MOCK_RESULTS } from './mock/results'
import type { AuditRecord, CheckResult, DecisionInput, HouseholdSummary, Me } from './types'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const BASE = '/api'

const MOCK_ME_KEY = 'fairhouse.mockRole'
const decisions = new Map<string, AuditRecord>()
const checks = new Map<string, CheckResult>()

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
    if (role === 'analyst') return { name: 'Compliance analyst', role }
    if (role === 'property_manager') return { name: 'Property manager', role, building: 'Juniper Court Apartments' }
  } catch {
    // storage unavailable: treat as signed out
  }
  return null
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

  signOut() {
    try {
      sessionStorage.removeItem(MOCK_ME_KEY)
    } catch {
      // ignore
    }
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
        MOCK_HOUSEHOLDS.map((h) => ({ ...h, decided: decisions.get(h.household_id) })),
      )
    }
    return get('/households')
  },

  /** Runs the AI check. Results are cached so the decision screen reuses them. */
  async check(householdId: string, { fresh = false } = {}): Promise<CheckResult> {
    const cached = checks.get(householdId)
    if (cached && !fresh) return cached
    let result: CheckResult
    if (USE_MOCK) {
      const r = MOCK_RESULTS[householdId]
      if (!r) throw new Error('Household not found')
      result = await wait(r, 1400)
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
      const record: AuditRecord = {
        record_id: `FH-2026-${String(1000 + decisions.size + 517).slice(-4)}`,
        household_id: householdId,
        decision: input.decision,
        note: input.note,
        requested_documents: input.requested_documents ?? [],
        decided_by: 'Compliance analyst, Seattle Office of Housing',
        decided_at: new Date().toISOString(),
        ai_status: r.status,
        evidence: r.steps.flatMap((s) => (s.result === 'pass' ? [] : s.evidence)),
        box_path: `Seattle Office of Housing / ${r.building} / Unit ${r.unit} / fairhouse_record_${new Date().toISOString().slice(0, 10)}.pdf`,
        rules_version: r.rules_version,
      }
      decisions.set(householdId, record)
      return wait(record, 1200)
    }
    return post(`/households/${householdId}/decision`, input)
  },

  async record(householdId: string): Promise<AuditRecord | null> {
    if (USE_MOCK) return wait(decisions.get(householdId) ?? null, 50)
    return get(`/households/${householdId}/record`)
  },

  async upload(householdId: string, file: File): Promise<void> {
    if (USE_MOCK) {
      void file
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
