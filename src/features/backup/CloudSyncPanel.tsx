import { useState } from 'react'
import { useCloudSync } from '@/sync/SyncProvider'
import { appAlert } from '@/shared/dialog'
import { Button, Field, WarnBanner, inputClass } from '@/shared/ui'

function statusLabel(status: ReturnType<typeof useCloudSync>['status'], dirty: boolean) {
  switch (status) {
    case 'disabled':
      return 'Not configured'
    case 'signed_out':
      return 'Signed out'
    case 'syncing':
      return 'Syncing…'
    case 'conflict':
      return 'Conflict — resolve the dialog'
    case 'error':
      return 'Error'
    case 'idle':
      return dirty ? 'Unsaved changes pending sync' : 'Up to date'
  }
}

export function CloudSyncPanel() {
  const sync = useCloudSync()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  if (!sync.configured) {
    return (
      <section className="mt-5 card-elevated p-4 text-sm text-ink-muted">
        <h2 className="mb-2 font-display text-lg text-ink">Cloud sync</h2>
        <p>
          Set <code className="text-ink">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-ink">VITE_SUPABASE_PUBLISHABLE_KEY</code> at build time to sync this
          kitchen across your devices. See <code className="text-ink">AGENTS.md</code> for setup.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-5 space-y-3 card-elevated p-4">
      <h2 className="font-display text-lg text-ink">Cloud sync</h2>
      <p className="text-sm text-ink-muted">
        One private snapshot in your Supabase project. Plan on the laptop, cook or shop on the phone
        — same kitchen.
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-muted">Status</dt>
        <dd className="text-ink">{statusLabel(sync.status, sync.dirty)}</dd>
        <dt className="text-ink-muted">Account</dt>
        <dd className="truncate text-ink">{sync.user?.email ?? '—'}</dd>
        <dt className="text-ink-muted">Last sync</dt>
        <dd className="text-ink">
          {sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : 'Never'}
        </dd>
      </dl>

      {sync.lastError ? <WarnBanner>{sync.lastError}</WarnBanner> : null}

      {!sync.user ? (
        <div className="space-y-3">
          <Field label="Email" hint="Use the same address on every device.">
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <p className="text-sm text-ink-muted">
            On iPhone, the email link opens in Safari, not the home screen app. Send it from the
            app you want signed in, then open the link. You can also enter the 6-digit code from
            the email.
          </p>
          <Button
            className="w-full"
            disabled={busy || !email.trim()}
            onClick={() => {
              void (async () => {
                setBusy(true)
                setCodeError(null)
                const result = await sync.signInWithMagicLink(email)
                setBusy(false)
                if (!result.ok) {
                  await appAlert(result.message, { title: 'Sign-in failed' })
                }
              })()
            }}
          >
            Send sign-in email
          </Button>
          {sync.signInEmail ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                Check {sync.signInEmail}. This app signs in after you open the link. If Safari
                shows a code, or the email has a 6-digit code, enter it here.
              </p>
              <Field label="Code">
                <input
                  className={inputClass}
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code or pasted sign-in"
                />
              </Field>
              {codeError ? <WarnBanner>{codeError}</WarnBanner> : null}
              <Button
                className="w-full"
                variant="secondary"
                disabled={busy || !code.trim()}
                onClick={() => {
                  void (async () => {
                    setBusy(true)
                    setCodeError(null)
                    const result = await sync.verifySignInCode(code)
                    setBusy(false)
                    if (!result.ok) setCodeError(result.message)
                  })()
                }}
              >
                Sign in with code
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="w-full"
            disabled={busy || sync.status === 'syncing'}
            onClick={() => {
              void (async () => {
                setBusy(true)
                await sync.syncNow()
                setBusy(false)
              })()
            }}
          >
            Sync now
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                await sync.signOut()
                setBusy(false)
              })()
            }}
          >
            Sign out
          </Button>
        </div>
      )}
    </section>
  )
}
