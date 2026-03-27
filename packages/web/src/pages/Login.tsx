import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { slugify } from '@nexus/shared'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Zap, Loader2 } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const { signIn, signUp } = useAuth()
  const [loading, setLoading] = useState(false)

  // Login form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Signup form
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupOrgName, setSignupOrgName] = useState('')

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(loginEmail, loginPassword)
      navigate('/', { replace: true })
    } catch (err) {
      toast.error('Credenciais inválidas. Verifique email e senha.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    if (signupPassword.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres.')
      return
    }
    setLoading(true)
    try {
      const slug = slugify(signupOrgName)
      await signUp(signupEmail, signupPassword, signupName, signupOrgName, slug)
      toast.success('Conta criada! Faça login para continuar.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-900">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-zinc-900">
            Nexus
          </span>
        </div>

        <Card className="border-zinc-200 shadow-sm">
          <Tabs defaultValue="login">
            <CardHeader className="pb-4">
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">
                  Entrar
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">
                  Criar conta
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              {/* LOGIN TAB */}
              <TabsContent value="login" className="mt-0">
                <CardTitle className="text-lg mb-1">Bem-vindo de volta</CardTitle>
                <CardDescription className="mb-6">
                  Entre com suas credenciais para acessar o painel.
                </CardDescription>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Entrar'
                    )}
                  </Button>
                </form>
              </TabsContent>

              {/* SIGNUP TAB */}
              <TabsContent value="signup" className="mt-0">
                <CardTitle className="text-lg mb-1">Crie sua conta</CardTitle>
                <CardDescription className="mb-6">
                  Comece a atender seus clientes com IA em minutos.
                </CardDescription>

                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Seu nome</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="João Silva"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-org">Nome da empresa</Label>
                    <Input
                      id="signup-org"
                      type="text"
                      placeholder="Minha Empresa"
                      value={signupOrgName}
                      onChange={(e) => setSignupOrgName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Criar conta'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-zinc-400 mt-6">
          Nexus — Atendimento inteligente via WhatsApp
        </p>
      </div>
    </div>
  )
}
