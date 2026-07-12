import { describe, it, expect } from 'vitest'
import { formatSaveSlotLabel } from './formatSaveSlotLabel'

describe('formatSaveSlotLabel', () => {
  it('shows empty label for unoccupied slots', () => {
    expect(formatSaveSlotLabel(1, false, null, null)).toBe('槽 1 (空)')
  })

  it('shows scene name and formatted timestamp for occupied slots', () => {
    const label = formatSaveSlotLabel(1, true, 'sceneA', '2026-07-12T10:30:00.000Z', 'Scene A')
    expect(label).toContain('Scene A')
    expect(label).toMatch(/7\s*月\s*12\s*日/)
    expect(label).toMatch(/\d{1,2}:30/)
  })

  it('falls back to sceneId when sceneName is missing', () => {
    const label = formatSaveSlotLabel(2, true, 'sceneB', '2026-07-12T10:30:00.000Z')
    expect(label).toContain('sceneB')
  })

  it('falls back to raw timestamp when date is invalid', () => {
    expect(formatSaveSlotLabel(3, true, 'sceneC', 'not-a-date')).toBe('sceneC · not-a-date')
  })
})
