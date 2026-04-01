import { useState } from 'react'
import { Building2, MessageCircle, Users, Layers, Brain, Zap, Settings as Settings2 } from 'lucide-react'
import { OrganizationTab } from '@/components/settings/OrganizationTab'
import { WhatsAppTab } from '@/components/settings/WhatsAppTab'
import { TeamTab } from '@/components/settings/TeamTab'
import { SectorsTab } from '@/components/settings/SectorsTab'
import { AiTab } from '@/components/settings/AiTab'
import { IntegrationsTab } from '@/components/settings/IntegrationsTab'
import { QuoteSettingsTab } from '@/components/settings/QuoteSettingsTab'
import { ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'organization', label: 'Organização', icon: Building2 },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'team', label: 'Equipe', icon: Users },
  { id: 'sectors', label: 'Setores', icon: Layers },
  { id: 'ai', label: 'IA', icon: Brain },
  { id: 'integrations', label: 'Integracoes', icon: Zap },
  { id: 'quotes', label: 'Orçamentos', icon: ShoppingCart },
] as const

type TabId = (typeof TABS)[number]['id']

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('organization')

  return (
    <div className="flex h-full bg-zinc-50">
      {/* Sidebar Navigation */}
      <div className="w-52 shrink-0 border-r border-zinc-200 bg-white p-4">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-zinc-700" />
          Configuracoes
        </h2>
        <nav className="space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-white text-zinc-900 shadow-sm font-medium'
                    : 'text-zinc-600 hover:bg-white/60 hover:text-zinc-900'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'organization' && <OrganizationTab />}
        {activeTab === 'whatsapp' && <WhatsAppTab />}
        {activeTab === 'team' && <TeamTab />}
        {activeTab === 'sectors' && <SectorsTab />}
        {activeTab === 'ai' && <AiTab />}
        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'quotes' && <QuoteSettingsTab />}
      </div>
    </div>
  )
}
