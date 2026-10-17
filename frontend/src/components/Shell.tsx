import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth'
import { LockIcon } from './Icons'
import { Logo } from './ui'

/** Top bar for review flow screens: logo, breadcrumb, and the right-side slot (progress). */
export function FlowHeader({ crumbs, right }: { crumbs: { label: string; to?: string }[]; right?: ReactNode }) {
  return (
    <header className="mx-auto flex max-w-[1376px] flex-wrap items-center gap-x-7 gap-y-3 px-8 py-4">
      <Logo />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        {crumbs.map((c, i) => (
          <span key={c.label}>
            {i > 0 && <span aria-hidden="true"> / </span>}
            {c.to ? (
              <Link to={c.to} className="text-muted hover:text-ink">
                {c.label}
              </Link>
            ) : (
              <span className="text-ink">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="ml-auto">{right}</div>
    </header>
  )
}

/** Top bar for home screens: logo, pill navigation, signed-in identity. */
export function HomeHeader({ variant = 'analyst' }: { variant?: 'analyst' | 'property_manager' }) {
  const { me, signOut } = useAuth()
  return (
    <header className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-7 gap-y-3 px-8 py-4">
      <Logo />
      {variant === 'analyst' ? (
        <nav aria-label="Main" className="flex gap-1 rounded-full bg-white p-1 text-sm font-medium shadow-[0_1px_3px_rgba(24,36,31,.06)]">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `rounded-full px-3.5 py-1.5 no-underline ${isActive ? 'bg-evergreen text-white' : 'text-muted hover:text-ink'}`
            }
          >
            Households
          </NavLink>
          <span className="rounded-full px-3.5 py-1.5 text-faint" title="Coming soon">
            Audit log
          </span>
          <span className="rounded-full px-3.5 py-1.5 text-faint" title="Coming soon">
            Rules
          </span>
        </nav>
      ) : (
        <span className="rounded-full bg-white px-2.5 py-1 text-[13px] text-muted shadow-[0_0_0_1px_var(--color-line)]">
          Property manager view
        </span>
      )}
      <div className="ml-auto flex items-center gap-4 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <LockIcon className="text-evergreen" />
          Signed in with Box · {me?.role === 'property_manager' ? me.building : 'Compliance analyst'}
        </span>
        <button onClick={signOut} className="cursor-pointer text-muted underline hover:text-ink">
          Sign out
        </button>
      </div>
    </header>
  )
}
