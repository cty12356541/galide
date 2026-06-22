import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** 捕获主工作区 render 错误,避免白屏 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[galide] ErrorBoundary caught:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-bg text-text"
          data-testid="error-boundary-fallback"
        >
          <p className="text-sm text-text-muted max-w-md text-center">
            界面渲染出错:{this.state.error.message}
          </p>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm hover:opacity-90"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
