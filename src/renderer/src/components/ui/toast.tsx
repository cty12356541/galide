import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'

type ToastProps = {
  message: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
}

/**
 * 颜色全部用 CSS 变量 (var(--xxx)) + sonner 的 dark: 变体,
 * 让 light / dark mode 都自动适配。
 * 原 hardcoded `bg-success-soft text-success-strong` 在 dark mode 下深绿字配绿底,
 * 在 dialog/overlay 后面看不清(违和感),也违反规约 "禁止 hardcoded 颜色" 精神。
 */
const variantMap: Record<NonNullable<ToastProps['variant']>, string> = {
  default: 'bg-surface text-text border-border',
  success: 'bg-success-soft text-success-strong border-success dark:bg-success-soft dark:text-success dark:border-success',
  error: 'bg-danger-soft text-danger-strong border-danger dark:bg-danger-soft dark:text-danger dark:border-danger',
  warning: 'bg-warning-soft text-warning-strong border-warning dark:bg-warning-soft dark:text-warning dark:border-warning'
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
