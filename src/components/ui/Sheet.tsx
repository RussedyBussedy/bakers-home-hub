import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { cn } from '../../lib/utils'
import { Button, IconButton } from './Button'

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
  /** Force centred dialog even on mobile (defaults to bottom sheet on small screens). */
  centered?: boolean
  className?: string
  hideClose?: boolean
}

const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', full: 'sm:max-w-5xl' }

export function Sheet({ open, onOpenChange, title, description, children, footer, size = 'md', centered, className, hideClose }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[100] bg-ink/55"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  'fixed z-[101] flex flex-col bg-surface text-ink shadow-lg outline-none',
                  'max-h-[92dvh] w-full overflow-hidden',
                  centered
                    ? 'left-1/2 top-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl'
                    : 'inset-x-0 bottom-0 rounded-t-[28px] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl',
                  sizes[size],
                  className,
                )}
                initial={centered ? { opacity: 0, scale: 0.96, y: 8 } : { opacity: 0, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={centered ? { opacity: 0, scale: 0.98, y: 6 } : { opacity: 0, y: 40 }}
                transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.8 }}
              >
                {!centered && <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />}
                {(title || !hideClose) && (
                  <div className="flex items-start gap-3 px-5 pt-4 pb-2 sm:px-6 sm:pt-5">
                    <div className="min-w-0 flex-1">
                      {title && <Dialog.Title className="font-display text-[22px] leading-tight text-ink">{title}</Dialog.Title>}
                      {description && <Dialog.Description className="mt-1 text-sm text-ink-2">{description}</Dialog.Description>}
                    </div>
                    {!hideClose && (
                      <Dialog.Close asChild>
                        <IconButton label="Close" size="icon-sm" className="-mr-2 -mt-1">
                          <X className="size-5" />
                        </IconButton>
                      </Dialog.Close>
                    )}
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
                {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 safe-bottom sm:px-6">{footer}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

// ---------------------------------------------------------------------------
// Confirm — a promise-based confirmation dialog.
// ---------------------------------------------------------------------------
interface ConfirmRequest {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

const useConfirmStore = create<{ req: ConfirmRequest | null; ask: (r: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>; settle: (ok: boolean) => void }>((set, get) => ({
  req: null,
  ask: (r) => new Promise<boolean>((resolve) => set({ req: { ...r, resolve } })),
  settle: (ok) => {
    get().req?.resolve(ok)
    set({ req: null })
  },
}))

export function useConfirm() {
  return useConfirmStore((s) => s.ask)
}

// ---------------------------------------------------------------------------
// Prompt — a promise-based single-field text dialog.
// ---------------------------------------------------------------------------
interface PromptRequest {
  title: string
  description?: string
  label?: string
  placeholder?: string
  initial?: string
  type?: 'text' | 'date'
  confirmLabel?: string
  resolve: (value: string | null) => void
}

const usePromptStore = create<{ req: PromptRequest | null; ask: (r: Omit<PromptRequest, 'resolve'>) => Promise<string | null>; settle: (v: string | null) => void }>((set, get) => ({
  req: null,
  ask: (r) => new Promise<string | null>((resolve) => set({ req: { ...r, resolve } })),
  settle: (v) => {
    get().req?.resolve(v)
    set({ req: null })
  },
}))

export function usePrompt() {
  return usePromptStore((s) => s.ask)
}

export function PromptHost() {
  const req = usePromptStore((s) => s.req)
  const settle = usePromptStore((s) => s.settle)
  const [value, setValue] = useState('')
  useEffect(() => { if (req) setValue(req.initial ?? '') }, [req])
  return (
    <Sheet open={Boolean(req)} onOpenChange={(o) => { if (!o) settle(null) }} title={req?.title} description={req?.description} size="sm" centered hideClose
      footer={
        <>
          <Button variant="ghost" onClick={() => settle(null)}>Cancel</Button>
          <Button onClick={() => settle(value)}>{req?.confirmLabel ?? 'Save'}</Button>
        </>
      }
    >
      <form className="pt-1" onSubmit={(e) => { e.preventDefault(); settle(value) }}>
        {req?.label && <label htmlFor="prompt-input" className="mb-1.5 block text-[13px] font-medium text-ink-2">{req.label}</label>}
        <input
          id="prompt-input"
          type={req?.type ?? 'text'}
          autoFocus
          value={value}
          placeholder={req?.placeholder}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
        />
      </form>
    </Sheet>
  )
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req)
  const settle = useConfirmStore((s) => s.settle)
  return (
    <Sheet open={Boolean(req)} onOpenChange={(o) => { if (!o) settle(false) }} title={req?.title} description={req?.description} size="sm" centered hideClose
      footer={
        <>
          <Button variant="ghost" onClick={() => settle(false)}>{req?.cancelLabel ?? 'Cancel'}</Button>
          <Button variant={req?.danger ? 'danger' : 'primary'} onClick={() => settle(true)} autoFocus>{req?.confirmLabel ?? 'Confirm'}</Button>
        </>
      }
    />
  )
}
