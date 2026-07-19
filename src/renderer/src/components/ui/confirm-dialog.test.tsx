/**
 * useConfirmDialog / ConfirmDialogHost 组件测试
 *
 * 覆盖:resolve(true/false)路径、dismissTopModal(ESC 单源)取消路径、danger 样式。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { useConfirmDialog, ConfirmDialogHost } from './confirm-dialog'
import { confirmDialog, promiseDialogStore } from '../../lib/promise-dialog-store'
import { useUiStore } from '../../lib/store'

const resetStores = (): void => {
  promiseDialogStore.setState({ pending: null })
  useUiStore.setState({ promiseDialogOpen: false })
}

const ConfirmBench = (): JSX.Element => {
  const { confirm, ConfirmDialog } = useConfirmDialog()
  return (
    <div>
      <button
        data-testid="open"
        onClick={() => {
          void confirm({ title: '删除角色', description: '确认删除?', danger: true }).then((v) => {
            const el = document.querySelector('[data-testid="result"]')
            if (el) el.textContent = String(v)
          })
        }}
      >
        open
      </button>
      <span data-testid="result" />
      <ConfirmDialog />
    </div>
  )
}

describe('useConfirmDialog', () => {
  beforeEach(resetStores)

  it('点确认 → resolve true', async () => {
    render(<ConfirmBench />)
    fireEvent.click(screen.getByTestId('open'))
    expect(await screen.findByText('删除角色')).toBeTruthy()
    fireEvent.click(screen.getByText('确认'))
    await screen.findByText('true', { selector: '[data-testid="result"]' })
    expect(useUiStore.getState().promiseDialogOpen).toBe(false)
  })

  it('点取消 → resolve false', async () => {
    render(<ConfirmBench />)
    fireEvent.click(screen.getByTestId('open'))
    await screen.findByText('删除角色')
    fireEvent.click(screen.getByText('取消'))
    await screen.findByText('false', { selector: '[data-testid="result"]' })
  })

  it('dismissTopModal(ESC 单源)→ resolve false', async () => {
    render(<ConfirmBench />)
    fireEvent.click(screen.getByTestId('open'))
    await screen.findByText('删除角色')
    expect(useUiStore.getState().promiseDialogOpen).toBe(true)
    act(() => {
      useUiStore.getState().dismissTopModal()
    })
    await screen.findByText('false', { selector: '[data-testid="result"]' })
  })

  it('danger 时确认按钮带 destructive 样式', async () => {
    render(<ConfirmBench />)
    fireEvent.click(screen.getByTestId('open'))
    const btn = await screen.findByText('确认')
    expect(btn.className).toContain('bg-danger')
  })
})

describe('confirmDialog(全局 host)', () => {
  beforeEach(resetStores)

  it('confirmDialog 由 ConfirmDialogHost 渲染并 resolve', async () => {
    render(<ConfirmDialogHost />)
    let result: boolean | undefined
    act(() => {
      void confirmDialog({ title: '关闭项目' }).then((v) => {
        result = v
      })
    })
    expect(await screen.findByText('关闭项目')).toBeTruthy()
    fireEvent.click(screen.getByText('确认'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result).toBe(true)
  })
})
