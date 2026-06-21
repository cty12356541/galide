/**
 * command-registry 单测(P0:打通快捷键录制链路)
 *
 * 覆盖核心不变量:
 *   - parseAccelerator 解析修饰键 + 主键
 *   - acceleratorMatches 精确匹配修饰键(有则必按,无则不能按),主键大小写不敏感
 *   - effectiveShortcut 用户覆盖优先于默认;皆空返回 null
 *   - 默认表无冲突(每条 accelerator 唯一)
 */
import { describe, it, expect } from 'vitest'
import {
  parseAccelerator,
  acceleratorMatches,
  effectiveShortcut,
  COMMANDS,
  DEFAULT_SHORTCUTS,
  type CommandId
} from './command-registry.js'

describe('command-registry — P0 录制链路', () => {
  it('parseAccelerator 解析修饰键 + 主键', () => {
    expect(parseAccelerator('Meta+K')).toEqual({
      ctrl: false,
      meta: true,
      alt: false,
      shift: false,
      key: 'K'
    })
    expect(parseAccelerator('Ctrl+Shift+Z')).toEqual({
      ctrl: true,
      meta: false,
      alt: false,
      shift: true,
      key: 'Z'
    })
    expect(parseAccelerator('Meta+,')).toEqual({
      ctrl: false,
      meta: true,
      alt: false,
      shift: false,
      key: ','
    })
  })

  it('parseAccelerator 非法输入返回 null', () => {
    expect(parseAccelerator('')).toBeNull()
    expect(parseAccelerator('Foo+K')).toBeNull()
  })

  it('acceleratorMatches 精确匹配修饰键', () => {
    const e = { ctrlKey: false, metaKey: true, altKey: false, shiftKey: false, key: 'k' }
    expect(acceleratorMatches('Meta+K', e)).toBe(true)
    // 多按了 shift → 不匹配
    expect(acceleratorMatches('Meta+K', { ...e, shiftKey: true })).toBe(false)
    // 少按 meta → 不匹配
    expect(acceleratorMatches('Meta+K', { ...e, metaKey: false })).toBe(false)
  })

  it('acceleratorMatches 主键大小写不敏感', () => {
    const e = { ctrlKey: false, metaKey: true, altKey: false, shiftKey: false, key: 'P' }
    expect(acceleratorMatches('Meta+p', e)).toBe(true)
  })

  it('effectiveShortcut 用户覆盖优先于默认', () => {
    expect(effectiveShortcut('commandPalette', undefined)).toBe('Meta+K')
    expect(effectiveShortcut('commandPalette', {})).toBe('Meta+K')
    // 用户改键
    expect(effectiveShortcut('commandPalette', { commandPalette: 'Ctrl+Shift+P' })).toBe(
      'Ctrl+Shift+P'
    )
    // 用户置空 → 回退默认(空字符串视为未设)
    expect(effectiveShortcut('commandPalette', { commandPalette: '   ' })).toBe('Meta+K')
  })

  it('effectiveShortcut 未知命令返回 undefined(无默认)', () => {
    // 未知 id 不在默认表 → undefined(键盘 hook 据"无 acc"跳过)
    expect(effectiveShortcut('nonexistent' as CommandId, undefined)).toBeUndefined()
  })

  it('默认快捷键表无冲突(每条非空 accelerator 唯一)', () => {
    const accs = Object.values(DEFAULT_SHORTCUTS).filter((a): a is string => a !== null)
    expect(new Set(accs).size).toBe(accs.length)
  })

  it('COMMANDS 含核心命令', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(ids).toContain('commandPalette')
    expect(ids).toContain('goToFile')
    expect(ids).toContain('newScriptFile')
    expect(ids).toContain('undo')
    expect(ids).toContain('redo')
  })
})
