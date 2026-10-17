import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { CheckIcon, DocIcon, DocQuestionIcon, FlagIcon, UploadIcon } from '../components/Icons'
import { HomeHeader } from '../components/Shell'
import { BoxMark, ErrorState, IncomeBar, money, Spinner, StatusBadge } from '../components/ui'
import type { BoxFolder, HouseholdSummary } from '../types'

type Bucket = 'review' | 'missing' | 'ready' | 'done'

const TILES: { key: Bucket; label: string; icon: ReactNode; cls: string }[] = [
  { key: 'review', label: 'Needs review', icon: <FlagIcon size={16} />, cls: 'bg-review-tint text-review' },
  { key: 'missing', label: 'Missing documents', icon: <DocQuestionIcon size={16} />, cls: 'bg-warn-tint text-warn' },
  { key: 'ready', label: 'Ready to approve', icon: <CheckIcon size={16} />, cls: 'bg-pass-tint text-pass' },
  { key: 'done', label: 'Done', icon: <DocIcon size={16} />, cls: 'bg-mist-deep text-muted' },
]

const DECISION_LABEL = { approve: 'Approved', request_info: 'Waiting on documents', not_eligible: 'Not eligible' }

function bucketOf(h: HouseholdSummary): Bucket {
  if (h.new_documents?.length) return 'review'
  if (h.decided) return h.decided.decision === 'request_info' ? 'missing' : 'done'
  if (h.status === 'QUALIFIES') return 'ready'
  if (h.status === 'MISSING_INFO') return 'missing'
  return 'review'
}

function syncedAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return mins < 1 ? 'synced just now' : `synced ${mins} min ago`
}

