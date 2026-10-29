/**
 * 确定性种子化 .gal 基准测试 fixture 生成器
 *
 * 严格固定 PRNG 种子,确保 baseline 与回归对比在完全一致的输入规模上运行。
 */

export const BENCH_DEFAULT_SEED = 20260719

export const createSeededRandom = (seed: number = BENCH_DEFAULT_SEED): (() => number) => {
  let state = seed >>> 0
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CHARACTERS = ['苏晚晴', '陆离', '林小雪', '陈默'] as const
const POSITIONS = ['左', '中', '右'] as const
const SPRITES = ['calm.png', 'smile.png', 'serious.png', 'surprised.png'] as const

/** 生成至少 targetLines 行的确定性 .gal 剧本(覆盖全语法节点与少量 warning 诊断行) */
export const generateGalScriptByLines = (
  targetLines: number,
  seed: number = BENCH_DEFAULT_SEED,
  scenePrefix: string = 'scene'
): { source: string; lineCount: number } => {
  const rand = createSeededRandom(seed)
  const lines: string[] = ['# 性能基准剧本', '']
  let sceneIdx = 0

  while (lines.length < targetLines) {
    const sceneId = `${scenePrefix}_${sceneIdx}`
    const nextSceneId = `${scenePrefix}_${sceneIdx + 1}`
    const charA = CHARACTERS[Math.floor(rand() * CHARACTERS.length)] ?? '苏晚晴'
    const charB = CHARACTERS[Math.floor(rand() * CHARACTERS.length)] ?? '陆离'
    const pos = POSITIONS[Math.floor(rand() * POSITIONS.length)] ?? '左'
    const sprite = SPRITES[Math.floor(rand() * SPRITES.length)] ?? 'calm.png'
    const delta = 1 + Math.floor(rand() * 5)
    const threshold = 2 + Math.floor(rand() * 10)

    lines.push(`## ${sceneId}`)
    lines.push(`背景: assets/backgrounds/bg_${sceneIdx % 4}.png`)
    lines.push(`BGM: assets/bgm/theme_${sceneIdx % 3}.mp3`)
    lines.push(`[登场:${charA} | 立绘:assets/sprites/${sprite} | 位置:${pos}]`)
    lines.push(`设: affinity += ${delta}`)
    lines.push(`设: visited_${sceneIdx % 8} = true`)

    const beatLoops = 4 + Math.floor(rand() * 4)
    for (let b = 0; b < beatLoops && lines.length < targetLines; b++) {
      const speaker = b % 2 === 0 ? charA : charB
      lines.push(`[角色:${speaker} | 立绘:assets/sprites/${sprite} | 位置:${pos}]`)
      lines.push(`${speaker}: "第 ${sceneIdx} 幕第 ${b} 拍测试对白,用于衡量解析器与运行时吞吐。"`)
    }

    lines.push(`[若: affinity >= ${threshold}]`)
    lines.push(`${charA}: "好感度已达到阈值 ${threshold}。"`)
    lines.push(`设: bonus += 1`)
    lines.push('[否则]')
    lines.push(`${charB}: "仍需继续积累线索。"`)
    lines.push('[若终]')
    lines.push(`=== ${sceneId}_anchor ===`)
    lines.push(`* "前往下一幕" -> ${nextSceneId} [当: affinity >= 0]`)
    lines.push(`[退场:${charA}]`)
    lines.push(`[跳转:${nextSceneId}]`)
    lines.push('')
    sceneIdx++
  }

  // 收尾终点场景,确保跳转目标存在且无悬挂引用
  lines.push(`## ${scenePrefix}_${sceneIdx}`)
  lines.push('苏晚晴: "基准剧本终点。"')
  lines.push('')

  const source = lines.join('\n')
  return { source, lineCount: lines.length }
}

/** 生成专供 VM 连续推进至少 minSteps 步的确定性剧本 */
export const generateVmTimelineScript = (
  minSteps: number = 1200,
  seed: number = BENCH_DEFAULT_SEED
): string => {
  const rand = createSeededRandom(seed)
  const lines: string[] = ['# VM 推进基准', '## vm_scene_0', '设: counter = 0']
  let generatedSteps = 1
  let sceneIdx = 0

  while (generatedSteps < minSteps) {
    if (generatedSteps > 0 && generatedSteps % 120 === 0) {
      const nextScene = `vm_scene_${sceneIdx + 1}`
      lines.push(`[跳转:${nextScene}]`)
      lines.push('')
      lines.push(`## ${nextScene}`)
      sceneIdx++
      generatedSteps += 1
    }
    const speaker = CHARACTERS[Math.floor(rand() * CHARACTERS.length)] ?? '苏晚晴'
    lines.push(`设: counter += 1`)
    lines.push(`[登场:${speaker} | 立绘:assets/sprites/calm.png | 位置:左]`)
    lines.push(`${speaker}: "推进节点 #${generatedSteps}"`)
    lines.push(`[若: counter >= 2]`)
    lines.push(`${speaker}: "条件分支内对白 #${generatedSteps}"`)
    lines.push('[否则]')
    lines.push(`${speaker}: "初始分支内对白 #${generatedSteps}"`)
    lines.push('[若终]')
    lines.push(`=== mk_${generatedSteps} ===`)
    generatedSteps += 5
  }

  return lines.join('\n')
}

/** 生成多文件项目 fixture (fileName -> source) */
export const generateMultiFileFixtures = (
  fileCount: number,
  linesPerFile: number,
  seed: number = BENCH_DEFAULT_SEED
): Record<string, string> => {
  const out: Record<string, string> = {}
  for (let i = 0; i < fileCount; i++) {
    const fileName = `chapter_${String(i + 1).padStart(2, '0')}.gal`
    const { source } = generateGalScriptByLines(linesPerFile, seed + i * 97, `ch${i + 1}_sc`)
    out[fileName] = source
  }
  return out
}
