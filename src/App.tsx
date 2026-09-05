import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, DbProvider, useAuth } from './data/session'
import { AppShell } from './components/layout/AppShell'
import { Celebrations, Toasts, XpPops } from './components/ui/Feedback'
import { ConfirmHost, PromptHost } from './components/ui/Sheet'
import { NudgeHost } from './components/nudges/NudgeSheet'
import { TooltipProvider } from './components/ui/Menu'
import { Splash } from './components/layout/Splash'
import LoginPage from './pages/Login'
import HubPage from './pages/Hub'
import ProjectsPage from './pages/Projects'
import ProjectPage from './pages/Project'
import NewProjectPage from './pages/NewProject'
import ContactsPage from './pages/Contacts'
import SettingsPage from './pages/Settings'
import RewardsPage from './pages/Rewards'

const InsightsPage = lazy(() => import('./pages/Insights'))
const BoardPage = lazy(() => import('./pages/Board'))

function RequireAuth() {
  const { userId, loading, bundleError } = useAuth()
  if (loading) return <Splash />
  if (!userId) return <Navigate to="/login" replace />
  if (bundleError) return <Splash error={bundleError} />
  return <Outlet />
}

function RedirectIfAuthed() {
  const { userId, loading } = useAuth()
  if (loading) return <Splash />
  if (userId) return <Navigate to="/" replace />
  return <LoginPage />
}

export default function App() {
  return (
    <DbProvider>
      <AuthProvider>
        <TooltipProvider>
          <BrowserRouter>
            <Suspense fallback={<Splash />}>
              <Routes>
                <Route path="/login" element={<RedirectIfAuthed />} />
                <Route element={<RequireAuth />}>
                  <Route path="/projects/:id/board" element={<BoardPage />} />
                  <Route element={<AppShell />}>
                    <Route index element={<HubPage />} />
                    <Route path="/projects" element={<ProjectsPage />} />
                    <Route path="/projects/new" element={<NewProjectPage />} />
                    <Route path="/projects/:id" element={<ProjectPage />} />
                    <Route path="/contacts" element={<ContactsPage />} />
                    <Route path="/insights" element={<InsightsPage />} />
                    <Route path="/rewards" element={<RewardsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toasts />
          <XpPops />
          <Celebrations />
          <ConfirmHost />
          <PromptHost />
          <NudgeHost />
        </TooltipProvider>
      </AuthProvider>
    </DbProvider>
  )
}