export default function Dashboard() {
  const [households, setHouseholds] = useState<HouseholdSummary[] | null>(null)
  const [folder, setFolder] = useState<BoxFolder | null>(null)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState<Bucket | null>(null)

  const load = useCallback(() => {
    setError(false)
    setHouseholds(null)
    api.households().then(setHouseholds).catch(() => setError(true))
    void api.boxFolder().then(setFolder)
  }, [])

  useEffect(load, [load])

  const all = households ?? []
  const counts = Object.fromEntries(TILES.map((t) => [t.key, all.filter((h) => bucketOf(h) === t.key).length])) as Record<Bucket, number>
  const reviewQueue = all.filter((h) => bucketOf(h) === 'review')
  const hero = filter === null || filter === 'review' ? (reviewQueue.find((h) => h.status === 'NEEDS_REVIEW' && !h.new_documents?.length) ?? reviewQueue[0] ?? null) : null
  const rows = all.filter((h) => h !== hero && (filter === null || bucketOf(h) === filter))
  const building = folder?.name ?? all[0]?.building ?? 'Juniper Court Apartments'
  const fileCount = all.reduce((n, h) => n + (h.files?.length ?? 0), 0)

  return (
    <div className="min-h-screen">
      <HomeHeader />
      <main className="mx-auto max-w-[1120px] px-8 pt-5 pb-12">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-2.5 text-sm text-muted shadow-[0_0_0_1px_var(--color-line)]">
          <BoxMark />
          <span>
            Connected to Box · <strong className="font-semibold text-ink">{building}</strong>
            {households && ` · ${all.length} households · ${fileCount} files`}
            {folder && ` · ${syncedAgo(folder.synced_at)}`}
          </span>
          {folder?.url && (
            <a href={folder.url} target="_blank" rel="noreferrer" className="ml-auto font-medium">
              Open in Box ↗
            </a>
          )}
        </div>

        <p className="mt-6 text-[13px] font-semibold tracking-[0.08em] text-evergreen uppercase">Compliance review</p>
        <h1 className="mt-1 font-serif text-[40px] leading-tight font-semibold">{building}</h1>

        {error && (
          <div className="mt-6">
            <ErrorState message="Couldn’t load households from Box." onRetry={load} />
          </div>
        )}
        {!households && !error && (
          <div className="mt-8">
            <Spinner label="Loading households from Box…" />
          </div>
        )}

        {households && (
          <>
            <div role="group" aria-label="Filter households" className="mt-5 grid grid-cols-4 gap-3 max-md:grid-cols-2">
              {TILES.map((t) => {
                const active = filter === t.key
                return (
                  <button
                    key={t.key}
                    aria-pressed={active}
                    onClick={() => setFilter(active ? null : t.key)}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-left transition-shadow ${
                      active ? 'shadow-[0_0_0_2px_var(--color-evergreen)]' : 'shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_1px_var(--color-line-strong)]'
                    }`}
                  >
                    <span className={`grid h-10 w-10 flex-none place-items-center rounded-full ${t.cls}`}>{t.icon}</span>
                    <span>
                      <span className="block font-serif text-[28px] leading-none font-semibold">{counts[t.key]}</span>
                      <span className="text-[13px] text-muted">{t.label}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {hero && (
              <div className="mt-5 flex flex-wrap items-center gap-x-9 gap-y-5 rounded-3xl bg-evergreen px-[30px] py-[24px] text-white">
                <div className="flex-[1_1_380px]">
                  <p className="text-[13px] font-semibold text-[#CFE0D5]">{hero.new_documents?.length ? 'New documents arrived' : 'Start here'}</p>
                  <h2 className="mt-1 font-serif text-[28px] font-semibold">
                    {hero.name} · Unit {hero.unit}
                  </h2>
                  <p className="mt-1 text-[#DCE8E0]">
                    {hero.new_documents?.length ? `${hero.new_documents.join(', ')}. Run a fresh check.` : hero.summary}
                  </p>
                </div>
                {hero.projected_annual_income != null && hero.income_limit != null && (
                  <div className="flex-[0_1_260px]">
                    <div className="flex justify-between text-[13px] text-[#CFE0D5]">
                      <span>{money(hero.projected_annual_income)}</span>
                      <span>limit {money(hero.income_limit)}</span>
                    </div>
                    <div className="mt-1.5">
                      <IncomeBar income={hero.projected_annual_income} limit={hero.income_limit} height={10} tone="dark" />
                    </div>
                  </div>
                )}
                <Link
                  to={`/households/${hero.household_id}${hero.new_documents?.length ? '?fresh=1' : ''}`}
                  className="inline-flex min-h-[52px] items-center rounded-full bg-marker px-[26px] font-bold text-ink no-underline hover:brightness-95"
                >
                  {hero.new_documents?.length ? 'Check new documents →' : 'Review file →'}
                </Link>
              </div>
            )}

            <ul className="mt-5 flex list-none flex-col gap-2.5 p-0">
              {rows.map((h) => (
                <HouseholdRow key={h.household_id} h={h} />
              ))}
              {rows.length === 0 && !hero && (
                <li className="rounded-[20px] bg-white px-[22px] py-6 text-center text-muted shadow-[0_0_0_1px_var(--color-line)]">
                  Nothing here right now.{' '}
                  <button onClick={() => setFilter(null)} className="cursor-pointer text-evergreen underline">
                    Show all households
                  </button>
                </li>
              )}
            </ul>
            <p className="mt-5 text-[13px] text-muted">AI suggests · you decide. Every status is a suggestion until you sign a decision.</p>
          </>
        )}
      </main>
    </div>
  )
}

function HouseholdRow({ h }: { h: HouseholdSummary }) {
  const fresh = !!h.new_documents?.length
  const to = fresh ? `/households/${h.household_id}?fresh=1` : h.decided ? `/households/${h.household_id}/record` : `/households/${h.household_id}`
  const action = fresh ? 'Check new documents' : h.decided ? 'View record' : 'Review file'
  const files = h.files ?? []

  return (
    <li className="rounded-[20px] bg-white px-[22px] py-4 shadow-[0_2px_10px_rgba(24,36,31,.05)]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[170px]">
          {fresh ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6F0FB] px-3 py-1 text-[13px] font-semibold text-[#0B4F9C]">
              <UploadIcon size={13} /> New documents
            </span>
          ) : h.decided ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
                h.decided.decision === 'request_info' ? 'bg-warn-tint text-warn' : 'bg-evergreen-tint text-evergreen'
              }`}
            >
              {h.decided.decision === 'request_info' ? <DocQuestionIcon /> : <CheckIcon size={13} />} {DECISION_LABEL[h.decided.decision]}
            </span>
          ) : h.status ? (
            <StatusBadge status={h.status} />
          ) : (
            <span className="text-[13px] text-muted">Not checked yet</span>
          )}
        </div>
        <div className="flex-[1_1_200px] font-semibold" title={h.summary}>
          {h.name} · Unit {h.unit}
        </div>
        {h.projected_annual_income != null && h.income_limit != null && (
          <div className="w-[200px] max-sm:w-full">
            <div className="text-[13px] text-muted">
              {money(h.projected_annual_income)} of {money(h.income_limit)}
            </div>
            <div className="mt-1">
              <IncomeBar income={h.projected_annual_income} limit={h.income_limit} height={8} />
            </div>
          </div>
        )}
        {files.length > 0 && (
          <details className="relative w-[78px]">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-muted hover:bg-mist [&::-webkit-details-marker]:hidden">
              <DocIcon size={13} /> {files.length} files
            </summary>
            <ul className="absolute z-10 mt-1.5 flex w-[290px] list-none flex-col gap-1 rounded-xl bg-white p-2.5 text-[13px] shadow-[0_0_0_1px_var(--color-line),0_12px_30px_rgba(24,36,31,.12)]">
              {files.map((f) => (
                <li key={f.file_name} className="flex items-center gap-2 px-1 py-0.5">
                  <DocIcon size={12} className={f.excluded ? 'text-faint' : 'text-evergreen'} />
                  <span className={f.excluded ? 'text-faint line-through' : ''}>{f.file_name}</span>
                  {f.excluded && <span className="ml-auto text-[11px] font-semibold text-faint">Excluded</span>}
                </li>
              ))}
              {h.new_documents?.map((n) => (
                <li key={n} className="flex items-center gap-2 px-1 py-0.5 font-semibold text-[#0B4F9C]">
                  <UploadIcon size={12} /> {n} <span className="ml-auto text-[11px]">New</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <Link
          to={to}
          className={`ml-auto inline-flex min-h-11 min-w-[164px] items-center justify-center rounded-full px-[18px] font-medium no-underline ${
            fresh ? 'bg-evergreen text-white hover:bg-evergreen-dark' : 'bg-mist text-ink hover:bg-mist-deep'
          }`}
        >
          {action}
        </Link>
      </div>
    </li>
  )
}
