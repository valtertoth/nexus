import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { MainLayout } from '@/components/layout/MainLayout'
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
    <BrowserRouter>
      <AuthProvider>
        <TooltipProvider>
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
              <Route path="/" element={<Inbox />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/knowledge" element={<Knowledge />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/intelligence" element={<Intelligence />} />
              <Route path="/attribution" element={<Attribution />} />
              <Route path="/brain" element={<BrainPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/dev/simulator" element={<Simulator />} />
              <Route path="/dev/whatsapp" element={<WhatsAppConnect />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors />
        </TooltipProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
