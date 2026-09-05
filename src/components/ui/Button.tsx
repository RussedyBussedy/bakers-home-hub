import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'outline' | 'dark'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_16px_-6px_var(--primary)] active:scale-[0.98]',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2 shadow-sm active:scale-[0.98]',
  soft: 'bg-primary-soft text-primary-text hover:brightness-95 active:scale-[0.98]',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink active:scale-[0.98]',
  outline: 'bg-transparent text-ink border border-line-strong hover:bg-surface-2 active:scale-[0.98]',
  danger: 'bg-danger-soft text-danger hover:brightness-95 active:scale-[0.98]',
  dark: 'bg-ink text-bg hover:opacity-90 active:scale-[0.98]',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-4 text-[15px] gap-2 rounded-2xl',
  lg: 'h-13 px-6 text-base gap-2 rounded-2xl',
  icon: 'h-11 w-11 rounded-2xl',
  'icon-sm': 'h-9 w-9 rounded-xl',
  'icon-lg': 'h-14 w-14 rounded-3xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, leading, trailing, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none whitespace-nowrap',
        'transition-[transform,background-color,border-color,color,box-shadow,filter] duration-200 ease-out',
        'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : leading}
      {children}
      {!loading && trailing}
    </button>
  )
})

export function IconButton({ label, className, size = 'icon', variant = 'ghost', children, ...rest }: ButtonProps & { label: string }) {
  return (
    <Button aria-label={label} title={label} size={size} variant={variant} className={cn('shrink-0', className)} {...rest}>
      {children}
    </Button>
  )
}
