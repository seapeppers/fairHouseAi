import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Status, StepResult } from '../types'
import { CheckIcon, DocQuestionIcon, FlagIcon, LockIcon, XIcon } from './Icons'

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-ink no-underline">
      <svg width={size} height={size} viewBox="0 0 30 30" fill="none" aria-hidden="true">
        <rect width="30" height="30" rx="8" fill="#1E4A38" />
        <path d="M8 15.5 15 9l7 6.5V22H8z" stroke="#F3F4F0" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="m11.8 17.6 2.3 2.2 4.3-4.3" stroke="#F3E39A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-serif text-[19px] font-semibold">FairHouseAI</span>
    </Link>
  )
}

const STATUS: Record<Status, { label: string; cls: string; icon: ReactNode }> = {
  QUALIFIES: { label: 'Qualifies', cls: 'bg-pass-tint text-pass', icon: <CheckIcon size={13} /> },
  NOT_QUALIFIED: { label: 'Not qualified', cls: 'bg-fail-tint text-fail', icon: <XIcon /> },
  MISSING_INFO: { label: 'Missing info', cls: 'bg-warn-tint text-warn', icon: <DocQuestionIcon /> },
  NEEDS_REVIEW: { label: 'Needs review', cls: 'bg-review-tint text-review', icon: <FlagIcon /> },
}

export function StatusBadge({ status, className = '' }: { status: Status; className?: string }) {
  const s = STATUS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${s.cls} ${className}`}>
      {s.icon}
      {s.label}
    </span>
  )
}

export const RESULT: Record<StepResult, { label: string; text: string; mark: ReactNode }> = {
  pass: { label: 'Pass', text: 'text-pass', mark: <CheckIcon size={16} /> },
  warn: { label: 'Check', text: 'text-warn', mark: <span className="font-bold">!</span> },
  fail: { label: 'Fail', text: 'text-fail', mark: <XIcon size={14} /> },
}

/** Soft fill bar: income up to the limit in evergreen, any overage in soft indigo. */
export function IncomeBar({
  income,
  limit,
  height = 12,
  tone = 'light',
}: {
  income: number
  limit: number
  height?: number
  tone?: 'light' | 'dark'
}) {
  const over = income > limit
  const scale = Math.max(income, limit)
  const fill = Math.min(income, limit) / scale
  const limitAt = limit / scale
  const label = over
    ? `Projected income ${money(income)} is ${money(income - limit)} above the ${money(limit)} limit`
    : `Projected income ${money(income)} is ${Math.round((income / limit) * 100)}% of the ${money(limit)} limit`
  const track = tone === 'dark' ? 'bg-[#3C6855]' : 'bg-mist-deep'
  const under = tone === 'dark' ? 'bg-[#E4EFE7]' : 'bg-evergreen'
  const overage = tone === 'dark' ? 'bg-[#B9B5F2]' : 'bg-review-soft'
  const marker = tone === 'dark' ? 'bg-marker' : 'bg-ink'
  return (
    <div role="img" aria-label={label} className={`relative rounded-full ${track}`} style={{ height }}>
      {over && <div className={`absolute inset-0 rounded-full ${overage}`} />}
      <div className={`absolute inset-y-0 left-0 ${under} ${over ? 'rounded-l-full' : 'rounded-full'}`} style={{ width: `${fill * 100}%` }} />
      {over && (
        <div className={`absolute w-[3px] -ml-px rounded-sm ${marker}`} style={{ left: `${limitAt * 100}%`, top: -4, bottom: -4 }} />
      )}
    </div>
  )
}

export function ProgressPills({ current }: { current: 0 | 1 | 2 | 3 }) {
  const steps = ['Documents', 'Income check', 'Decision', 'Record']
  return (
    <ol aria-label="Review progress" className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-[13px] font-medium">
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? 'step' : undefined}
          className={`rounded-full px-3 py-1 ${
            i < current ? 'bg-evergreen-tint text-evergreen' : i === current ? 'bg-evergreen text-white' : 'text-muted'
          }`}
        >
          {i < current ? '✓ ' : ''}
          {s}
        </li>
      ))}
    </ol>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-evergreen" aria-hidden="true" />
      {label}
    </div>
  )
}

export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-evergreen px-6 font-semibold text-white transition-colors hover:bg-evergreen-dark disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-5 font-medium text-ink shadow-[0_0_0_1px_var(--color-line)] transition-colors hover:bg-evergreen-wash disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

/** Small Box wordmark chip, so Box-backed data is easy to spot. */
export function BoxMark({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid flex-none place-items-center rounded-md bg-[#0061D5] font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      box
    </span>
  )
}

/** A failure message that always offers a way forward. */
export function ErrorState({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-fail-tint px-5 py-4 text-fail">
      <span className="font-medium">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="cursor-pointer rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-ink shadow-[0_0_0_1px_var(--color-line)] hover:bg-mist">
          Try again
        </button>
      )}
      {children}
    </div>
  )
}

/** Shown on signed records: they can't be edited after signing. */
export function LockedBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 align-middle text-[11px] font-semibold text-white ${className}`}>
      <LockIcon size={11} /> Locked
    </span>
  )
}
