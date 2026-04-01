import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { Loader2, Save, Wifi, WifiOff } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function WhatsAppTab() {
  const { profile } = useAuthContext()
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [businessAccountId, setBusinessAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  useEffect(() => {
    if (!profile?.org_id) return

    supabase
      .from('organizations')
      .select('wa_phone_number_id, wa_business_account_id')
      .eq('id', profile.org_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPhoneNumberId(data.wa_phone_number_id || '')
          setBusinessAccountId(data.wa_business_account_id || '')
        }
      })
  }, [profile?.org_id])

  const handleSave = async () => {
    if (!profile?.org_id) return
    setSaving(true)

    await supabase
      .from('organizations')
      .update({
        wa_phone_number_id: phoneNumberId || null,
        wa_business_account_id: businessAccountId || null,
      })
      .eq('id', profile.org_id)

    // If token provided, encrypt and save
    if (accessToken) {
      await supabase.rpc('encrypt_wa_token', {
        org: profile.org_id,
        token: accessToken,
      })
    }

    setSaving(false)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setConnectionStatus('idle')

    try {
      const headers = getAuthHeaders()
      const response = await fetch(`${API_BASE}/api/whatsapp/test-connection`, {
        method: 'POST',
        headers,
      })

      if (!response.ok) {
        setConnectionStatus('error')
        return
      }

      const result = await response.json() as { status: string }
      setConnectionStatus(result.status === 'connected' ? 'ok' : 'error')
    } catch {
      setConnectionStatus('error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <Card className="border-zinc-200 shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Configuração WhatsApp</CardTitle>
            {connectionStatus === 'ok' && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                <Wifi className="mr-1 h-3 w-3" />
                Conectado
              </Badge>
            )}
            {connectionStatus === 'error' && (
              <Badge variant="destructive">
                <WifiOff className="mr-1 h-3 w-3" />
                Erro de conexão
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wa-phone">Phone Number ID</Label>
            <Input
              id="wa-phone"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="Ex: 123456789012345"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-business">Business Account ID</Label>
            <Input
              id="wa-business"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder="Ex: 987654321098765"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wa-token">Access Token</Label>
            <Input
              id="wa-token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Token permanente do WhatsApp"
            />
            <p className="text-xs text-zinc-500">
              O token é criptografado antes de ser salvo.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || !phoneNumberId}
            >
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="mr-2 h-4 w-4" />
              )}
              Testar conexão
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
