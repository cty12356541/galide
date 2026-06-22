import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CharacterCardEditor } from './CharacterCardEditor'
import type { CharacterCard } from '../../../../shared/types'

const baseCharacter: CharacterCard = {
  id: 'koyuki',
  name: '小雪',
  description: '转学生',
  personality: '文静',
  spriteSet: [{ state: '默认', path: 'assets/characters/koyuki.png' }]
}

describe('CharacterCardEditor', () => {
  it('SD Prompt 字段写入 sdPrompt 而非 spriteSet.path', () => {
    const onSave = vi.fn()
    render(<CharacterCardEditor character={baseCharacter} onClose={() => {}} onSave={onSave} />)

    const promptField = screen.getByPlaceholderText(/1girl/)
    fireEvent.change(promptField, { target: { value: 'anime girl, blue hair' } })

    fireEvent.click(screen.getByText('保存'))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sdPrompt: 'anime girl, blue hair',
        spriteSet: [{ state: '默认', path: 'assets/characters/koyuki.png' }]
      })
    )
  })
})
