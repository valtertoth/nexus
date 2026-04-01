import { cn } from '@/lib/utils'
import { Flame, Thermometer, Snowflake, HelpCircle } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface LeadScoreBadgeProps {
  score: number | null
  size?: 'sm' | 'md'
  showLabel?: boolean
}

function getScoreConfig(score: number | null) {
  if (score === null) return null
  if (score >= 70) return { label: 'Lead Quente', icon: Flame, color: 'text-red-500', bg: 'bg-red-50' }
  if (score >= 40) return { label: 'Lead Morno', icon: Thermometer, color: 'text-orange-500', bg: 'bg-orange-50' }
  return { label: 'Lead Frio', icon: Snowflake, color: 'text-blue-400', bg: 'bg-blue-50' }
}

export function LeadScoreBadge({ score, size = 'sm', showLabel = false }: LeadScoreBadgeProps) {
  const config = getScoreConfig(score)

  if (!config) return null

  const Icon = config.icon
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger
        render={<span />}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5',
          config.bg,
          config.color,
          textSize
        )}
      >
        <Icon className={cn(iconSize, 'shrink-0')} strokeWidth={2} />
        {showLabel && <span className="font-medium">{config.label}</span>}
        {score !== null && <span className="font-semibold">{score}</span>}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {config.label} — Score {score}/100
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Circular score indicator for detailed views
 */
export function LeadScoreRing({ score }: { score: number | null }) {
  if (score === null) return (
    <div className="flex flex-col items-center">
      <HelpCircle className="w-8 h-8 text-zinc-300" />
      <span className="text-[10px] text-zinc-400 mt-1">Sem score</span>
    </div>
  )

  const config = getScoreConfig(score)!
  const circumference = 2 * Math.PI * 20
  const offset = circumference - (score / 100) * circumference

  const strokeColor = score >= 70 ? '#EF4444' : score >= 40 ? '#F97316' : '#60A5FA'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#e4e4e7" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke={strokeColor}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-700">
          {score}
        </span>
      </div>
      <span className={cn('text-[10px] font-medium', config.color)}>{config.label}</span>
    </div>
  )
}
