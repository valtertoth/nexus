import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Loader2 } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuthContext } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { MainLayout } from '@/components/layout/MainLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import Login from '@/pages/Login'
import ProfileSelector from '@/pages/ProfileSelector'
import Team from '@/pages/Team'
import Supervisor from '@/pages/Supervisor'
import Followups from '@/pages/Followups'
import Inbox from '@/pages/Inbox'
import Contacts from '@/pages/Contacts'
import Knowledge from '@/pages/Knowledge'
import Dashboard from '@/pages/Dashboard'
import Analytics from '@/pages/Analytics'
import Settings from '@/pages/Settings'
import { Intelligence } from '@/pages/Intelligence'
import { Attribution } from '@/pages/Attribution'
import { BrainPage } from '@/pages/Brain'
import Simulator from '@/pages/Simulator'
import WhatsAppConnect from '@/pages/WhatsAppConnect'
import Onboarding from '@/pages/Onboarding'

// Gate por papel: só owner/admin (gerente) acessam a página de Equipe.
function RoleGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuthContext()
  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    )
  }
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider>
            <ConnectionStatus />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/onboarding" element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              } />
              <Route path="/profile-select" element={
                <ProtectedRoute>
                  <ProfileSelector />
                </ProtectedRoute>
              } />
              {/* Protected routes with layout — require authenticated user */}
              <Route element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route path="/" element={<ErrorBoundary><Inbox /></ErrorBoundary>} />
                <Route path="/dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                <Route path="/contacts" element={<ErrorBoundary><Contacts /></ErrorBoundary>} />
                <Route path="/knowledge" element={<ErrorBoundary><Knowledge /></ErrorBoundary>} />
                <Route path="/analytics" element={<ErrorBoundary><Analytics /></ErrorBoundary>} />
                <Route path="/intelligence" element={<ErrorBoundary><Intelligence /></ErrorBoundary>} />
                <Route path="/attribution" element={<ErrorBoundary><Attribution /></ErrorBoundary>} />
                <Route path="/brain" element={<ErrorBoundary><BrainPage /></ErrorBoundary>} />
                <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
                <Route path="/team" element={<ErrorBoundary><RoleGuard><Team /></RoleGuard></ErrorBoundary>} />
                <Route path="/supervisor" element={<ErrorBoundary><RoleGuard><Supervisor /></RoleGuard></ErrorBoundary>} />
                <Route path="/followups" element={<ErrorBoundary><Followups /></ErrorBoundary>} />
                <Route path="/dev/simulator" element={<ErrorBoundary><Simulator /></ErrorBoundary>} />
                <Route path="/dev/whatsapp" element={<ErrorBoundary><WhatsAppConnect /></ErrorBoundary>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="top-right" richColors />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
