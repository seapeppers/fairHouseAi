import { useEffect, useRef, useState } from 'react'
import { CheckIcon } from './Icons'

// The real pipeline answers in one call, so stages advance on typical timings
// and finish quickly once the result arrives. The last stage waits as long as needed.
const STAGES = [
  { label: 'Opening the household’s files in Box', ms: 700 },
  { label: 'Reading pay stubs and bank statements', ms: 1300 },
  { label: 'Pulling out every income amount, with quote and page', ms: 1500 },
  { label: 'Calculating income with the program formula', ms: 800 },
  { label: 'Double-checking each number against the documents', ms: 900 },
]

export function CheckProgress({ done, onFinished }: { done: boolean; onFinished: () => void }) {
  const [stage, setStage] = useState(0)
  const finished = useRef(false)

  useEffect(() => {
    if (stage >= STAGES.length) {
      if (!finished.current) {
        finished.current = true
        const t = setTimeout(onFinished, 350)
        return () => clearTimeout(t)
      }
      return
    }
    // Hold on the last stage until the result is in.
    if (stage === STAGES.length - 1 && !done) return
    const t = setTimeout(() => setStage((s) => s + 1), done ? 160 : STAGES[stage].ms)
    return () => clearTimeout(t)
  }, [stage, done, onFinished])

  const pct = Math.round((Math.min(stage, STAGES.length) / STAGES.length) * 100)

  return (
    <div className="w-full max-w-[520px] rounded-[20px] bg-white p-7 text-left shadow-[0_0_0_1px_var(--color-line),0_16px_40px_rgba(24,36,31,.07)]">
      <h1 className="font-serif text-[24px] font-semibold">Checking this household’s file</h1>
      <div
        role="progressbar"
        aria-label="Check progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-4 h-2.5 overflow-hidden rounded-full bg-mist-deep"
      >
        <div className="h-full rounded-full bg-evergreen transition-[width] duration-500 ease-out" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <ol className="mt-5 flex list-none flex-col gap-2.5 p-0 text-[15px]">
        {STAGES.map((s, i) => {
          const state = i < stage ? 'done' : i === stage ? 'active' : 'todo'
          return (
            <li key={s.label} className={`flex items-center gap-3 ${state === 'todo' ? 'text-faint' : 'text-ink'}`}>
              <span
                className={`grid h-6 w-6 flex-none place-items-center rounded-full ${
                  state === 'done' ? 'bg-evergreen text-white' : state === 'active' ? 'bg-evergreen-tint' : 'bg-mist'
                }`}
              >
                {state === 'done' ? (
                  <CheckIcon size={12} />
                ) : state === 'active' ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-evergreen-tint border-t-evergreen" aria-hidden="true" />
                ) : null}
              </span>
              <span className={state === 'active' ? 'font-semibold' : ''}>{s.label}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-5 border-t border-mist-deep pt-4 text-[13px] text-muted">
        The demographic form is skipped. It is never used for decisions.
      </p>
    </div>
  )
}
