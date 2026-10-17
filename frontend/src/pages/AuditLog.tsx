import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { ArrowRightIcon, PenIcon } from '../components/Icons'
import { HomeHeader } from '../components/Shell'
import { ErrorState, Spinner, StatusBadge } from '../components/ui'
import type { AuditRecord } from '../types'

const DECISION = {
  approve: { label: 'Approved', cls: 'bg-evergreen-tint text-evergreen' },
  request_info: { label: 'Requested documents', cls: 'bg-warn-tint text-warn' },
  not_eligible: { label: 'Not eligible', cls: 'bg-fail-tint text-fail' },
}

export default function AuditLog() {
  const [records, setRecords] = useState<AuditRecord[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    api.auditLog().then(setRecords).catch(() => setError(true))
  }, [])

  useEffect(load, [load])

  return (
    <div className="min-h-screen">
      <HomeHeader />
      <main className="mx-auto max-w-[1120px] px-8 pt-6 pb-12">
        <h1 className="font-serif text-[40px] leading-tight font-semibold">Audit log</h1>
        <p className="mt-1.5 text-muted">Every signed decision: who decided, when, why, and what the AI suggested. Each record is also saved in Box.</p>

        {error && (
          <div className="mt-6">
            <ErrorState message="Couldn’t load the audit log." onRetry={load} />
          </div>
        )}
        {!records && !error && (
          <div className="mt-8">
            <Spinner label="Loading signed decisions…" />
          </div>
        )}
        {records?.length === 0 && (
          <div className="mt-6 rounded-[20px] bg-white px-6 py-10 text-center shadow-[0_0_0_1px_var(--color-line)]">
            <PenIcon size={22} className="mx-auto text-evergreen" />
            <p className="mt-2 font-semibold">No decisions signed yet</p>
            <p className="text-sm text-muted">When you sign a decision, it shows up here with the reason and the proof.</p>
            <Link to="/" className="mt-3 inline-block text-sm">
              Go to households
            </Link>
          </div>
        )}
        {records && records.length > 0 && (
          <ul className="mt-6 flex list-none flex-col gap-2.5 p-0">
            {records.map((r) => {
              const d = DECISION[r.decision]
              return (
                <li key={r.record_id}>
                  <Link
                    to={`/households/${r.household_id}/record`}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[20px] bg-white px-[22px] py-4 text-ink no-underline shadow-[0_2px_10px_rgba(24,36,31,.05)] hover:shadow-[0_0_0_1px_var(--color-line-strong)]"
                  >
                    <div className="w-[150px] text-[13px] text-muted">
                      {new Date(r.decided_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                      <div className="text-xs">{r.record_id}</div>
                    </div>
                    <div className="flex-[1_1_220px]">
                      <div className="font-semibold">
                        {r.household_name ?? r.household_id}
                        {r.unit && ` · Unit ${r.unit}`}
                      </div>
                      <div className="truncate text-sm text-muted" title={r.note}>
                        “{r.note}”
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="text-muted">AI</span>
                      <StatusBadge status={r.ai_status} />
                      <ArrowRightIcon size={14} className="text-faint" />
                      <span className="text-muted">{r.decided_by}</span>
                      <span className={`rounded-full px-3 py-1 font-semibold ${d.cls}`}>{d.label}</span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}
