import { useState } from 'react'
import { Check, Clock, Copy, Link2, LogOut, MessageCircle, MoreHorizontal, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-react'
import { useActions, useInvites } from '../../data/hooks'
import { useAuth, useDb } from '../../data/session'
import { useUi } from '../../store/ui'
import { absoluteUrl, copyText, openExternal, prettyPhone, whatsappLink } from '../../lib/share'
import { cn, fmtRelative } from '../../lib/utils'
import { Avatar } from '../ui/Bits'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu'
import { Sheet, useConfirm, usePrompt } from '../ui/Sheet'

type EditMember = (id: string, field: 'display_name' | 'phone', current: string) => void

/** Who is in this home, who has been asked, and the ways in and out. */
export function People({ onEditMember }: { onEditMember: EditMember }) {
  const { me, profiles, household } = useAuth()
  const { isDemo } = useDb()
  const { live } = useInvites()
  const { removeMember, renameHousehold } = useActions()
  const confirm = useConfirm()
  const prompt = usePrompt()
  const toast = useUi((s) => s.toast)
  const [inviteOpen, setInviteOpen] = useState(false)

  const rename = async () => {
    const name = await prompt({ title: 'What is this home called?', label: 'Home name', initial: household?.name ?? '', confirmLabel: 'Save' })
    if (name?.trim()) await renameHousehold(name)
  }

  const remove = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: `${name} loses access straight away and gets an empty home of their own. Everything they added here stays.`,
      confirmLabel: 'Remove them',
      danger: true,
    })
    if (ok) {
      await removeMember(id)
      toast({ title: `${name} is no longer in this home`, tone: 'success' })
    }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl">Who's in this home</h2>
          <button onClick={rename} className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            {household?.name} · {profiles.length} {profiles.length === 1 ? 'person' : 'people'}
            <Pencil className="size-3.5 text-ink-3" />
          </button>
        </div>
        <Button variant="secondary" leading={<UserPlus className="size-4" />} onClick={() => setInviteOpen(true)}>Invite someone</Button>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {profiles.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
            <Avatar name={p.display_name} color={p.color} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-ink">{p.display_name}{p.id === me?.id ? <span className="text-ink-3"> (you)</span> : ''}</span>
              <span className="block truncate text-xs text-ink-3">{p.phone ? <><MessageCircle className="mr-1 inline size-3 align-[-2px]" />{prettyPhone(p.phone)}</> : 'No WhatsApp number yet'}</span>
            </span>
            {p.id !== me?.id && (
              <Menu trigger={<button className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label={`Manage ${p.display_name}`}><MoreHorizontal className="size-5" /></button>}>
                <MenuItem icon={<Pencil />} onSelect={() => onEditMember(p.id, 'display_name', p.display_name)}>Fix their name</MenuItem>
                <MenuItem icon={<MessageCircle />} onSelect={() => onEditMember(p.id, 'phone', p.phone ?? '')}>{p.phone ? 'Change' : 'Add'} their WhatsApp number</MenuItem>
                <MenuSeparator />
                <MenuItem danger icon={<UserMinus />} onSelect={() => remove(p.id, p.display_name)}>Remove from this home</MenuItem>
              </Menu>
            )}
          </li>
        ))}
      </ul>

      {live.length > 0 && (
        <>
          <p className="mt-5 text-[13px] font-medium text-ink-2">Waiting to be accepted</p>
          <ul className="mt-2 flex flex-col gap-2">
            {live.map((i) => (
              <PendingInvite key={i.id} id={i.id} code={i.code} name={i.invited_name} expires={i.expires_at} homeName={household?.name ?? 'our home'} />
            ))}
          </ul>
        </>
      )}

      {profiles.length < 2 && live.length === 0 && (
        <p className="mt-4 text-[13px] text-ink-3">It's just you in here. Invite whoever you live with and you'll share every project, quote and board.</p>
      )}
      {isDemo && <p className="mt-4 text-[13px] text-ink-3">In the demo an invite is only for show — nothing is sent.</p>}

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} homeName={household?.name ?? 'our home'} />
    </section>
  )
}

function inviteMessage(name: string, homeName: string, link: string) {
  return `${name ? `Hi ${name} — ` : ''}join ${homeName} on The Home Hub so we can keep our projects, quotes and ideas in one place:\n${link}\n\nThe link works once and runs out in a week.`
}

