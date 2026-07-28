import { Link } from 'react-router-dom'
import { PageHeader } from '@/shared/ui'

const links = [
  { to: '/shopping', label: 'Shopping', hint: 'Low stock and restocks' },
  { to: '/ingredients', label: 'Ingredient library', hint: 'Food types for recipes and stock' },
  { to: '/log', label: 'Cook log', hint: 'Past cooking sessions' },
  { to: '/notebook', label: 'Notebook', hint: 'Nutrition at a glance' },
  { to: '/goals', label: 'Kitchen goals', hint: 'Daily energy and macros' },
  { to: '/backup', label: 'Backup', hint: 'Export and restore your data' },
]

export function MorePage() {
  return (
    <div>
      <PageHeader
        title="More"
        subtitle="Library, shopping, notes, and care for your data."
      />
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="block rounded-[var(--radius-card)] border border-line bg-paper-elevated px-4 py-3 transition hover:border-accent/40"
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
