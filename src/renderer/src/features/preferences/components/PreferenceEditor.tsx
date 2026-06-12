import type { ReactNode } from 'react'

type Props = {
  label: string
  description?: string
  control: ReactNode
  vertical?: boolean
}

export const PreferenceEditor = ({ label, description, control, vertical = false }: Props): JSX.Element => {
  return (
    <div
      className={`flex ${vertical ? 'flex-col gap-2' : 'items-center justify-between gap-4'} py-3`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text">{label}</div>
        {description && <div className="text-xs text-text-muted mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}
