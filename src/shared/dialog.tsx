import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button, inputClass } from '@/shared/ui'

type AlertRequest = {
  kind: 'alert'
  title: string
  message: string
  okLabel: string
  resolve: () => void
}

type ConfirmRequest = {
  kind: 'confirm'
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

type PromptRequest = {
  kind: 'prompt'
  title: string
  message: string
  defaultValue: string
  placeholder?: string
  confirmLabel: string
  cancelLabel: string
  resolve: (value: string | null) => void
}

type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest

export type AlertOptions = {
  title?: string
  okLabel?: string
}

export type ConfirmOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Use danger styling on the confirm action (delete / wipe). */
  danger?: boolean
}

export type PromptOptions = {
  title?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

type DialogApi = {
  alert: (message: string, options?: AlertOptions) => Promise<void>
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
  prompt: (message: string, options?: PromptOptions) => Promise<string | null>
}

const DialogContext = createContext<DialogApi | null>(null)

let bridge: DialogApi | null = null

function ensureBridge(): DialogApi {
  if (!bridge) {
    throw new Error('DialogProvider is not mounted')
  }
  return bridge
}

/** App-styled alert (replaces window.alert). */
export function appAlert(message: string, options?: AlertOptions): Promise<void> {
  return ensureBridge().alert(message, options)
}

/** App-styled confirm (replaces window.confirm). Resolves true if confirmed. */
export function appConfirm(message: string, options?: ConfirmOptions): Promise<boolean> {
  return ensureBridge().confirm(message, options)
}

/** App-styled prompt (replaces window.prompt). Resolves null if cancelled. */
export function appPrompt(message: string, options?: PromptOptions): Promise<string | null> {
  return ensureBridge().prompt(message, options)
}

export function useDialog(): DialogApi {
  const api = useContext(DialogContext)
  if (!api) throw new Error('useDialog must be used within DialogProvider')
  return api
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([])
  const current = queue[0] ?? null
  const inputRef = useRef<HTMLInputElement>(null)
  const [promptValue, setPromptValue] = useState('')

  const enqueue = useCallback((request: DialogRequest) => {
    setQueue((prev) => [...prev, request])
  }, [])

  const api = useMemo<DialogApi>(
    () => ({
      alert(message, options) {
        return new Promise<void>((resolve) => {
          enqueue({
            kind: 'alert',
            title: options?.title ?? 'Notice',
            message,
            okLabel: options?.okLabel ?? 'OK',
            resolve,
          })
        })
      },
      confirm(message, options) {
        return new Promise<boolean>((resolve) => {
          enqueue({
            kind: 'confirm',
            title: options?.title ?? 'Please confirm',
            message,
            confirmLabel: options?.confirmLabel ?? 'Confirm',
            cancelLabel: options?.cancelLabel ?? 'Cancel',
            danger: options?.danger ?? false,
            resolve,
          })
        })
      },
      prompt(message, options) {
        return new Promise<string | null>((resolve) => {
          enqueue({
            kind: 'prompt',
            title: options?.title ?? 'Enter a value',
            message,
            defaultValue: options?.defaultValue ?? '',
            placeholder: options?.placeholder,
            confirmLabel: options?.confirmLabel ?? 'OK',
            cancelLabel: options?.cancelLabel ?? 'Cancel',
            resolve,
          })
        })
      },
    }),
    [enqueue],
  )

  useEffect(() => {
    bridge = api
    return () => {
      if (bridge === api) bridge = null
    }
  }, [api])

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setPromptValue(current.defaultValue)
      const t = window.setTimeout(() => inputRef.current?.focus(), 50)
      return () => window.clearTimeout(t)
    }
  }, [current])

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dismiss(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, promptValue])

  function advance() {
    setQueue((prev) => prev.slice(1))
  }

  function dismiss(ok: boolean) {
    if (!current) return
    if (current.kind === 'alert') {
      current.resolve()
    } else if (current.kind === 'confirm') {
      current.resolve(ok)
    } else {
      current.resolve(ok ? promptValue : null)
    }
    advance()
  }

  function submitPrompt() {
    if (!current || current.kind !== 'prompt') return
    current.resolve(promptValue)
    advance()
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => dismiss(false)}
          />
          <div
            className="relative z-10 w-full max-w-md rounded-t-2xl border border-line bg-paper-elevated p-5 shadow-xl sm:rounded-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            aria-describedby="app-dialog-message"
          >
            <h2 id="app-dialog-title" className="text-xl text-accent-deep">
              {current.title}
            </h2>
            <p
              id="app-dialog-message"
              className="mt-3 whitespace-pre-wrap text-sm text-ink-muted"
            >
              {current.message}
            </p>

            {current.kind === 'prompt' ? (
              <div className="mt-4">
                <input
                  ref={inputRef}
                  className={inputClass}
                  value={promptValue}
                  placeholder={current.placeholder}
                  aria-label={current.title}
                  onChange={(e) => setPromptValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitPrompt()
                    }
                  }}
                />
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {current.kind === 'alert' ? (
                <Button className="w-full sm:w-auto" onClick={() => dismiss(true)}>
                  {current.okLabel}
                </Button>
              ) : (
                <>
                  <Button
                    className="w-full sm:w-auto"
                    variant="ghost"
                    onClick={() => dismiss(false)}
                  >
                    {current.cancelLabel}
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    variant={current.kind === 'confirm' && current.danger ? 'danger' : 'primary'}
                    onClick={() =>
                      current.kind === 'prompt' ? submitPrompt() : dismiss(true)
                    }
                  >
                    {current.confirmLabel}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  )
}
