import {
  Award, BookUser, CalendarCheck, Camera, Flag, Flame, GitCompare, Handshake, HeartHandshake, LayoutGrid,
  ListChecks, Medal, Palette, PiggyBank, Rocket, Scale, Sparkles, Trophy, Wallet, type LucideProps,
} from 'lucide-react'

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  Flag, Sparkles, Palette, LayoutGrid, Camera, GitCompare, Scale, Handshake, PiggyBank, BookUser, ListChecks,
  Trophy, Medal, Wallet, CalendarCheck, Flame, HeartHandshake, Rocket,
}

export function AchievementIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? Award
  return <Icon {...props} />
}
