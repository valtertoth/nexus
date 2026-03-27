import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <Routes>
          <Route path="/login" element={<PlaceholderPage title="Login" />} />
          <Route path="/" element={<PlaceholderPage title="Inbox" />} />
          <Route path="/dashboard" element={<PlaceholderPage title="Dashboard" />} />
          <Route path="/knowledge" element={<PlaceholderPage title="Base de Conhecimento" />} />
          <Route path="/analytics" element={<PlaceholderPage title="Analytics" />} />
          <Route path="/settings" element={<PlaceholderPage title="Configurações" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </TooltipProvider>
    </BrowserRouter>
  )
}
