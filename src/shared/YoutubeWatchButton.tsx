export function YoutubeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3.05 3.05 0 0 0-2.15-2.16C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.35.54A3.05 3.05 0 0 0 .5 6.2 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.8 3.05 3.05 0 0 0 2.15 2.16c1.81.54 9.35.54 9.35.54s7.54 0 9.35-.54a3.05 3.05 0 0 0 2.15-2.16A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.8zM9.75 15.52V8.48L15.82 12l-6.07 3.52z" />
    </svg>
  )
}

export function YoutubeWatchButton({
  href,
  className = '',
}: {
  href: string
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-paper-elevated px-3.5 py-2.5 text-sm font-medium text-accent-deep transition hover:border-accent/40 ${className}`}
    >
      <YoutubeIcon className="h-4 w-4 shrink-0 text-[#c4302b]" />
      Watch on YouTube
    </a>
  )
}
