import { Link } from 'react-router-dom'
import { PageHeader } from '@/shared/ui'

const links = [
  { to: '/plan-week', label: 'Plan my week', hint: 'Heuristic week draft → sessions, meals, shop' },
  { to: '/pantry', label: 'Pantry', hint: 'Stock on hand by ingredient and brand' },
  { to: '/backup', label: 'Backup & sync', hint: 'Cloud sync, export, and restore' },
  { to: '/goals', label: 'Kitchen goals', hint: 'Daily energy and macros' },
  { to: '/ingredients', label: 'Ingredient library', hint: 'Food types for recipes and stock' },
  { to: '/log', label: 'Cook log', hint: 'Past cooking sessions' },
  { to: '/notebook', label: 'Notebook', hint: 'Nutrition at a glance' },
]

export function MorePage() {
  return (
    <div>
      <PageHeader
        title="More"
        subtitle="Pantry, library, goals, and care for your data."
      />
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="card-elevated block px-4 py-3 transition hover:border-accent/45"
            >
              <div className="font-display text-lg text-accent-deep">{link.label}</div>
              <div className="text-sm text-ink-muted">{link.hint}</div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center font-display text-sm text-ink-muted">Zen Kitchen</p>
    </div>
  )
}
