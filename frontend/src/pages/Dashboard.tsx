import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { CheckIcon } from '../components/Icons'
import { HomeHeader } from '../components/Shell'
import { IncomeBar, money, Spinner, StatusBadge } from '../components/ui'
import type { HouseholdSummary } from '../types'

const DECISION_LABEL = { approve: 'Approved', request_info: 'Info requested', not_eligible: 'Not eligible' }

export default function Dashboard() {
  const [households, setHouseholds] = useState<HouseholdSummary[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.households().then(setHouseholds).catch(() => setError(true))
  }, [])

  const open = households?.filter((h) => !h.decided) ?? []
  const hero = open.find((h) => h.status === 'NEEDS_REVIEW') ?? null
  const rest = (households ?? []).filter((h) => h !== hero)
  const building = households?.[0]?.building ?? 'Juniper Court Apartments'
  const needs = open.filter((h) => h.status === 'NEEDS_REVIEW').length

  return (
    <div className="min-h-screen">
      <HomeHeader />
      <main className="mx-auto max-w-[1120px] px-8 pt-7 pb-12">
        <p className="text-muted">Seattle Office of Housing · MFTE income review</p>
        <h1 className="mt-1.5 font-serif text-[40px] leading-tight font-semibold">{building}</h1>

        {error && <p className="mt-6 text-fail">Couldn’t load households from Box. Try refreshing.</p>}
        {!households && !error && (
          <div className="mt-8">
            <Spinner label="Loading households from Box…" />
          </div>
        )}

        {households && (
          <>
            <p className="mt-2 text-[17px] text-ink-soft">
              {households.length} households checked.{' '}
              {needs > 0 ? `${needs} need${needs === 1 ? 's' : ''} a closer look.` : 'Nothing needs your review right now.'}
            </p>

            {hero && (
              <div className="mt-7 flex flex-wrap items-center gap-x-9 gap-y-5 rounded-3xl bg-evergreen px-[30px] py-[26px] text-white">
                <div className="flex-[1_1_380px]">
                  <p className="text-[13px] font-semibold text-[#CFE0D5]">Start here</p>
                  <h2 className="mt-1 font-serif text-[28px] font-semibold">
                    {hero.name} · Unit {hero.unit}
                  </h2>
                  <p className="mt-1 text-[#DCE8E0]">{hero.summary}</p>
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
                  to={`/households/${hero.household_id}`}
                  className="inline-flex min-h-[52px] items-center rounded-full bg-marker px-[26px] font-bold text-ink no-underline hover:brightness-95"
                >
                  Start review →
                </Link>
              </div>
            )}

            <h2 className="mt-9 mb-2.5 text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
              {hero ? 'Everyone else' : 'Households'}
            </h2>
            <ul className="flex list-none flex-col gap-2.5 p-0">
              {rest.map((h) => (
                <li key={h.household_id} className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[20px] bg-white px-[22px] py-[18px] shadow-[0_2px_10px_rgba(24,36,31,.05)]">
                  <div className="min-w-[124px]">
                    {h.decided ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-evergreen-tint px-3 py-1 text-[13px] font-semibold text-evergreen">
                        <CheckIcon size={13} /> {DECISION_LABEL[h.decided.decision]}
                      </span>
                    ) : h.status ? (
                      <StatusBadge status={h.status} />
                    ) : (
                      <span className="text-[13px] text-muted">Not checked yet</span>
                    )}
                  </div>
                  <div className="flex-[1_1_260px]">
                    <div className="font-semibold">
                      {h.name} · Unit {h.unit}
                    </div>
                    <div className="text-sm text-muted">
                      {h.decided ? `Decision signed · record ${h.decided.record_id}` : h.summary}
                    </div>
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
                  <Link
                    to={h.decided ? `/households/${h.household_id}/record` : `/households/${h.household_id}`}
                    className="inline-flex min-h-11 items-center rounded-full bg-mist px-[18px] font-medium text-ink no-underline hover:bg-mist-deep"
                  >
                    {h.decided ? 'View record' : h.status === 'QUALIFIES' ? 'Review & approve' : 'Review'}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[13px] text-muted">Data from Box · AI suggested · You decide. Every status is a suggestion until you approve it.</p>
          </>
        )}
      </main>
    </div>
  )
}
