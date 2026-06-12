import * as React from 'react'
import { cn } from '../../lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // 显式声明文字色 + caret 色,防止父级 CSS 继承 + Chromium autofill 覆盖
        // (Bug: 父级 text-stone-100 + autofill 蓝底导致白字蓝底看不见)
        'flex h-9 w-full rounded-lg border border-border bg-bg text-text caret-accent px-3 py-1 text-sm shadow-sm transition-colors',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-text-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // 覆盖浏览器/密码管理 autofill 的蓝底白字(Chromium 默认 #e8f0fe + 蓝字)
        // 用 inset shadow 把背景"染"成我们的 bg-bg,文字保持 text-text
        '[&:-webkit-autofill]:!bg-bg [&:-webkit-autofill]:!text-text [&:-webkit-autofill]:[-webkit-text-fill-color:var(--text)]',
        '[&:-webkit-autofill:focus]:!bg-bg [&:-webkit-autofill:focus]:[-webkit-text-fill-color:var(--text)]',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }
