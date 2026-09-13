/**
 * vm backlog / read-state 单测 — 回看推导与已读标记(浏览器可嵌入函数)
 */
import { describe, it, expect } from 'vitest'
import { parse } from '../dsl/parser.js'
import { buildVmGraph } from './runtime-vm.js'
import {
  advanceVm,
  jumpToTarget,
  buildBacklog,
  dialogueLineId,
  markRead,
  isRead,
  MAX_READ_LINE_IDS
} from './runtime-vm.js'

const src = `## s1
小雪: "第一句"
小雪: "第二句"
[跳转:s2]

## s2
阳: "第三句"
`

const build = () => {
  const r = parse(src)
  if (!r.ok) throw new Error('fixture parse failed')
  return buildVmGraph(r.value)
}

describe('buildBacklog', () => {
  it('从历史推导对白列表,过滤非 dialogue 步', async () => {
    const graph = build()
    let state = {
      sceneId: graph.sceneOrder[0]!,
      stepIndex: 0,
      variables: {}
    }
    // 前进过 第一句 / 第二句;goto 步用 executeGotoStep 跳到 s2;再过 第三句
    const r1 = advanceVm(graph, state)
    if (r1.ok) state = r1.state
    const r2 = advanceVm(graph, state)
    if (r2.ok) state = r2.state
    const jumped = jumpToTarget(graph, state, 's2')
    if (jumped.ok) state = jumped.state
    const r3 = advanceVm(graph, state)
    if (r3.ok) state = r3.state
    const backlog = buildBacklog(graph, state)
    expect(backlog.map((b) => b.text)).toEqual(['第一句', '第二句', '第三句'])
    expect(backlog[0]).toMatchObject({ sceneId: 's1', character: '小雪' })
    expect(backlog[2]).toMatchObject({ sceneId: 's2', character: '阳' })
  })

  it('空历史 → 空回看', () => {
    const graph = build()
    expect(buildBacklog(graph, { sceneId: 's1', stepIndex: 0, variables: {} })).toEqual([])
  })
})

describe('read state', () => {
  it('标记/查询/去重', () => {
    const id = dialogueLineId('s1', '小雪', '第一句')
    let read = { readLineIds: [] as string[] }
    expect(isRead(read, id)).toBe(false)
    read = markRead(read, id)
    expect(isRead(read, id)).toBe(true)
    const before = read.readLineIds.length
    read = markRead(read, id)
    expect(read.readLineIds.length).toBe(before)
  })

  it('容量上限截断保留最新', () => {
    let read = { readLineIds: [] as string[] }
    for (let i = 0; i < MAX_READ_LINE_IDS + 50; i++) {
      read = markRead(read, `line-${i}`)
    }
    expect(read.readLineIds.length).toBe(MAX_READ_LINE_IDS)
    expect(isRead(read, 'line-0')).toBe(false)
    expect(isRead(read, `line-${MAX_READ_LINE_IDS + 49}`)).toBe(true)
  })
})
