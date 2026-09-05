import { useNavigate, useParams } from 'react-router-dom'
import { useBoardItems, useProject, useRealtimeSync } from '../data/hooks'
import { Board } from '../components/board/Board'
import { Splash } from '../components/layout/Splash'

export default function BoardPage() {
  useRealtimeSync()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { project, isPending } = useProject(id)
  const items = useBoardItems(id)

  if (isPending || items.isPending) return <Splash />
  if (!project) return <Splash error="That project doesn't exist any more." />

  return (
    <div className="h-dvh w-full overflow-hidden bg-board">
      <Board project={project} items={items.data ?? []} onExit={() => navigate(`/projects/${id}`, { state: { tab: 'board' } })} />
    </div>
  )
}
