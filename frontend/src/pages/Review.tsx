import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { PdfViewer, type Highlight } from '../components/PdfViewer'
import { FlowHeader } from '../components/Shell'
import { money, PrimaryButton, ProgressPills, RESULT, SecondaryButton, Spinner, StatusBadge } from '../components/ui'
import type { CheckResult, DocumentRef, Evidence } from '../types'

export const visitedKey = (id: string) => `fairhouse.visited.${id}`

export default function Review() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState<CheckResult | null>(null)
  const [error, setError] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [evIdx, setEvIdx] = useState(0)
  // Free browsing of any document; null means "follow the current evidence".
  const [browse, setBrowse] = useState<{ file_id: string; page: number } | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const [visited, setVisited] = useState<Set<number>>(new Set([0]))

  useEffect(() => {
    api
      .check(id)
      .then((r) => {
        setResult(r)
        // Open on the first finding that needs attention, if any.
        const first = r.steps.findIndex((s) => s.result !== 'pass')
        const start = first >= 0 ? first : 0
        setStepIdx(start)
        setVisited(new Set([start]))
      })
      .catch(() => setError(true))
  }, [id])

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

  function goTo(i: number) {
    setStepIdx(i)
    setEvIdx(0)
    setBrowse(null)
    setVisited((v) => new Set(v).add(i))
  }

  if (error)
    return (
      <Centered>
        <p className="text-fail">This household couldn’t be checked. </p>
        <Link to="/">Back to households</Link>
      </Centered>
    )
  if (!result || !step)
    return (
      <Centered>
        <Spinner label="Checking documents against Seattle MFTE rules…" />
        <p className="mt-3 text-sm text-muted">Reading pay stubs and bank statements from Box. The demographic form is skipped.</p>
      </Centered>
    )

  const docs: DocumentRef[] = result.documents ?? []
  const currentDoc = docs.find((d) => d.file_id === view?.file_id)
  const isLast = stepIdx === result.steps.length - 1
  const r = RESULT[step.result]

  return (
    <div className="min-h-screen">
      <FlowHeader
        crumbs={[{ label: 'Households', to: '/' }, { label: result.building.replace(' Apartments', ''), to: '/' }, { label: `Unit ${result.unit}` }]}
        right={<ProgressPills current={1} />}
      />
      <main className="mx-auto max-w-[1376px] px-8 pt-2 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={result.status} />
              <span className="text-[13px] text-muted">AI suggested · you decide</span>
            </div>
            <h1 className="mt-2 font-serif text-[34px] leading-tight font-semibold">{result.name}</h1>
          </div>
          <p className="text-[15px] text-muted">
            <strong className="text-xl text-ink">{money(result.projected_annual_income)}</strong> projected ·{' '}
            <strong className="text-xl text-ink">{money(result.income_limit)}</strong> limit ({result.unit_ami_pct}% AMI, {result.household_size}{' '}
            {result.household_size === 1 ? 'person' : 'people'})
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-start gap-7">
          <section aria-label="Source document" className="min-w-0 flex-[999_1_560px]">
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
            {view && (
              <PdfViewer url={api.fileUrl(view.file_id)} page={view.page} highlights={highlights} onPageCount={setPageCount} />
            )}
            <p className="mt-2 text-xs text-muted">{currentDoc?.file_name}</p>
          </section>

          <aside aria-label="Findings" className="flex max-w-[400px] flex-[1_1_340px] flex-col gap-3.5">
            <ol aria-label="All checks" className="m-0 flex list-none flex-col gap-0.5 rounded-2xl bg-white p-1.5 text-sm shadow-[0_0_0_1px_var(--color-line)]">
              {result.steps.map((s, i) => {
                const sr = RESULT[s.result]
                const active = i === stepIdx
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => goTo(i)}
                      aria-current={active ? 'step' : undefined}
                      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left ${
                        active ? 'bg-evergreen-tint font-semibold' : 'hover:bg-mist'
                      }`}
                    >
                      <span className={`w-4 text-center ${sr.text}`} aria-hidden="true">
                        {sr.mark}
                      </span>
                      {s.title}
                      <span className={`ml-auto text-xs font-medium ${sr.text}`}>
                        {s.result_label ?? sr.label}
                        {active ? ' · viewing' : visited.has(i) ? '' : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>

            <div className="rounded-2xl bg-white p-[22px] shadow-[0_0_0_1.5px_var(--color-evergreen)]">
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
                    className={`mt-1 flex w-full cursor-pointer gap-3 rounded-[10px] px-3 py-[11px] text-left ${
                      selected ? 'bg-marker-wash' : 'hover:bg-mist'
                    }`}
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
              {step.result !== 'pass' && (
                <p className="mt-3 text-sm text-muted">Only a person can decide what this means for the household.</p>
              )}
            </div>

            <div className="flex gap-2.5">
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
              <Link to={`/households/${id}/decision`} className="text-center text-sm text-muted">
                Skip to decision
              </Link>
            )}
            <p className="text-[13px] text-muted">
              Excluded: {result.excluded_documents.map((d) => d.file_name.replace(/_/g, ' ').replace('.pdf', '')).join(', ')}, never
              used for decisions. Rules: {result.rules_version}.
            </p>
          </aside>
        </div>
      </main>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center px-8 text-center"><div>{children}</div></div>
}
