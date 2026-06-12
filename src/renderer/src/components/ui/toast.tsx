import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'

type ToastProps = {
  message: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
}

/**
 * 颜色全部用 CSS 变量 (var(--xxx)) + sonner 的 dark: 变体,
 * 让 light / dark mode 都自动适配。
 * 原 hardcoded `bg-green-50 text-green-900` 在 dark mode 下深绿字配绿底,
 * 在 dialog/overlay 后面看不清(违和感),也违反规约 "禁止 hardcoded 颜色" 精神。
 */
const variantMap: Record<NonNullable<ToastProps['variant']>, string> = {
  default: 'bg-surface text-text border-border',
  success: 'bg-accent-soft text-text border-accent',
  error: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-100 dark:border-red-800',
  warning: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800'
}

export const Toaster = (): JSX.Element => {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border shadow-lg'
        }
      }}
    />
  )
}

export const toast = (props: ToastProps): void => {
  const className = variantMap[props.variant ?? 'default']
  sonnerToast(props.message, {
    description: props.description,
    className
  })
}

export { sonnerToast }
