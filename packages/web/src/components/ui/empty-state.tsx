import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4', className)}>
      <Icon className="w-8 h-8 text-zinc-300 mb-3" />
      <p className="text-sm font-medium text-zinc-400 text-center">{title}</p>
      {description && (
        <p className="text-xs text-zinc-400 text-center mt-1 max-w-xs">{description}</p>
      )}
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick} className="mt-4 text-xs">
          {action.label}
        </Button>
      )}
    </div>
  )
}
