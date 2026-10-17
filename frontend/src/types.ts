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
  /** Set once an analyst has signed a decision. */
  decided?: Pick<AuditRecord, 'decision' | 'record_id'>
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
  audit_url?: string
  box_path: string
  rules_version: string
}
