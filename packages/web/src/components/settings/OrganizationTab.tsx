import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/components/auth/AuthProvider'
import { Loader2, Save } from 'lucide-react'

export function OrganizationTab() {
  const { profile } = useAuthContext()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [plan, setPlan] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!profile?.org_id) return

    supabase
      .from('organizations')
      .select('name, slug, plan')
      .eq('id', profile.org_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.name)
          setSlug(data.slug)
          setPlan(data.plan)
        }
      })
  }, [profile?.org_id])

  const handleSave = async () => {
    if (!profile?.org_id) return
    setSaving(true)
    setSaved(false)

    await supabase
      .from('organizations')
      .update({ name, slug })
      .eq('id', profile.org_id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-xl space-y-6">
      <Card className="border-zinc-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Dados da organização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nome</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da empresa"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="nome-empresa"
            />
          </div>
          <div className="space-y-2">
            <Label>Plano</Label>
            <p className="text-sm font-medium text-zinc-900 capitalize">{plan}</p>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saved ? 'Salvo!' : 'Salvar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
