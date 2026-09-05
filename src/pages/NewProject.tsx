import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Page } from '../components/layout/AppShell'
import { ProjectFormFields, emptyProject, validateProject, type ProjectFormValue } from '../components/project/ProjectForm'
import { Button } from '../components/ui/Button'
import { useActions } from '../data/hooks'

export default function NewProjectPage() {
  const navigate = useNavigate()
  const { createProject, uploadFile, updateProject, addImage } = useActions()
  const [value, setValue] = useState<ProjectFormValue>(emptyProject)
  const [errors, setErrors] = useState<ReturnType<typeof validateProject>>({})
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const errs = validateProject(value)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const { coverFile, ...rest } = value
      const project = await createProject({ ...rest, title: rest.title.trim() })
      if (coverFile) {
        const path = await uploadFile(coverFile, project.id)
        await updateProject(project.id, { cover_path: path })
        void addImage({ project_id: project.id, caption: 'The space as it is now', kind: 'before', width: null, height: null, file: coverFile })
      }
      navigate(`/projects/${project.id}`, { replace: true })
    } catch {
      setBusy(false)
    }
  }

  return (
    <Page title="New project" back className="max-w-2xl">
      <div className="card p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-primary-soft p-4 text-primary-text">
          <Sparkles className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm">A project is a quest. Fill in what you know — you can always change it. Starting one earns 25 XP.</p>
        </div>
        <ProjectFormFields value={value} onChange={setValue} errors={errors} />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          <Button size="lg" onClick={submit} loading={busy}>Start the quest</Button>
        </div>
      </div>
    </Page>
  )
}
