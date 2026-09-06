import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadColorNames } from '../lib/colorNames'
import { useBoardItems, useProject, useRealtimeSync } from '../data/hooks'
import { onBoard } from '../lib/board'
import { Board } from '../components/board/Board'
import { Splash } from '../components/layout/Splash'

export default function BoardPage() {
  // Real colour names are a separate ~95 KB chunk — warm it up while the board loads.
  useEffect(() => { void loadColorNames() }, [])
  useRealtimeSync()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { project, isPending } = useProject(id)
  const items = useBoardItems(id)

  if (isPending || items.isPending) return <Splash />
  if (!project) return <Splash error="That project doesn't exist any more." />

  return (
    <div className="h-dvh w-full overflow-hidden bg-board">
      <Board project={project} items={onBoard(items.data ?? [])} onExit={() => navigate(`/projects/${id}`, { state: { tab: 'board' } })} />
    </div>
  )
}
