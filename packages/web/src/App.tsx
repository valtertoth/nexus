import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { MainLayout } from '@/components/layout/MainLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useActiveProfile } from '@/stores/profileStore'
import Login from '@/pages/Login'
import ProfileSelector from '@/pages/ProfileSelector'
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

function ProfileGuard({ children }: { children: React.ReactNode }) {
  const activeProfile = useActiveProfile()
  if (!activeProfile) {
    return <Navigate to="/profile-select" replace />
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
              <Route path="/profile-select" element={
                <ProtectedRoute>
                  <ProfileSelector />
                </ProtectedRoute>
              } />
              {/* Protected routes with layout — require active profile */}
              <Route element={
                <ProtectedRoute>
                  <ProfileGuard>
                    <MainLayout />
                  </ProfileGuard>
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
