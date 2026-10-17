import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { CheckProgress } from '../components/CheckProgress'
import { PdfViewer, type Highlight } from '../components/PdfViewer'
import { FlowHeader } from '../components/Shell'
import { ErrorState, money, PrimaryButton, ProgressPills, RESULT, SecondaryButton, StatusBadge } from '../components/ui'
import type { CheckResult, DocumentRef, Evidence } from '../types'

export const visitedKey = (id: string) => `fairhouse.visited.${id}`

export default function Review() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const fresh = params.get('fresh') === '1'
  const navigate = useNavigate()
  const [result, setResult] = useState<CheckResult | null>(null)
  // Show the pipeline stages unless this check already ran in this session.
  const [showProgress, setShowProgress] = useState(() => fresh || !api.cachedCheck(id))
  const [error, setError] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [evIdx, setEvIdx] = useState(0)
  // Free browsing of any document; null means "follow the current evidence".
  const [browse, setBrowse] = useState<{ file_id: string; page: number } | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [visited, setVisited] = useState<Set<number>>(new Set([0]))

  const runCheck = useCallback(
    (opts: { fresh?: boolean } = {}) => {
      setError(false)
      setResult(null)
      api
        .check(id, opts)
        .then((r) => {
          setResult(r)
          // Open on the first finding that needs attention, if any.
          const first = r.steps.findIndex((s) => s.result !== 'pass')
          const start = first >= 0 ? first : 0
          setStepIdx(start)
          setVisited(new Set([start]))
        })
        .catch(() => setError(true))
    },
    [id],
  )

  useEffect(() => runCheck({ fresh }), [runCheck, fresh])

  useEffect(() => {
    try {
      sessionStorage.setItem(visitedKey(id), String(visited.size))
    } catch {
      // ignore
    }
  }, [id, visited])

  const step = result?.steps[stepIdx]
  const evidence: Evidence | undefined = step?.evidence[evIdx]
  const view = browse ?? (evidence ? { file_id: evidence.file_id, page: evidence.page } : null)

  const viewFile = view?.file_id
  const viewPage = view?.page
  const highlights: Highlight[] = useMemo(() => {
    if (!step || !viewFile) return []
    return step.evidence
      .filter((e) => e.file_id === viewFile && e.page === viewPage)
      .map((e) => ({ quote: e.quote, primary: e === evidence }))
  }, [step, viewFile, viewPage, evidence])

  const goTo = useCallback((i: number) => {
    setStepIdx(i)
    setEvIdx(0)
    setBrowse(null)
    setVisited((v) => new Set(v).add(i))
  }, [])

  // Left/right arrow keys step through findings, unless the user is typing.
  const stepCount = result?.steps.length ?? 0
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select')) return
      if (e.key === 'ArrowRight' && stepIdx < stepCount - 1) goTo(stepIdx + 1)
      else if (e.key === 'ArrowLeft' && stepIdx > 0) goTo(stepIdx - 1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepIdx, stepCount, goTo])

  if (error)
    return (
      <Centered>
        <ErrorState message="This household couldn’t be checked. Nothing was saved." onRetry={() => runCheck({ fresh: true })}>
          <Link to="/" className="text-sm">
            Back to households
          </Link>
        </ErrorState>
      </Centered>
    )
  if (showProgress)
    return (
      <Centered>
        <CheckProgress done={!!result} onFinished={() => setShowProgress(false)} />
      </Centered>
    )
  if (!result || !step) return <Centered>{null}</Centered>

  const docs: DocumentRef[] = result.documents ?? []
  const currentDoc = docs.find((d) => d.file_id === view?.file_id)
  const isLast = stepIdx === result.steps.length - 1
  const r = RESULT[step.result]

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <FlowHeader
        crumbs={[{ label: 'Households', to: '/' }, { label: result.building.replace(' Apartments', ''), to: '/' }, { label: `Unit ${result.unit}` }]}
        right={<ProgressPills current={1} />}
      />
      <div className="mx-auto flex w-full max-w-[1376px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-[28px] leading-tight font-semibold">{result.name}</h1>
          <StatusBadge status={result.status} />
          <span className="text-[13px] text-muted">AI suggested · you decide</span>
        </div>
        <p className="text-[15px] text-muted">
          <strong className="text-lg text-ink">{money(result.projected_annual_income)}</strong> projected ·{' '}
          <strong className="text-lg text-ink">{money(result.income_limit)}</strong> limit ({result.unit_ami_pct}% AMI, {result.household_size}{' '}
          {result.household_size === 1 ? 'person' : 'people'})
        </p>
      </div>

      <main className="mx-auto flex w-full max-w-[1376px] flex-col gap-6 px-8 pt-3 pb-5 lg:min-h-0 lg:flex-1 lg:flex-row">
        <section aria-label="Source document" className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[13px]">
            {docs.map((d) => (
              <button
                key={d.file_id}
                onClick={() => setBrowse({ file_id: d.file_id, page: d.file_id === view?.file_id ? view.page : 1 })}
                aria-pressed={d.file_id === view?.file_id}
                className={`cursor-pointer rounded-full px-3 py-1.5 ${
                  d.file_id === view?.file_id ? 'bg-evergreen font-medium text-white' : 'bg-white text-ink hover:bg-evergreen-wash'
                }`}
              >
                {d.label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-2 text-muted">
              {view && pageCount > 1 && (
                <>
                  <button
                    aria-label="Previous page"
                    disabled={view.page <= 1}
                    onClick={() => setBrowse({ file_id: view.file_id, page: view.page - 1 })}
                    className="grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white disabled:opacity-40"
                  >
                    ‹
                  </button>
                  <button
                    aria-label="Next page"
                    disabled={view.page >= pageCount}
                    onClick={() => setBrowse({ file_id: view.file_id, page: view.page + 1 })}
                    className="grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-white disabled:opacity-40"
                  >
                    ›
                  </button>
                </>
              )}
              Page {view?.page ?? 1} of {pageCount} · from Box
            </span>
          </div>
          <div className="rounded-xl bg-mist-deep/60 p-3 lg:min-h-0 lg:flex-1 lg:overflow-auto">
            {view && <PdfViewer url={api.fileUrl(view.file_id)} page={view.page} highlights={highlights} onPageCount={setPageCount} />}
          </div>
          <p className="mt-1.5 text-xs text-muted">{currentDoc?.file_name}</p>
        </section>

        <aside aria-label="Findings" className="flex w-full flex-col gap-3 lg:min-h-0 lg:w-[400px] lg:flex-none">
          <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-auto lg:pr-1">
            <ol aria-label="All checks" className="m-0 flex list-none flex-col gap-0.5 rounded-2xl bg-white p-1.5 text-sm shadow-[0_0_0_1px_var(--color-line)]">
              {result.steps.map((s, i) => {
                const sr = RESULT[s.result]
                const active = i === stepIdx
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => goTo(i)}
                      aria-current={active ? 'step' : undefined}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-left ${
                        active ? 'bg-evergreen-tint font-semibold' : 'hover:bg-mist'
                      }`}
                    >
                      <span className={`w-4 text-center ${sr.text}`} aria-hidden="true">
                        {sr.mark}
                      </span>
                      {s.title}
                      <span className={`ml-auto text-xs font-medium ${sr.text}`}>{s.result_label ?? sr.label}</span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <div className="rounded-2xl bg-white p-5 shadow-[0_0_0_1.5px_var(--color-evergreen)]">
              <div className={`text-[13px] font-semibold ${r.text}`}>
                Finding {stepIdx + 1} of {result.steps.length} · {step.title} · {step.result_label ?? r.label}
              </div>
              <h2 className="mt-1.5 mb-2 font-serif text-[21px] leading-snug font-semibold">{step.headline ?? step.title}</h2>
              <p className="mb-3 text-sm text-ink-soft">{step.detail}</p>
              {step.evidence.map((e, i) => {
                const selected = !browse && i === evIdx
                const docLabel = docs.find((d) => d.file_id === e.file_id)?.label ?? e.file_name
                return (
                  <button
                    key={`${e.file_id}-${e.page}-${i}`}
                    onClick={() => {
                      setEvIdx(i)
                      setBrowse(null)
                    }}
                    aria-pressed={selected}
                    className={`mt-1 flex w-full cursor-pointer gap-3 rounded-[10px] px-3 py-2.5 text-left ${selected ? 'bg-marker-wash' : 'hover:bg-mist'}`}
                  >
                    <span
                      className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-xs font-semibold ${
                        selected ? 'bg-evergreen text-white' : 'bg-evergreen-tint text-evergreen'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className="block font-semibold">“{e.quote}”</span>
                      <span className="text-sm text-muted">
                        {docLabel}, page {e.page}
                        {selected ? ' · showing now' : ''}
                      </span>
                    </span>
                  </button>
                )
              })}
              {step.result !== 'pass' && <p className="mt-3 text-sm text-muted">Only a person can decide what this means for the household.</p>}
            </div>

            <p className="text-[13px] text-muted">
              Excluded: {result.excluded_documents.map((d) => d.file_name.replace(/_/g, ' ').replace('.pdf', '')).join(', ')}, never used for
              decisions. Rules: {result.rules_version}.
            </p>
          </div>

          <div className="flex flex-none gap-2.5">
            <SecondaryButton disabled={stepIdx === 0} onClick={() => goTo(stepIdx - 1)}>
              Back
            </SecondaryButton>
            {isLast ? (
              <PrimaryButton className="flex-1" onClick={() => navigate(`/households/${id}/decision`)}>
                Continue to decision →
              </PrimaryButton>
            ) : (
              <PrimaryButton className="flex-1" onClick={() => goTo(stepIdx + 1)}>
                Next finding →
              </PrimaryButton>
            )}
          </div>
          {!isLast && (
            <Link to={`/households/${id}/decision`} className="flex-none text-center text-sm text-muted">
              Skip to decision
            </Link>
          )}
          <p className="flex-none text-center text-xs text-faint">Tip: use the ← → keys to move between findings</p>
        </aside>
      </main>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-8 text-center">
      <div>{children}</div>
    </div>
  )
}
