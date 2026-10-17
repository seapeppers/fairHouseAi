import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { CheckIcon, FolderIcon, LockIcon } from '../components/Icons'
import { FlowHeader } from '../components/Shell'
import { BoxMark, money, ProgressPills, Spinner } from '../components/ui'
import type { AuditRecord, CheckResult } from '../types'

const DECISION_TEXT = {
  approve: 'Approved: household qualifies',
  request_info: 'Request more information',
  not_eligible: 'Not eligible',
}
const STATUS_TEXT = { QUALIFIES: 'Qualifies', NOT_QUALIFIED: 'Not qualified', MISSING_INFO: 'Missing info', NEEDS_REVIEW: 'Needs review' }

export default function Record() {
  const { id = '' } = useParams()
  const [record, setRecord] = useState<AuditRecord | null | undefined>(undefined)
  const [result, setResult] = useState<CheckResult | null>(null)

  useEffect(() => {
    api.record(id).then(setRecord)
    api.check(id, { quick: true }).then(setResult)
  }, [id])

  if (record === null) return <Navigate to={`/households/${id}`} replace />
  if (!record || !result)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading the record…" />
      </div>
    )

  const when = new Date(record.decided_at).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Los_Angeles',
  })
  const subtitle =
    record.decision === 'request_info'
      ? `The property manager sees ${record.requested_documents.length} requested document${record.requested_documents.length === 1 ? '' : 's'} on their upload page. This household now shows “Waiting on documents”.`
      : 'The household’s folder in Box now includes this signed record.'
  const labels = record.box_metadata ?? {
    Status: DECISION_TEXT[record.decision],
    'Projected income': money(result.projected_annual_income),
    'Income limit': money(result.income_limit),
    'Reviewed by': record.decided_by,
    'Reviewed at': new Date(record.decided_at).toLocaleDateString('en-US', { dateStyle: 'medium' }),
  }

  const rows: [string, React.ReactNode][] = [
    ['Decision', <strong className="font-semibold">{DECISION_TEXT[record.decision]}</strong>],
    ['Decided by', `${record.decided_by} · signed with Box Sign`],
    ['AI suggestion', <>{STATUS_TEXT[record.ai_status]} <span className="text-muted">(for reference; not the decision)</span></>],
    ['Reason', record.note],
    ...(record.requested_documents.length ? ([['Requested', record.requested_documents.join(' · ')]] as [string, React.ReactNode][]) : []),
    [
      'Evidence cited',
      record.evidence.length ? (
        <span className="flex flex-wrap gap-1.5">
          {record.evidence.map((e, i) => (
            <span key={i} className="rounded-md bg-marker-wash px-2 py-0.5 text-[13px]">
              {e.file_name.replace('.pdf', '')} p.{e.page} · “{e.quote}”
            </span>
          ))}
        </span>
      ) : (
        'All checks passed'
      ),
    ],
    ['Excluded', result.excluded_documents.map((d) => `${d.file_name}, never used`).join('; ')],
    ['Rules version', record.rules_version],
  ]

  return (
    <div className="min-h-screen">
      <FlowHeader
        crumbs={[{ label: 'Households', to: '/' }, { label: result.building.replace(' Apartments', ''), to: '/' }, { label: `Unit ${result.unit}` }]}
        right={<ProgressPills current={3} />}
      />
      <main className="mx-auto max-w-[880px] px-8 pt-6 pb-12">
        <div role="status" className="flex items-center gap-4">
          <span className="grid h-[52px] w-[52px] flex-none place-items-center rounded-full bg-evergreen text-marker">
            <CheckIcon size={26} />
          </span>
          <div>
            <h1 className="font-serif text-[32px] leading-tight font-semibold">Decision signed and saved to Box</h1>
            <p className="mt-1 text-muted">{subtitle}</p>
          </div>
        </div>

        <article aria-label="Audit record" className="mt-7 overflow-hidden rounded-[20px] bg-white shadow-[0_0_0_1px_var(--color-line),0_10px_30px_rgba(24,36,31,.05)]">
          <div className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-b border-mist-deep px-7 py-[22px]">
            <div>
              <div className="text-[13px] text-muted">Audit record</div>
              <div className="font-serif text-[22px] font-semibold">
                {result.name} · Unit {result.unit} · {result.building}
              </div>
            </div>
            <div className="text-right text-[13px] text-muted">
              Record {record.record_id}
              <br />
              {when} PT
            </div>
          </div>
          <dl className="m-0 grid grid-cols-[200px_minmax(0,1fr)] px-7 py-2 max-sm:grid-cols-1">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="border-b border-mist py-3 text-muted max-sm:border-0 max-sm:pb-0">{k}</dt>
                <dd className="m-0 border-b border-mist py-3">{v}</dd>
              </div>
            ))}
          </dl>
        </article>

        <section aria-label="Saved to Box" className="mt-5 rounded-[20px] bg-white px-7 py-5 shadow-[0_0_0_1px_var(--color-line)]">
          <div className="flex flex-wrap items-center gap-3">
            <BoxMark size={26} />
            <h2 className="text-lg font-semibold">What changed in Box</h2>
            {record.audit_url && (
              <a href={record.audit_url} target="_blank" rel="noreferrer" className="ml-auto text-sm font-medium">
                Open in Box ↗
              </a>
            )}
          </div>
          <ul className="mt-3 flex list-none flex-col gap-3 p-0 text-sm">
            <li className="flex items-start gap-2.5">
              <FolderIcon className="mt-0.5 flex-none text-evergreen" />
              <span>
                <strong className="font-semibold">Signed record added</strong>
                <span className="block text-muted">{record.box_path}</span>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckIcon className="mt-0.5 flex-none text-evergreen" />
              <span className="min-w-0">
                <strong className="font-semibold">Folder labels updated</strong>
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(labels).map(([k, v]) => (
                    <span key={k} className="rounded-md bg-evergreen-wash px-2 py-0.5 text-[13px] shadow-[0_0_0_1px_var(--color-evergreen-tint)]">
                      <span className="text-muted">{k}:</span> {v}
                    </span>
                  ))}
                </span>
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <LockIcon className="mt-0.5 flex-none text-evergreen" />
              <span>
                <strong className="font-semibold">Tenant documents unchanged</strong>
                <span className="block text-muted">The original files are kept exactly as uploaded, as evidence.</span>
              </span>
            </li>
          </ul>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/"
            className="inline-flex min-h-[50px] items-center rounded-xl bg-evergreen px-6 font-semibold text-white no-underline hover:bg-evergreen-dark"
          >
            Back to households →
          </Link>
        </div>
      </main>
    </div>
  )
}
