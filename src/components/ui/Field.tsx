import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

interface FieldProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: (id: string) => ReactNode
  trailing?: ReactNode
}

export function Field({ label, hint, error, required, className, children, trailing }: FieldProps) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
            {label}
            {required && <span className="text-primary-text"> *</span>}
          </label>
          {trailing}
        </div>
      )}
      {children(id)}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

const base =
  'w-full min-h-11 rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow] duration-200 hover:border-line-strong ' +
  'focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; prefix?: string }>(
  function Input({ className, invalid, prefix, ...rest }, ref) {
    if (prefix) {
      return (
        <div className={cn('relative', className)}>
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-3">{prefix}</span>
          <input ref={ref} className={cn(base, 'pl-9 tabular', invalid && 'border-danger focus:ring-danger/15')} {...rest} />
        </div>
      )
    }
    return <input ref={ref} className={cn(base, invalid && 'border-danger focus:ring-danger/15', className)} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(base, 'py-2.5 leading-relaxed resize-y', invalid && 'border-danger', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(base, 'appearance-none pr-10 cursor-pointer')} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
    </div>
  )
})

/** A native date input that looks like the rest of the fields. */
export const DateInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function DateInput({ className, ...rest }, ref) {
  return <input ref={ref} type="date" className={cn(base, 'min-w-0 [&::-webkit-calendar-picker-indicator]:opacity-60', className)} {...rest} />
})

export function Segmented<T extends string>({
  value, onChange, options, className, size = 'md',
}: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-2xl bg-surface-2 p-1 gap-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-xl font-medium transition-all duration-200 whitespace-nowrap',
              size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
              active ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Chip({ active, children, onClick, className, tone }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string; tone?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all duration-200 whitespace-nowrap',
        active ? 'border-ink bg-ink text-bg shadow-sm' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
        className,
      )}
      style={active && tone ? { background: tone, borderColor: tone } : undefined}
    >
      {children}
    </button>
  )
}
