import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { PenIcon } from '../components/Icons'
import { FlowHeader } from '../components/Shell'
import { ErrorState, money, PrimaryButton, ProgressPills, RESULT, Spinner, StatusBadge } from '../components/ui'
import type { CheckResult, DecisionKind } from '../types'
import { visitedKey } from './Review'

/** Documents to suggest requesting, based on which checks need attention. */
function suggestedRequests(r: CheckResult): string[] {
  const out: string[] = []
  const by = (id: string) => r.steps.find((s) => s.id === id)
  if (by('documents')?.result === 'fail') out.push(by('documents')!.headline?.replace(' is missing', '') ?? 'Missing documents')
  if (by('deposits') && by('deposits')!.result !== 'pass') out.push('Deposit Explanation Form for undeclared deposits')
  if (by('wages') && by('wages')!.result !== 'pass') out.push('Employer verification of hourly rate')
  return out
}

/** One-click starting points for the reason; the reviewer can edit them. */
const REASONS: Record<DecisionKind, string> = {
  approve: 'Income verified against pay stubs and bank deposits, and it is under the limit for this unit.',
  request_info: 'The file is missing documents needed to finish the income review.',
  not_eligible: 'Verified income is over the limit for this unit and household size.',
}

const MIN_REASON = 10

export default function Decision() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState<CheckResult | null>(null)
  const [decision, setDecision] = useState<DecisionKind | null>(null)
  const [requested, setRequested] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState(false)

  const load = useCallback(() => {
    setLoadError(false)
    api
      .check(id, { quick: true })
      .then((r) => {
        setResult(r)
        setRequested(suggestedRequests(r))
      })
      .catch(() => setLoadError(true))
  }, [id])

  useEffect(load, [load])

  const suggestions = useMemo(() => (result ? suggestedRequests(result) : []), [result])
  const reviewed = useMemo(() => {
    try {
      return Number(sessionStorage.getItem(visitedKey(id)) ?? 0)
    } catch {
      return 0
    }
  }, [id])

  if (loadError)
    return (
      <div className="grid min-h-screen place-items-center px-8">
        <ErrorState message="Couldn’t load this review." onRetry={load} />
      </div>
    )
  if (!result)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Loading the review…" />
      </div>
    )

  const todo = [
    decision === null && 'choose a decision',
    decision === 'request_info' && requested.length === 0 && 'pick at least one document to request',
    note.trim().length < MIN_REASON && (note.trim() ? 'add a few more words to the reason' : 'add a reason (or tap a suggestion)'),
  ].filter(Boolean) as string[]
  const canSign = todo.length === 0
  const chips = [
    ...(decision ? [REASONS[decision]] : []),
    ...result.steps.filter((s) => s.result !== 'pass' && s.headline).map((s) => `${s.headline}.`),
  ]

  async function sign() {
    if (!decision) return
    setSigning(true)
    setError('')
    try {
      await api.decide(id, { decision, note: note.trim(), requested_documents: decision === 'request_info' ? requested : [] })
      navigate(`/households/${id}/record`)
    } catch {
      setError('Signing didn’t go through. Nothing was saved. Please try again.')
      setSigning(false)
    }
  }

  const options: { value: DecisionKind; title: string; body: string }[] = [
    { value: 'approve', title: 'Approve: household qualifies', body: 'Income is within the limit for this unit.' },
    { value: 'request_info', title: 'Request more information', body: 'The property manager sees exactly what’s needed on their upload page.' },
    { value: 'not_eligible', title: 'Not eligible', body: 'Income is over the limit. The household can appeal.' },
  ]

  return (
    <div className="min-h-screen">
      <FlowHeader
        crumbs={[{ label: 'Households', to: '/' }, { label: result.building.replace(' Apartments', ''), to: '/' }, { label: `Unit ${result.unit}` }]}
        right={<ProgressPills current={2} />}
      />
      <main className="mx-auto max-w-[1180px] px-8 pt-4 pb-12">
        <h1 className="font-serif text-[34px] leading-tight font-semibold">Your decision for {result.name}</h1>
        <p className="mt-1.5 text-muted">
          {reviewed >= result.steps.length
            ? `You reviewed all ${result.steps.length} findings.`
            : `You viewed ${reviewed} of ${result.steps.length} findings.`}{' '}
          The AI suggestion is shown for reference only.
        </p>

        <div className="mt-7 flex flex-wrap items-start gap-7">
          <section aria-label="Summary" className="flex max-w-[400px] flex-[1_1_340px] flex-col gap-3.5">
            <div className="rounded-2xl bg-white p-5 shadow-[0_0_0_1px_var(--color-line)]">
              <div className="text-[13px] text-muted">AI suggested</div>
              <StatusBadge status={result.status} className="mt-1.5" />
              <p className="mt-3 text-sm">
                <strong>{money(result.projected_annual_income)}</strong> projected vs. <strong>{money(result.income_limit)}</strong> limit
              </p>
            </div>
            <ol className="m-0 list-none rounded-2xl bg-white p-1.5 text-sm shadow-[0_0_0_1px_var(--color-line)]">
              {result.steps.map((s) => (
                <li key={s.id} className="flex gap-2.5 px-2.5 py-2">
                  <span className={`w-4 text-center ${RESULT[s.result].text}`} aria-hidden="true">
                    {RESULT[s.result].mark}
                  </span>
                  {s.title}
                  <span className={`ml-auto text-xs ${RESULT[s.result].text}`}>{s.result_label ?? RESULT[s.result].label}</span>
                </li>
              ))}
            </ol>
            <Link to={`/households/${id}`} className="text-sm">
              ← Back to findings
            </Link>
          </section>

          <form
            aria-label="Decision"
            onSubmit={(e) => {
              e.preventDefault()
              void sign()
            }}
            className="flex min-w-0 flex-[999_1_520px] flex-col gap-5 rounded-[20px] bg-white p-7 shadow-[0_0_0_1px_var(--color-line),0_10px_30px_rgba(24,36,31,.05)]"
          >
            <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
              <legend className="mb-2.5 text-base font-semibold">What do you decide?</legend>
              {options.map((o) => {
                const checked = decision === o.value
                return (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-[14px] px-4 py-3.5 ${
                      checked ? 'bg-evergreen-wash shadow-[0_0_0_2px_var(--color-evergreen)]' : 'shadow-[0_0_0_1px_var(--color-line)] hover:bg-mist'
                    }`}
                  >
                    <input
                      type="radio"
                      name="decision"
                      value={o.value}
                      checked={checked}
                      onChange={() => setDecision(o.value)}
                      className="mt-1 h-[18px] w-[18px] accent-evergreen"
                    />
                    <span className="flex-1">
                      <span className="block font-semibold">{o.title}</span>
                      <span className="text-sm text-muted">{o.body}</span>
                      {o.value === 'request_info' && checked && (
                        <span className="mt-3 flex flex-col gap-2 text-sm">
                          {suggestions.length === 0 && <span className="text-muted">No documents suggested. Describe what you need in the reason.</span>}
                          {suggestions.map((s) => (
                            <span key={s} className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                aria-label={s}
                                checked={requested.includes(s)}
                                onChange={(e) => setRequested((r) => (e.target.checked ? [...r, s] : r.filter((x) => x !== s)))}
                                className="h-4 w-4 accent-evergreen"
                              />
                              {s}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </fieldset>

            <div>
              <label htmlFor="reason" className="mb-1.5 block font-semibold">
                Reason <span className="font-normal text-muted">(required, saved to the record)</span>
              </label>
              <textarea
                id="reason"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="In plain words, why you made this decision."
                className="w-full resize-y rounded-xl border border-line-strong px-3.5 py-3 text-[15px] text-ink"
              />
              {chips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested reasons">
                  {chips.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNote((n) => (n.includes(c) ? n : n.trim() ? `${n.trim()} ${c}` : c))}
                      className="cursor-pointer rounded-full bg-evergreen-wash px-3 py-1 text-left text-[13px] text-evergreen shadow-[0_0_0_1px_var(--color-evergreen-tint)] hover:bg-evergreen-tint"
                    >
                      + {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p role="alert" className="text-sm text-fail">{error}</p>}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
              <PrimaryButton type="submit" disabled={!canSign || signing}>
                <PenIcon />
                {signing ? 'Signing and saving to Box…' : 'Sign decision'}
              </PrimaryButton>
              <span className={`text-[13px] ${canSign ? 'text-muted' : 'text-warn'}`} aria-live="polite">
                {canSign ? 'Your name, the time and every finding are saved to Box.' : `To sign: ${todo.join(', ')}.`}
              </span>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
