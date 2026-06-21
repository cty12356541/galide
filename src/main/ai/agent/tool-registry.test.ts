/**
 * tool-registry 单测
 *
 * 覆盖:schema 校验拒非法入参、risk/domain 标注、FakeTool 调用记录、JSON schema 导出。
 */
import { describe, it, expect } from 'vitest'
import * as z from 'zod/v4'
import {
  createToolRegistry,
  defineTool,
  type ToolContext,
  type ToolHandlerResult
} from './tool-registry.js'

const ctx: ToolContext = {
  projectPath: '/proj',
  fs: {
    readFile: async () => '',
    writeFile: async () => undefined,
    readdir: async () => []
  }
}

const makeFakeTool = (): {
  tool: ReturnType<typeof defineTool>
  calls: Array<{ value: number }>
} => {
  const calls: Array<{ value: number }> = []
  const tool = defineTool({
    name: 'fake_add',
    description: '记录调用的假工具',
    risk: 'safeWrite',
    domain: 'disk',
    schema: z.object({ value: z.number().int() }),
    handler: async (args): Promise<ToolHandlerResult> => {
      calls.push(args)
      return { ok: true, content: `got ${args.value}` }
    }
  })
  return { tool, calls }
}

describe('tool-registry', () => {
  it('暴露 risk/domain 标注', () => {
    const { tool } = makeFakeTool()
    const reg = createToolRegistry([tool])
    const def = reg.get('fake_add')
    expect(def?.risk).toBe('safeWrite')
    expect(def?.domain).toBe('disk')
  })

  it('execute 校验通过 → 调用 handler 并记录(FakeTool)', async () => {
    const { tool, calls } = makeFakeTool()
    const reg = createToolRegistry([tool])
    const result = await reg.execute({ id: 'c1', name: 'fake_add', args: { value: 7 } }, ctx)
    expect(result.ok).toBe(true)
    expect(result.id).toBe('c1')
    expect(result.content).toContain('7')
    expect(calls).toEqual([{ value: 7 }])
  })

  it('execute 校验失败(非法入参) → SCHEMA_FAILED,不调用 handler', async () => {
    const { tool, calls } = makeFakeTool()
    const reg = createToolRegistry([tool])
    const result = await reg.execute({ id: 'c2', name: 'fake_add', args: { value: 'oops' } }, ctx)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('SCHEMA_FAILED')
    expect(calls).toHaveLength(0)
  })

  it('未知工具 → UNKNOWN_TOOL', async () => {
    const reg = createToolRegistry([])
    const result = await reg.execute({ id: 'c3', name: 'nope', args: {} }, ctx)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('UNKNOWN_TOOL')
  })

  it('toJsonSchemas 导出 name/description/parameters', () => {
    const { tool } = makeFakeTool()
    const reg = createToolRegistry([tool])
    const schemas = reg.toJsonSchemas()
    expect(schemas).toHaveLength(1)
    expect(schemas[0]?.name).toBe('fake_add')
    expect(schemas[0]?.description).toContain('假工具')
    expect(schemas[0]?.parameters).toBeTypeOf('object')
  })

  it('register 后可被 list/get 查到', () => {
    const reg = createToolRegistry([])
    const { tool } = makeFakeTool()
    reg.register(tool)
    expect(reg.list().map((t) => t.name)).toContain('fake_add')
  })
})