function PendingInvite({ id, code, name, expires, homeName }: { id: string; code: string; name: string; expires: string; homeName: string }) {
  const { cancelInvite } = useActions()
  const confirm = useConfirm()
  const toast = useUi((s) => s.toast)
  const link = absoluteUrl(`/join/${code}`)

  return (
    <li className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong px-3 py-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3"><Clock className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{name || 'Someone'}</span>
        <span className="block truncate text-xs text-ink-3">Invited · runs out {fmtRelative(expires)}</span>
      </span>
      <Menu trigger={<button className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Manage the invite for ${name || 'someone'}`}><MoreHorizontal className="size-5" /></button>}>
        <MenuItem icon={<MessageCircle />} onSelect={() => openExternal(whatsappLink(null, inviteMessage(name, homeName, link)))}>Send again on WhatsApp</MenuItem>
        <MenuItem icon={<Copy />} onSelect={async () => { if (await copyText(link)) toast({ title: 'Link copied', tone: 'success' }) }}>Copy the link</MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 />} onSelect={async () => {
          if (await confirm({ title: 'Cancel this invite?', description: 'The link stops working straight away.', confirmLabel: 'Cancel it', danger: true })) void cancelInvite(id)
        }}>Cancel the invite</MenuItem>
      </Menu>
    </li>
  )
}

function InviteSheet({ open, onOpenChange, homeName }: { open: boolean; onOpenChange: (o: boolean) => void; homeName: string }) {
  const { inviteSomeone } = useActions()
  const toast = useUi((s) => s.toast)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<string | null>(null)

  const make = async () => {
    setBusy(true)
    try {
      const inv = await inviteSomeone(name)
      if (inv) setLink(absoluteUrl(`/join/${inv.code}`))
    } finally { setBusy(false) }
  }

  const close = () => { onOpenChange(false); window.setTimeout(() => { setName(''); setLink(null) }, 250) }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      size="sm"
      title="Invite someone into this home"
      description="They make their own login, and land straight in here."
      footer={link
        ? <Button onClick={close}>Done</Button>
        : <><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={make} loading={busy} leading={<Link2 className="size-4" />}>Make the link</Button></>}
    >
      {link ? (
        <div className="flex flex-col gap-4 pt-1">
          <div className="rounded-2xl border border-sage/40 bg-sage-soft p-4">
            <p className="flex items-center gap-2 text-[15px] font-medium text-ink"><Check className="size-4 text-sage-text" /> The link is ready</p>
            <p className="mt-1 text-[13px] text-ink-2">It works for one person and runs out in a week.</p>
          </div>
          <p className="break-all rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-ink-2">{link}</p>
          <div className="flex flex-wrap gap-2">
            <Button leading={<MessageCircle className="size-4" />} onClick={() => openExternal(whatsappLink(null, inviteMessage(name, homeName, link)))}>Send on WhatsApp</Button>
            <Button variant="secondary" leading={<Copy className="size-4" />} onClick={async () => { if (await copyText(link)) toast({ title: 'Link copied', tone: 'success' }) }}>Copy</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pt-1">
          <Field label="Who is it for" hint="Just so you can tell your invites apart — they pick their own name when they register.">
            {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Gran" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void make() }} />}
          </Field>
          <p className="text-[13px] text-ink-3">Anyone who opens the link sees this home's name and who invited them — nothing else — until they register.</p>
        </div>
      )}
    </Sheet>
  )
}

/** Leaving is its own thing, and deliberately not sat next to the friendly buttons. */
export function LeaveHome({ className }: { className?: string }) {
  const { leaveHome } = useActions()
  const { household, profiles } = useAuth()
  const confirm = useConfirm()
  const alone = profiles.length < 2
  return (
    <button
      className={cn('inline-flex items-center gap-2 text-sm font-medium text-danger hover:underline', className)}
      onClick={async () => {
        const ok = await confirm({
          title: `Leave ${household?.name ?? 'this home'}?`,
          description: alone
            ? 'You are the only one here, so this home and everything in it would be left with nobody in it. You get a fresh empty home.'
            : 'You lose access straight away and get an empty home of your own. Everything you added stays with this home.',
          confirmLabel: 'Leave',
          danger: true,
        })
        if (ok) await leaveHome()
      }}
    >
      <LogOut className="size-4" /> Leave this home
    </button>
  )
}
