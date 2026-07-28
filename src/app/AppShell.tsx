import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'

const nav: {
  to: string
  label: string
  end?: boolean
  isActive?: (pathname: string) => boolean
}[] = [
  {
    to: '/',
    label: 'Plan',
    end: true,
    isActive: (pathname) => pathname === '/' || pathname.startsWith('/plan/'),
  },
  { to: '/ready', label: 'Ready to eat' },
  { to: '/recipes', label: 'Recipes', isActive: (pathname) => pathname.startsWith('/recipes') },
  { to: '/pantry', label: 'Pantry' },
  { to: '/more', label: 'More' },
]

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeSession = useLiveQuery(() =>
    db.cookingSessions.where('status').equals('active').first(),
  )

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <div className="flex-1 px-4 pb-24 pt-6 sm:px-6">
        {activeSession ? (
          <button
            type="button"
            onClick={() => navigate(`/cook/${activeSession.id}`)}
            className="mb-4 flex w-full items-center justify-between rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-left text-sm text-accent-deep"
          >
            <span>
              Session in progress · {activeSession.date}
            </span>
            <span className="font-medium">Resume</span>
          </button>
        ) : null}
        <div className="page-enter">
          <Outlet />
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper-elevated/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl justify-around px-1 pb-[env(safe-area-inset-bottom)] pt-1">
          {nav.map((item) => {
            const active = item.isActive
              ? item.isActive(location.pathname)
              : item.end
                ? location.pathname === item.to
                : location.pathname === item.to ||
                  location.pathname.startsWith(`${item.to}/`)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] sm:text-xs ${
                  active ? 'text-accent-deep' : 'text-ink-muted'
                }`}
              >
                <span
                  className={`h-1 w-1 rounded-full ${
                    active ? 'bg-accent-deep' : 'bg-transparent'
                  }`}
                  aria-hidden
                />
                <span className="truncate font-medium">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
