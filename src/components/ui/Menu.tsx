import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Menu({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className={cn(
            'z-[120] min-w-48 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lg',
            'origin-[var(--radix-dropdown-menu-content-transform-origin)] motion-safe:data-[state=open]:[animation:menu-in_160ms_var(--ease-out-expo)]',
          )}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function MenuItem({ children, onSelect, danger, icon, disabled }: { children: ReactNode; onSelect?: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={() => onSelect?.()}
      className={cn(
        'flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 text-sm outline-none',
        'data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {icon && <span className="text-ink-2 [&>svg]:size-4">{icon}</span>}
      {children}
    </DropdownMenu.Item>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{children}</DropdownMenu.Label>
}

export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={400}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[130] rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-bg shadow-md">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider
