import { Link, useNavigate } from 'react-router-dom'
import type { ComponentType, SVGProps } from 'react'
import { IconBackup, IconGoals, IconIngredients, IconNotebook } from '@/shared/icons'
import { Button, PageHeader } from '@/shared/ui'

type Glyph = ComponentType<SVGProps<SVGSVGElement>>

const links: { to: string; label: string; hint: string; icon: Glyph }[] = [
  { to: '/goals', label: 'Goals', hint: 'Daily energy and macros', icon: IconGoals },
  {
    to: '/ingredients',
    label: 'Ingredients',
    hint: 'Food types for recipes',
    icon: IconIngredients,
  },
  {
    to: '/notebook',
    label: 'Logbook',
    hint: 'Nutrition, shopping, cooking, waste',
    icon: IconNotebook,
  },
  { to: '/backup', label: 'Backup & sync', hint: 'Cloud and JSON export', icon: IconBackup },
]

export function MorePage() {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader
        title="More"
        subtitle="Settings and library extras."
        actions={
          <Button variant="secondary" onClick={() => navigate('/')}>
            Back
          </Button>
        }
      />
      <ul className="card-elevated divide-y divide-line overflow-hidden">
        {links.map((link) => {
          const Glyph = link.icon
          return (
            <li key={link.to}>
              <Link
                to={link.to}
                className="flex items-center gap-3 px-4 py-4 transition hover:bg-ink/[0.02]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lacquer/10 text-lacquer">
                  <Glyph className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">{link.label}</div>
                  <div className="text-sm text-ink-muted">{link.hint}</div>
                </div>
                <span className="text-ink-muted" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
