import { Navigate } from 'react-router-dom'

// Perfis de localStorage foram substituídos por login real por usuário.
// Mantido apenas como redirect para não quebrar rotas/links antigos.
export default function ProfileSelector() {
  return <Navigate to="/" replace />
}
