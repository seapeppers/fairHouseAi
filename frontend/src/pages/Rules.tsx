import type { ReactNode } from 'react'
import { CheckIcon, LockIcon, XIcon } from '../components/Icons'
import { HomeHeader } from '../components/Shell'
import { money } from '../components/ui'

// From data/rules/income_limits_mfte_p7_2026.json (effective May 15, 2026).
const LIMITS: { size: number; pct50: number; pct60: number; pct80: number }[] = [
  { size: 1, pct50: 57550, pct60: 69060, pct80: 92080 },
  { size: 2, pct50: 65800, pct60: 78960, pct80: 105280 },
  { size: 3, pct50: 74000, pct60: 88800, pct80: 118400 },
  { size: 4, pct50: 82200, pct60: 98640, pct80: 131520 },
  { size: 5, pct50: 88800, pct60: 106560, pct80: 142080 },
  { size: 6, pct50: 95400, pct60: 114480, pct80: 152640 },
]

const HOW = [
  { who: 'AI', text: 'Reads every document in the household’s Box folder.' },
  { who: 'AI', text: 'Pulls out each income amount, with the exact quote and page.' },
  { who: 'Formula', text: 'Calculates yearly income with the program’s fixed formula. No AI in the math.' },
  { who: 'AI', text: 'Double-checks every number against the documents and flags anything odd.' },
  { who: 'You', text: 'Review the proof and make the decision. AI never approves.' },
]

const COUNTS = ['Wages, overtime, tips, bonuses', 'Self-employment (net)', 'Social Security, pensions, unemployment', 'Child support, alimony', 'Recurring monthly gifts from one source']
const NOT_COUNTED = ['Food assistance (SNAP)', 'Housing subsidies', 'One-time lump sums', 'Transfers between own accounts', 'Tax refunds and reimbursements']
const REQUIRED = ['3 consecutive months of bank statements for every adult', '3+ months of pay stubs, or employer verification', 'Signed income declaration']

export default function Rules() {
  return (
    <div className="min-h-screen">
      <HomeHeader />
      <main className="mx-auto max-w-[1120px] px-8 pt-6 pb-12">
        <h1 className="font-serif text-[40px] leading-tight font-semibold">Rules</h1>
        <p className="mt-1.5 text-muted">Every household is checked against the same rules. The version is stamped on every result and record.</p>

        <section className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[20px] bg-white px-6 py-5 shadow-[0_0_0_1px_var(--color-line)]">
          <div className="flex-[1_1_360px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pass-tint px-2.5 py-0.5 text-[13px] font-semibold text-pass">
              <CheckIcon size={12} /> In use
            </span>
            <h2 className="mt-2 font-serif text-[24px] font-semibold">Seattle MFTE Program 7 · 2026</h2>
            <p className="text-sm text-muted">Compliance Manual for MILU Agreements (updated Sep 8, 2026) · Income limits effective May 15, 2026</p>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <a href="https://www.seattle.gov/documents/Departments/Housing/PropertyManagers/MFTECompliance/Compliance_Manual_MILU_Agreements.pdf" target="_blank" rel="noreferrer">
              Compliance manual ↗
            </a>
            <a href="https://www.seattle.gov/documents/Departments/Housing/Shared/IncomeLimits/2026-2027_MFTE_P7_Rental_IncomeLimits.pdf" target="_blank" rel="noreferrer">
              Income limits ↗
            </a>
          </div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-5 max-md:grid-cols-1">
          <Card title="How a check works">
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm">
              {HOW.map((h, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className={`mt-px w-[68px] flex-none rounded-full py-0.5 text-center text-xs font-semibold ${
                      h.who === 'You' ? 'bg-evergreen text-white' : h.who === 'Formula' ? 'bg-marker text-ink' : 'bg-evergreen-tint text-evergreen'
                    }`}
                  >
                    {h.who}
                  </span>
                  {h.text}
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Never used for decisions">
            <div className="flex items-start gap-3 rounded-xl bg-mist px-4 py-3.5 text-sm">
              <LockIcon size={18} className="mt-0.5 flex-none text-evergreen" />
              <span>
                <strong className="font-semibold">Demographic form.</strong>{' '}
                <span className="text-muted">It stays in the file because the program requires it, but the AI never reads it and it never affects a result.</span>
              </span>
            </div>
            <h3 className="mt-4 mb-2 text-sm font-semibold">Required documents</h3>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
              {REQUIRED.map((r) => (
                <li key={r} className="flex items-start gap-2">
                  <CheckIcon size={13} className="mt-1 flex-none text-pass" /> {r}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="What counts as income">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {COUNTS.map((c) => (
                  <li key={c} className="flex items-start gap-2">
                    <CheckIcon size={13} className="mt-1 flex-none text-pass" /> {c}
                  </li>
                ))}
              </ul>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-muted">
                {NOT_COUNTED.map((c) => (
                  <li key={c} className="flex items-start gap-2">
                    <XIcon size={12} className="mt-1 flex-none text-faint" /> {c}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card title="Income limits by household size">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[13px] text-muted">
                  <th className="pb-2 font-medium">People</th>
                  <th className="pb-2 text-right font-medium">50% AMI</th>
                  <th className="pb-2 text-right font-medium">60% AMI</th>
                  <th className="pb-2 text-right font-medium">80% AMI</th>
                </tr>
              </thead>
              <tbody>
                {LIMITS.map((l) => (
                  <tr key={l.size} className="border-t border-mist">
                    <td className="py-1.5">{l.size}</td>
                    <td className="py-1.5 text-right">{money(l.pct50)}</td>
                    <td className="py-1.5 text-right font-semibold">{money(l.pct60)}</td>
                    <td className="py-1.5 text-right">{money(l.pct80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <p className="mt-5 text-[13px] text-muted">Other programs and cities can be added as their own rule sets.</p>
      </main>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[20px] bg-white px-6 py-5 shadow-[0_0_0_1px_var(--color-line)]">
      <h2 className="mb-3.5 text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">{title}</h2>
      {children}
    </section>
  )
}
