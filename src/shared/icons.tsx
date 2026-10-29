import type { ReactNode, SVGProps } from 'react'
import type { MealSlot } from '@/domain/types'

type IconProps = SVGProps<SVGSVGElement> & { title?: string }

function Icon({
  title,
  children,
  className = 'h-5 w-5',
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function IconToday(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconWeek(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </Icon>
  )
}

export function IconShop(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 7h15l-1.5 9H8L6 7z" />
      <path d="M6 7 5 3H2" />
      <circle cx="9" cy="20" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.25" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconStock(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
      <path d="M8 8V6a4 4 0 0 1 8 0v2" />
      <path d="M4 12h16" />
    </Icon>
  )
}

export function IconRecipes(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4h10a2 2 0 0 1 2 2v14l-4-2-4 2V6a2 2 0 0 0-2-2H5z" />
      <path d="M9 8h4M9 12h4" />
    </Icon>
  )
}

export function IconMore(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.35" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconKitchen(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M3 12h2.5M18.5 12H21M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </Icon>
  )
}

export function IconArrowRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  )
}

export function IconCook(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v3" />
      <path d="M8 4v2M16 4v2" />
      <path d="M6 10h12a2 2 0 0 1 2 2v1a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-1a2 2 0 0 1 2-2z" />
      <path d="M9 19v2M15 19v2" />
    </Icon>
  )
}

export function IconServe(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 4v2" />
    </Icon>
  )
}

export function IconPlan(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2z" />
      <path d="M10 9h4M10 13h4" />
    </Icon>
  )
}

/** Breakfast: sun coming up over the horizon. */
export function IconBreakfast(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17h18" />
      <path d="M7 17a5 5 0 0 0 10 0" />
      <path d="M12 6v3" />
      <path d="M6.2 10.2 8 12" />
      <path d="M17.8 10.2 16 12" />
    </Icon>
  )
}

/** Lunch: sun at its highest. */
export function IconLunch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" />
      <path d="m5.6 5.6 1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6 5.6 18.4" />
    </Icon>
  )
}

/** Dinner: moon. */
export function IconDinner(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
    </Icon>
  )
}

/** Snack: a small star, the extra between the three meals. */
export function IconSnack(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 13.9 9.1 19.5 11 13.9 12.9 12 18.5 10.1 12.9 4.5 11 10.1 9.1z" />
    </Icon>
  )
}

/** One sky set for the four meal slots: sunrise, sun, moon, star. */
export function IconMeal({ meal, ...props }: IconProps & { meal: MealSlot }) {
  if (meal === 'breakfast') return <IconBreakfast {...props} />
  if (meal === 'lunch') return <IconLunch {...props} />
  if (meal === 'dinner') return <IconDinner {...props} />
  return <IconSnack {...props} />
}

export function IconPantry(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M10 13h4" />
    </Icon>
  )
}

export function IconGoals(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconIngredients(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3c-2 3-4 5.5-4 8a4 4 0 1 0 8 0c0-2.5-2-5-4-8z" />
      <path d="M12 15v6" />
    </Icon>
  )
}

export function IconLog(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 4h8a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2z" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </Icon>
  )
}

export function IconNotebook(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Icon>
  )
}

export function IconBackup(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 18h14" />
    </Icon>
  )
}

/** Small warning mark for a value past its target. */
export function IconWarn(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 21 19.5H3L12 3.5z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.8h.01" />
    </Icon>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6.5 7l.8 12.2A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12 5 5L20 7" />
    </Icon>
  )
}

export function IconSpark(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    </Icon>
  )
}

/** Macro KPI: energy (kcal) */
export function IconMacroEnergy(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </Icon>
  )
}

/** Macro KPI: carbs (sugar cube — geometric, so it doesn’t read as the fat drop). */
export function IconMacroCarbs(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 19.5 7.75 12 12 4.5 7.75 12 3.5z" />
      <path d="M4.5 7.75V16L12 20.25V12" />
      <path d="M19.5 7.75V16L12 20.25" />
    </Icon>
  )
}

/** Macro KPI: protein (drumstick — meat, bone, and the knuckle). */
export function IconMacroProtein(props: IconProps) {
  return (
    <Icon {...props}>
      <ellipse cx="14.6" cy="8.8" rx="6.3" ry="4.1" transform="rotate(-50 14.6 8.8)" />
      <path d="M10.8 13.2 8 16.2" />
      <circle cx="6.1" cy="16.6" r="1.55" />
      <circle cx="8.6" cy="19.3" r="1.55" />
    </Icon>
  )
}

/** Macro KPI: fat */
export function IconMacroFat(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3c-2.5 3.5-5 6.2-5 9.5a5 5 0 1 0 10 0C17 9.2 14.5 6.5 12 3z" />
    </Icon>
  )
}
