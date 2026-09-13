/**
 * usePromptDialog / PromptDialogHost 组件测试
 *
 * 覆盖:输入并提交(form submit,即 Enter 路径)resolve string、取消 resolve null、
 * validate 错误阻断提交、空输入禁用提交。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { usePromptDialog, PromptDialogHost } from './prompt-dialog'
import { promptDialog, promiseDialogStore } from '../../lib/promise-dialog-store'
import { useUiStore } from '../../lib/store'

const resetStores = (): void => {
  promiseDialogStore.setState({ pending: null })
  useUiStore.setState({ promiseDialogOpen: false })
}

type BenchProps = {
  validate?: (value: string) => string | null
}

const PromptBench = ({ validate }: BenchProps): JSX.Element => {
  const { prompt, PromptDialog } = usePromptDialog()
  return (
    <div>
      <button
        data-testid="open"
        onClick={() => {
          void prompt({ title: '新建剧本文件名', defaultValue: 'chapter2.gal', validate }).then(
            (v) => {
              const el = document.querySelector('[data-testid="result"]')
              if (el) el.textContent = v === null ? 'null' : v
            }
          )
        }}
      >
        open
      </button>
      <span data-testid="result" />
      <PromptDialog />
    </div>
  )
}

describe('usePromptDialog', () => {
  beforeEach(resetStores)

  it('输入后提交(form submit / Enter)→ resolve 输入值', async () => {
    render(<PromptBench />)
    fireEvent.click(screen.getByTestId('open'))
    const box = (await screen.findByRole('textbox')) as HTMLInputElement
    expect(box.value).toBe('chapter2.gal')
    fireEvent.change(box, { target: { value: 'chapter3' } })
    fireEvent.submit(box.closest('form')!)
    await screen.findByText('chapter3', { selector: '[data-testid="result"]' })
    expect(useUiStore.getState().promiseDialogOpen).toBe(false)
  })

  it('点取消 → resolve null', async () => {
    render(<PromptBench />)
    fireEvent.click(screen.getByTestId('open'))
    await screen.findByRole('textbox')
    fireEvent.click(screen.getByText('取消'))
    await screen.findByText('null', { selector: '[data-testid="result"]' })
  })

  it('validate 返回错误 → 展示错误且不 resolve', async () => {
    render(<PromptBench validate={(v) => (v.includes(' ') ? '文件名不能含空格' : null)} />)
    fireEvent.click(screen.getByTestId('open'))
    const box = (await screen.findByRole('textbox')) as HTMLInputElement
    fireEvent.change(box, { target: { value: 'bad name' } })
    fireEvent.submit(box.closest('form')!)
    expect(await screen.findByText('文件名不能含空格')).toBeTruthy()
    expect(promiseDialogStore.getState().pending).not.toBeNull()
    expect(screen.getByTestId('result').textContent).toBe('')
  })

  it('空/纯空白输入禁用提交', async () => {
    render(<PromptBench />)
    fireEvent.click(screen.getByTestId('open'))
    const box = (await screen.findByRole('textbox')) as HTMLInputElement
    fireEvent.change(box, { target: { value: '   ' } })
    const submit = screen.getByText('确认').closest('button')!
    expect(submit.disabled).toBe(true)
  })

  it('dismissTopModal(ESC 单源)→ resolve null', async () => {
    render(<PromptBench />)
    fireEvent.click(screen.getByTestId('open'))
    await screen.findByRole('textbox')
    act(() => {
      useUiStore.getState().dismissTopModal()
    })
    await screen.findByText('null', { selector: '[data-testid="result"]' })
  })
})

describe('promptDialog(全局 host)', () => {
  beforeEach(resetStores)

  it('promptDialog 由 PromptDialogHost 渲染并 resolve', async () => {
    render(<PromptDialogHost />)
    let result: string | null | undefined
    act(() => {
      void promptDialog({ title: '重命名文件', defaultValue: 'a.gal' }).then((v) => {
        result = v
      })
    })
    expect(await screen.findByText('重命名文件')).toBeTruthy()
    fireEvent.click(screen.getByText('确认'))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result).toBe('a.gal')
  })
})
