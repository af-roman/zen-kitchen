import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCloudSync } from '@/sync/SyncProvider'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import {
  IconCook,
  IconRecipes,
  IconShop,
  IconStock,
  IconToday,
  IconWeek,
} from '@/shared/icons'

const nav: {
  to: string
  label: string
  icon: typeof IconWeek
  end?: boolean
  isActive?: (pathname: string) => boolean
}[] = [
  {
    to: '/',
    label: 'Today',
    icon: IconToday,
    end: true,
    isActive: (pathname) => pathname === '/',
  },
  {
    to: '/week',
    label: 'Plan',
    icon: IconWeek,
    isActive: (pathname) =>
      pathname.startsWith('/week') ||
      pathname.startsWith('/plan/') ||
      pathname.startsWith('/plan-week') ||
      pathname.startsWith('/serve') ||
      pathname.startsWith('/sessions'),
  },
  {
    to: '/shopping',
    label: 'Shop',
    icon: IconShop,
    isActive: (pathname) => pathname.startsWith('/shopping'),
  },
  {
    to: '/ready',
    label: 'Stock',
    icon: IconStock,
    isActive: (pathname) =>
      pathname.startsWith('/ready') || pathname.startsWith('/pantry'),
  },
  {
    to: '/recipes',
    label: 'Recipes',
    icon: IconRecipes,
    isActive: (pathname) => pathname.startsWith('/recipes'),
  },
]

function AuthBridgeBanner() {
  const sync = useCloudSync()
  const bridge = sync.authBridge
  const [copied, setCopied] = useState(false)
  if (!bridge) return null

  const copy = () => {
    if (bridge.kind !== 'paste') return
    void navigator.clipboard.writeText(bridge.code).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <div className="mb-4 rounded-[1.25rem] bg-ink px-4 py-3 text-sm text-white">
      {bridge.kind === 'published' ? (
        <p>
          Sign-in is waiting in the home screen app. Switch to the Zen Kitchen icon and it will
          sync.
        </p>
      ) : null}
      {bridge.kind === 'open-from-app' ? (
        <p>
          This browser is signed in. The home screen app keeps its own sign-in. Send the email
          from that app, then open the link.
        </p>
      ) : null}
      {bridge.kind === 'paste' ? (
        <div className="space-y-2">
          <p>Paste this code into the home screen app, under More → Backup & sync.</p>
          <p className="break-all font-mono text-xs text-white/90">{bridge.code}</p>
          {bridge.needsSetup ? (
            <p className="text-white/75">
              To skip the paste next time, run the auth handoff section of supabase/schema.sql in
              the Supabase SQL editor.
            </p>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold"
          >
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={sync.dismissAuthBridge}
        className="mt-2 text-xs font-semibold text-white/70"
      >
        Dismiss
      </button>
    </div>
  )
}

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const activeSession = useLiveQuery(() =>
    db.cookingSessions.where('status').equals('active').first(),
  )

  const onCookRoute = location.pathname.startsWith('/cook/')
  const hideNav = onCookRoute

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col sm:max-w-2xl">
      <div className={`flex-1 px-4 pt-5 sm:px-6 ${hideNav ? 'pb-10' : 'pb-28'}`}>
        {activeSession && !onCookRoute ? (
          <button
            type="button"
            onClick={() => navigate(`/cook/${activeSession.id}`)}
            className="cta-ink mb-4 flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
          >
            <span className="flex min-w-0 items-center gap-2.5 font-medium">
              <IconCook className="h-5 w-5 shrink-0 text-lacquer" />
              <span className="truncate">Cooking · {activeSession.date}</span>
            </span>
            <span className="rounded-full bg-lacquer px-3 py-1 text-xs font-semibold text-white">
              Resume
            </span>
          </button>
        ) : null}
        <AuthBridgeBanner />
        <div className="page-enter">
          <Outlet />
        </div>
      </div>
      {hideNav ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-0.5 rounded-full bg-paper-elevated px-1.5 py-1.5 shadow-card sm:max-w-2xl">
            {nav.map((item) => {
              const active = item.isActive
                ? item.isActive(location.pathname)
                : item.end
                  ? location.pathname === item.to
                  : location.pathname === item.to ||
                    location.pathname.startsWith(`${item.to}/`)
              const Glyph = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-2 transition ${
                    active
                      ? 'bg-ink text-white'
                      : 'text-ink-muted hover:bg-ink/5 hover:text-ink'
                  }`}
                >
                  <Glyph className="h-[1.15rem] w-[1.15rem]" />
                  <span className="truncate text-[10px] font-semibold sm:text-[11px]">
                    {item.label}
                  </span>
                </NavLink>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
