/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'bg-elevated': 'var(--bg-elevated)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        danger: 'var(--danger)',
        'danger-strong': 'var(--danger-strong)',
        'danger-soft': 'var(--danger-soft)',
        warning: 'var(--warning)',
        'warning-strong': 'var(--warning-strong)',
        'warning-soft': 'var(--warning-soft)',
        success: 'var(--success)',
        'success-strong': 'var(--success-strong)',
        'success-soft': 'var(--success-soft)'
      },
      fontFamily: {
        // 经 CSS var 间接引用 — appearance 偏好(fontSans/fontMono)在运行时改写
        // --font-sans / --font-mono(见 lib/ipc/use-appearance-preferences.ts),
        // 默认栈在 global.css :root 定义(自托管 Inter Variable / JetBrains Mono Variable /
        // Noto Sans SC,见 main.tsx 的 @fontsource 导入)。
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)'
      },
      fontSize: {
        '2xs': ['10px', '14px']
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px'
      },
      boxShadow: {
        none: 'none',
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        DEFAULT: '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
        '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'zoom-in': { from: { transform: 'scale(0.95)' }, to: { transform: 'scale(1)' } },
        'thinking-dot': {
          '0%, 60%, 100%': { opacity: '0.3', transform: 'translateY(0)' },
          '30%': { opacity: '1', transform: 'translateY(-2px)' }
        }
      },
      animation: {
        'fade-in-0': 'fade-in 0.2s ease-out',
        'fade-out-0': 'fade-out 0.2s ease-out',
        'zoom-in-95': 'zoom-in 0.2s ease-out',
        'thinking-dot': 'thinking-dot 1.2s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
