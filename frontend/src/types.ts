// Shared shapes between the frontend and the backend.
// Keep in sync with the API contract agreed with the team.

export type Status = 'QUALIFIES' | 'NOT_QUALIFIED' | 'MISSING_INFO' | 'NEEDS_REVIEW'
export type StepResult = 'pass' | 'warn' | 'fail'
export type Role = 'analyst' | 'property_manager'

export interface Me {
  name: string
  role: Role
  building?: string
}

export interface Evidence {
  file_id: string
  file_name: string
  page: number
  /** Must be an exact substring of the PDF text so it can be highlighted. */
  quote: string
}

export interface Step {
  id: string
  title: string
  /** Optional one-line plain-language headline for the guided view. */
  headline?: string
  detail: string
  amount?: number
  result: StepResult
  /** Optional override for the result label, e.g. "Over limit". */
  result_label?: string
  evidence: Evidence[]
}

export interface DocumentRef {
  file_id: string
  file_name: string
  label: string
}

export interface CheckResult {
  household_id: string
  name: string
  building: string
  unit: string
  household_size: number
  unit_ami_pct: number
  income_limit: number
  projected_annual_income: number
  status: Status
  summary: string
  steps: Step[]
  /** Documents the reviewer can open (demographic form is never included). */
  documents?: DocumentRef[]
  excluded_documents: { file_name: string; reason: string }[]
  rules_version: string
  /** "agent" when the automatic AI review produced this result, "demo" for the precomputed answer key. */
  source?: 'agent' | 'demo'
  /** When the agent finished this review. */
  reviewed_at?: string
}

export interface HouseholdSummary {
  household_id: string
  name: string
  building: string
  unit: string
  status: Status | null
  summary?: string
  projected_annual_income?: number
  income_limit?: number
  missing_documents?: string[]
  /** Files in the household's Box folder, including excluded ones. */
  files?: { file_name: string; label: string; excluded?: boolean }[]
  /** Files uploaded since the last check; the household needs a fresh check. */
  new_documents?: string[]
  /** Set once an analyst has signed a decision. */
  decided?: Pick<AuditRecord, 'decision' | 'record_id'>
  /** Where the automatic AI review (Box upload -> agent) stands. */
  ai_review?: AiReview | null
}

export interface AiReview {
  state: 'reviewing' | 'ready' | 'stale' | 'none'
  reviewed_at?: string
  since?: string
}

/** The Box folder the dashboard reads from. */
export interface BoxFolder {
  name: string
  url?: string
  synced_at: string
}

export type DecisionKind = 'approve' | 'request_info' | 'not_eligible'

export interface DecisionInput {
  decision: DecisionKind
  note: string
  requested_documents?: string[]
}

export interface AuditRecord {
  record_id: string
  household_id: string
  decision: DecisionKind
  note: string
  requested_documents: string[]
  decided_by: string
  decided_at: string
  ai_status: Status
  evidence: Evidence[]
  /** Link to the signed record in Box, when the backend has one. */
  audit_url?: string
  /** Signed decision, in the locked `Reviews / Final decisions` folder. */
  box_path: string
  /** The AI's findings report, in `Reviews / AI reviews`. */
  ai_review_path?: string
  /** True once signed: the record can't be edited; corrections add a new record. */
  locked?: boolean
  /** Checksum of the signed record, when the backend computes one. */
  record_sha256?: string
  rules_version: string
  /** Labels applied to the household's Box folder (fairhouseReview template). */
  box_metadata?: Record<string, string>
  /** Shown in the audit log. */
  household_name?: string
  unit?: string
}
