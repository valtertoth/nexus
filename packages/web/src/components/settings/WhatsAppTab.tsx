import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import {
  Loader2,
  Save,
  Wifi,
  WifiOff,
  Camera,
  Building2,
  Trash2,
  RefreshCw,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface BusinessProfile {
  about?: string
  address?: string
  description?: string
  email?: string
  vertical?: string
  websites?: string[]
  profile_picture_url?: string
}

const VERTICALS = [
  { value: '', label: 'Selecione...' },
  { value: 'BEAUTY', label: 'Beleza' },
  { value: 'APPAREL', label: 'Vestuario' },
  { value: 'EDU', label: 'Educacao' },
  { value: 'ENTERTAIN', label: 'Entretenimento' },
  { value: 'EVENT_PLAN', label: 'Eventos' },
  { value: 'FINANCE', label: 'Financas' },
  { value: 'GROCERY', label: 'Alimentos' },
  { value: 'GOVT', label: 'Governo' },
  { value: 'HOTEL', label: 'Hotelaria' },
  { value: 'HEALTH', label: 'Saude' },
  { value: 'NONPROFIT', label: 'ONG' },
  { value: 'PROF_SERVICES', label: 'Servicos Profissionais' },
  { value: 'RETAIL', label: 'Varejo' },
  { value: 'TRAVEL', label: 'Turismo' },
  { value: 'RESTAURANT', label: 'Restaurante' },
  { value: 'OTHER', label: 'Outro' },
]

export function WhatsAppTab() {
  const { profile } = useAuthContext()
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [businessAccountId, setBusinessAccountId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'ok' | 'error'>('idle')

  // Business Profile state
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSuccess, setProfileSuccess] = useState('')
  const [bizProfile, setBizProfile] = useState<BusinessProfile>({})
  const [websiteInput, setWebsiteInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // ── Business Profile functions ──

  const fetchProfile = async () => {
    setLoadingProfile(true)
    setProfileError('')
    setProfileSuccess('')

    try {
      const headers = getAuthHeaders()
      const response = await fetch(`${API_BASE}/api/whatsapp/profile`, { headers })

      if (!response.ok) {
        const err = await response.json() as { error?: string }
        setProfileError(err.error || 'Erro ao buscar perfil')
        return
      }

      const result = await response.json() as { profile: BusinessProfile }
      setBizProfile(result.profile || {})
      setWebsiteInput((result.profile?.websites || []).join(', '))
      setProfileLoaded(true)
    } catch {
      setProfileError('Erro de conexao ao buscar perfil')
    } finally {
      setLoadingProfile(false)
    }
  }

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    setProfileError('')
    setProfileSuccess('')

    try {
      const headers = getAuthHeaders()
      const websites = websiteInput
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean)

      const response = await fetch(`${API_BASE}/api/whatsapp/profile`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          about: bizProfile.about || '',
          address: bizProfile.address || '',
          description: bizProfile.description || '',
          email: bizProfile.email || '',
          vertical: bizProfile.vertical || '',
          websites: websites.length > 0 ? websites : [],
        }),
      })

      if (!response.ok) {
        const err = await response.json() as { error?: string }
        setProfileError(err.error || 'Erro ao salvar perfil')
        return
      }

      setProfileSuccess('Perfil atualizado com sucesso!')
      setTimeout(() => setProfileSuccess(''), 3000)
    } catch {
      setProfileError('Erro de conexao ao salvar perfil')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    setProfileError('')
    setProfileSuccess('')

    try {
      const headers = getAuthHeaders()
      // Remove Content-Type so browser sets multipart boundary
      const { 'Content-Type': _ct, ...headersWithoutCt } = headers

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/api/whatsapp/profile/photo`, {
        method: 'POST',
        headers: headersWithoutCt,
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json() as { error?: string }
        setProfileError(err.error || 'Erro ao enviar foto')
        return
      }

      setProfileSuccess('Foto atualizada! Pode levar alguns minutos para aparecer no WhatsApp.')
      setTimeout(() => setProfileSuccess(''), 5000)

      // Refresh profile to get new photo URL
      setTimeout(() => fetchProfile(), 2000)
    } catch {
      setProfileError('Erro ao enviar foto')
    } finally {
      setUploadingPhoto(false)
      // Clear file input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemovePhoto = async () => {
    setUploadingPhoto(true)
    setProfileError('')

    try {
      const headers = getAuthHeaders()
      const response = await fetch(`${API_BASE}/api/whatsapp/profile/photo`, {
        method: 'DELETE',
        headers,
      })

      if (!response.ok) {
        const err = await response.json() as { error?: string }
        setProfileError(err.error || 'Erro ao remover foto')
        return
      }

      setBizProfile((prev) => ({ ...prev, profile_picture_url: undefined }))
      setProfileSuccess('Foto removida!')
      setTimeout(() => setProfileSuccess(''), 3000)
    } catch {
      setProfileError('Erro ao remover foto')
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Credentials Card */}
      <Card className="border-zinc-200 shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Credenciais WhatsApp</CardTitle>
            {connectionStatus === 'ok' && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
                <Wifi className="mr-1 h-3 w-3" />
                Conectado
              </Badge>
            )}
            {connectionStatus === 'error' && (
              <Badge variant="destructive">
                <WifiOff className="mr-1 h-3 w-3" />
                Erro de conexao
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
              O token e criptografado antes de ser salvo.
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
              Testar conexao
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Business Profile Card */}
      <Card className="border-zinc-200 shadow-none">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-zinc-500" />
              <CardTitle className="text-sm font-medium">Perfil Comercial</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchProfile}
              disabled={loadingProfile}
              className="text-xs"
            >
              {loadingProfile ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              {profileLoaded ? 'Atualizar' : 'Carregar perfil'}
            </Button>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Essas informacoes aparecem para seus clientes no WhatsApp.
          </p>
        </CardHeader>
        <CardContent>
          {!profileLoaded && !loadingProfile && (
            <div className="text-center py-8">
              <Building2 className="w-8 h-8 text-zinc-200 mx-auto mb-3" />
              <p className="text-sm text-zinc-500 mb-2">
                Clique em "Carregar perfil" para ver e editar
              </p>
              <p className="text-xs text-zinc-400">
                Requer credenciais WhatsApp salvas e validas.
              </p>
            </div>
          )}

          {loadingProfile && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              <span className="ml-2 text-sm text-zinc-500">Carregando perfil...</span>
            </div>
          )}

          {profileLoaded && !loadingProfile && (
            <div className="space-y-5">
              {/* Profile Photo */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <Avatar className="w-20 h-20">
                    {bizProfile.profile_picture_url && (
                      <AvatarImage
                        src={bizProfile.profile_picture_url}
                        alt="Foto do perfil"
                      />
                    )}
                    <AvatarFallback className="bg-zinc-100 text-zinc-400 text-lg">
                      <Camera className="w-6 h-6" />
                    </AvatarFallback>
                  </Avatar>
                  {uploadingPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-zinc-700">Foto do perfil</p>
                  <p className="text-xs text-zinc-400">JPEG ou PNG, max 5MB</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                    >
                      <Camera className="mr-1 h-3 w-3" />
                      {bizProfile.profile_picture_url ? 'Trocar' : 'Enviar foto'}
                    </Button>
                    {bizProfile.profile_picture_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 text-zinc-400 hover:text-red-500"
                        onClick={handleRemovePhoto}
                        disabled={uploadingPhoto}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Remover
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={handleUploadPhoto}
                  />
                </div>
              </div>

              {/* About (status) */}
              <div className="space-y-2">
                <Label htmlFor="biz-about">Recado (status)</Label>
                <Input
                  id="biz-about"
                  value={bizProfile.about || ''}
                  onChange={(e) =>
                    setBizProfile((prev) => ({ ...prev, about: e.target.value }))
                  }
                  placeholder="Ex: Moveis planejados sob medida"
                  maxLength={139}
                />
                <p className="text-xs text-zinc-400">
                  {(bizProfile.about || '').length}/139 caracteres
                </p>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="biz-description">Descricao da empresa</Label>
                <Textarea
                  id="biz-description"
                  value={bizProfile.description || ''}
                  onChange={(e) =>
                    setBizProfile((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Descreva sua empresa..."
                  rows={3}
                  className="resize-none text-sm"
                  maxLength={512}
                />
                <p className="text-xs text-zinc-400">
                  {(bizProfile.description || '').length}/512 caracteres
                </p>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="biz-address">Endereco</Label>
                <Input
                  id="biz-address"
                  value={bizProfile.address || ''}
                  onChange={(e) =>
                    setBizProfile((prev) => ({ ...prev, address: e.target.value }))
                  }
                  placeholder="Rua, numero, cidade - UF"
                  maxLength={256}
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="biz-email">E-mail comercial</Label>
                <Input
                  id="biz-email"
                  type="email"
                  value={bizProfile.email || ''}
                  onChange={(e) =>
                    setBizProfile((prev) => ({ ...prev, email: e.target.value }))
                  }
                  placeholder="contato@suaempresa.com.br"
                  maxLength={128}
                />
              </div>

              {/* Websites */}
              <div className="space-y-2">
                <Label htmlFor="biz-websites">Sites (separados por virgula)</Label>
                <Input
                  id="biz-websites"
                  value={websiteInput}
                  onChange={(e) => setWebsiteInput(e.target.value)}
                  placeholder="https://seusite.com.br, https://loja.com.br"
                />
                <p className="text-xs text-zinc-400">Maximo 2 sites</p>
              </div>

              {/* Vertical / Category */}
              <div className="space-y-2">
                <Label htmlFor="biz-vertical">Categoria do negocio</Label>
                <select
                  id="biz-vertical"
                  value={bizProfile.vertical || ''}
                  onChange={(e) =>
                    setBizProfile((prev) => ({ ...prev, vertical: e.target.value }))
                  }
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950"
                >
                  {VERTICALS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status messages */}
              {profileError && (
                <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-md">
                  {profileError}
                </p>
              )}
              {profileSuccess && (
                <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-md">
                  {profileSuccess}
                </p>
              )}

              {/* Save button */}
              <Button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                size="sm"
              >
                {savingProfile ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar perfil
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
