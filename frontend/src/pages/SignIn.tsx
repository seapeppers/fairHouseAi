import { Navigate, useNavigate } from 'react-router-dom'
import { api, USE_MOCK } from '../api'
import { useAuth } from '../auth'
import { DocIcon, LockIcon, PersonIcon, ScaleIcon } from '../components/Icons'
import type { Role } from '../types'

const PROMISES = [
  { icon: <DocIcon />, title: 'Proof shown.', body: 'Every finding links to the exact words in the source document.' },
  { icon: <PersonIcon />, title: 'You decide.', body: 'AI suggests a status. Only an analyst can approve or reject.' },
  { icon: <ScaleIcon />, title: 'Same rules for everyone.', body: 'City rules applied the same way. Demographic data is never used.' },
]

export default function SignIn() {
  const { me, refresh } = useAuth()
  const navigate = useNavigate()

  if (me) return <Navigate to={me.role === 'analyst' ? '/' : '/upload'} replace />

  async function signIn(role: Role) {
    api.signIn(role)
    if (USE_MOCK) {
      await refresh()
      navigate(role === 'analyst' ? '/' : '/upload')
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-wrap items-center gap-x-[72px] gap-y-12 px-8 py-16">
        <section className="min-w-0 flex-[1_1_420px]">
          <div className="flex items-center gap-3">
            <svg width="40" height="40" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <rect width="30" height="30" rx="8" fill="#1E4A38" />
              <path d="M8 15.5 15 9l7 6.5V22H8z" stroke="#F3F4F0" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="m11.8 17.6 2.3 2.2 4.3-4.3" stroke="#F3E39A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-serif text-[26px] font-semibold">FairHouse</span>
          </div>
          <h1 className="mt-9 font-serif text-[46px] leading-[1.12] font-semibold tracking-tight">
            Income reviews with the <mark className="rounded-md bg-marker px-1.5 text-ink">proof</mark> right beside every finding.
          </h1>
          <p className="mt-4 max-w-[520px] text-lg text-muted">
            For Seattle Office of Housing compliance analysts reviewing MFTE tenant income files.
          </p>
          <ul className="mt-8 flex list-none flex-col gap-3.5 p-0">
            {PROMISES.map((p) => (
              <li key={p.title} className="flex items-start gap-3">
                <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-evergreen-tint text-evergreen">{p.icon}</span>
                <span>
                  <strong className="font-semibold">{p.title}</strong> <span className="text-muted">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Sign in" className="max-w-[420px] flex-[1_1_360px] rounded-[20px] bg-white p-9 shadow-[0_0_0_1px_var(--color-line),0_16px_40px_rgba(24,36,31,.07)]">
          <h2 className="font-serif text-[26px] font-semibold">Sign in</h2>
          <p className="mt-1.5 mb-6 text-muted">Use your Seattle Office of Housing Box account.</p>
          <button
            onClick={() => signIn('analyst')}
            className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-evergreen text-base font-semibold text-white hover:bg-evergreen-dark"
          >
            <LockIcon size={18} />
            Sign in with Box
          </button>
          <ul className="mt-6 flex list-none flex-col gap-2 border-t border-mist-deep p-0 pt-[18px] text-sm text-muted">
            <li>· What you can see follows your Box folder permissions.</li>
            <li>· Files stay in Box. FairHouse doesn’t keep copies.</li>
            <li>· Every decision is signed and saved to Box.</li>
          </ul>
          {USE_MOCK && (
            <button onClick={() => signIn('property_manager')} className="mt-5 cursor-pointer text-sm text-evergreen underline">
              Demo: sign in as a property manager
            </button>
          )}
        </section>
      </main>
      <footer className="mx-auto w-full max-w-[1120px] border-t border-line px-8 py-5 text-[13px] text-muted">
        Rules: Seattle MILU Compliance Manual (Sep 8, 2026) · MFTE P7 income limits (May 15, 2026)
      </footer>
    </div>
  )
}
