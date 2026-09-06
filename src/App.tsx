import { lazy, Suspense } from 'react'
import { MotionConfig } from 'framer-motion'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, DbProvider, useAuth } from './data/session'
import { useUi } from './store/ui'
import { useCurrency } from './lib/currency'
import { AppShell } from './components/layout/AppShell'
import { Celebrations, Toasts, XpPops } from './components/ui/Feedback'
import { ConfirmHost, PromptHost } from './components/ui/Sheet'
import { NudgeHost } from './components/nudges/NudgeSheet'
import { TooltipProvider } from './components/ui/Menu'
import { Splash } from './components/layout/Splash'
import { ScrollManager } from './components/layout/ScrollManager'
import LoginPage from './pages/Login'
import JoinPage from './pages/Join'
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
  // 'calm' turns every animation off, whatever the machine is set to — an escape hatch for a browser
  // that makes the movement look like flickering.
  const calm = useUi((s) => s.motion) === 'calm'
  // money() is a plain function, so nothing re-renders on its own when the home's currency changes.
  // Subscribing at the top repaints every screen at once — it happens about once per home.
  useCurrency()
  return (
    <DbProvider>
      <AuthProvider>
        <TooltipProvider>
          {/* Honour the system's "reduce motion" setting across every animation in the app, sheets and
              toasts included — the right thing to do, and a single switch that separates an animation
              problem from a painting one when something looks like it flickers. */}
          <MotionConfig reducedMotion={calm ? 'always' : 'user'}>
            <BrowserRouter>
              <ScrollManager />
              {/* Nothing mid-session should be able to flash the full-screen splash; the plain background
                  is enough while a lazy page arrives. */}
              <Suspense fallback={<div className="min-h-dvh bg-bg" aria-busy="true" />}>
                <Routes>
                  <Route path="/login" element={<RedirectIfAuthed />} />
                  <Route path="/join/:code" element={<JoinPage />} />
                  <Route element={<RequireAuth />}>
                    {/* The board lives outside the shell; while its code arrives, show the plain background. */}
                    <Route path="/projects/:id/board" element={<Suspense fallback={<div className="min-h-dvh bg-bg" aria-busy="true" />}><BoardPage /></Suspense>} />
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
          </MotionConfig>
        </TooltipProvider>
      </AuthProvider>
    </DbProvider>
  )
}
