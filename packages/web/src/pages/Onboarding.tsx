import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepWhatsApp } from '@/components/onboarding/StepWhatsApp'
import { StepCatalog } from '@/components/onboarding/StepCatalog'
import { StepPersonality } from '@/components/onboarding/StepPersonality'
import { StepTest } from '@/components/onboarding/StepTest'
import { Brain } from 'lucide-react'

const STEPS = [
  { id: 'whatsapp', label: 'WhatsApp', color: 'bg-emerald-500' },
  { id: 'catalog', label: 'Catalogo', color: 'bg-violet-500' },
  { id: 'personality', label: 'IA', color: 'bg-amber-500' },
  { id: 'test', label: 'Teste', color: 'bg-blue-500' },
]

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0)
  const navigate = useNavigate()

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      // Onboarding complete — go to inbox
      navigate('/')
    }
  }, [currentStep, navigate])

  return (
    <div className="min-h-dvh bg-zinc-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-center gap-3 py-6 border-b border-zinc-800/50">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <Brain className="w-4 h-4 text-violet-500" />
        </div>
        <span className="text-sm font-semibold text-zinc-200 tracking-tight">Nexus</span>
        <span className="text-xs text-zinc-600">|</span>
        <span className="text-xs text-zinc-500">Configuracao inicial</span>
      </header>

      {/* Progress bar */}
      <div className="flex items-center justify-center gap-2 py-6 px-4">
        {STEPS.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300 ${
                i < currentStep
                  ? `${step.color} text-white`
                  : i === currentStep
                    ? `${step.color}/20 text-zinc-200 ring-2 ring-offset-2 ring-offset-zinc-950 ${step.color.replace('bg-', 'ring-')}`
                    : 'bg-zinc-800 text-zinc-600'
              }`}>
                {i < currentStep ? '✓' : i + 1}
              </div>
              <span className={`text-xs hidden sm:inline ${
                i === currentStep ? 'text-zinc-200' : 'text-zinc-600'
              }`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-px ${i < currentStep ? 'bg-zinc-600' : 'bg-zinc-800'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <main className="flex-1 flex items-center justify-center px-4 pb-12">
        {currentStep === 0 && <StepWhatsApp onComplete={handleNext} />}
        {currentStep === 1 && <StepCatalog onComplete={handleNext} />}
        {currentStep === 2 && <StepPersonality onComplete={handleNext} />}
        {currentStep === 3 && <StepTest onComplete={handleNext} />}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-zinc-800/50">
        <p className="text-[11px] text-zinc-700">
          Passo {currentStep + 1} de {STEPS.length} — Voce pode ajustar tudo depois nas Configuracoes
        </p>
      </footer>
    </div>
  )
}
