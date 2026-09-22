import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost'
type Size = 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-pill font-bold ' +
  'transition-[transform,background-color,box-shadow] duration-cozy ease-cozy ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-55'

const variants: Record<Variant, string> = {
  // Contrast checked: paper on wood-deep = 6.9:1; ink on sage-light = 7.9:1.
  primary: 'bg-wood-deep text-paper shadow-cozy hover:bg-wood-dark',
  secondary: 'bg-sage-light text-ink shadow-cozy hover:bg-sage',
  // Inset ring rather than a border so it lines up with the other variants' height.
  outline:
    'bg-cream-50 text-ink ring-1 ring-inset ring-wood-light shadow-cozy hover:bg-cream-200',
  ghost: 'text-ink-soft hover:bg-cream-300/70 hover:text-ink',
}

const sizes: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3.5 text-base',
}

interface CommonProps {
  variant?: Variant
  size?: Size
  className?: string
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {children}
    </button>
  )
}

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: CommonProps & { to: string }) {
  return (
    <Link to={to} className={cn(base, variants[variant], sizes[size], className)}>
      {children}
    </Link>
  )
}
