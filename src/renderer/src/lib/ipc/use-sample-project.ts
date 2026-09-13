import { useCallback, useState } from 'react'
import { useErrorStore, useUiStore } from '../store'

const SAMPLE_PROJECT_NAME = 'Galide示例项目'

const SAMPLE_FILES: Record<string, string> = {
  'chapter1.gal': `# 第一章：初识

## 开场
旁白: "欢迎来到 Galide 示例项目。"
旁白: "本示例展示 scene、dialogue、choice 与 goto 的基础用法。"

* "开始旅程" -> 相遇
* "跳过介绍" -> 相遇
`,
  'chapter2.gal': `# 第二章：相遇

## 相遇
[角色:小雪 | 立绘:xiaoxue_default.png | 位置:中]
小雪: "你好!欢迎来到 Galide。"
主角: "你好,这里是什么地方?"

* "一个创作文字游戏的 IDE" -> 结局·真相
* "一个魔法世界" -> 结局·幻想
* "保持沉默" -> 结局·沉默

## 结局·真相
小雪: "没错,Galide 是 AI-native 的 Galgame IDE。"
旁白: "现在,开始书写你的故事吧。"

## 结局·幻想
小雪: "也许创作本身就是一种魔法。"
旁白: "你的想象力就是边界。"

## 结局·沉默
小雪: "……"
旁白: "有时候,沉默也是一种答案。"
`
}

export const useSampleProject = () => {
  const setProject = useUiStore((s) => s.setProject)
  const pushError = useErrorStore((s) => s.push)
  const [busy, setBusy] = useState(false)

  const create = useCallback(async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const dir = await window.galide.dialog.chooseDirectory({ title: '选择示例项目存放位置' })
      if (!dir.ok || dir.canceled || !dir.path) return

      const projectPath = `${dir.path}/${SAMPLE_PROJECT_NAME}`
      const result = await window.galide.project.createAtPath({ name: SAMPLE_PROJECT_NAME, projectPath })
      if (!result.ok) {
        if (result.error && result.error !== 'canceled') {
          pushError({ code: 'PROJECT_CREATE_FAILED', message: result.error, source: 'project:createAtPath' })
        }
        return
      }
      if (!result.manifest) return

      for (const [fileName, content] of Object.entries(SAMPLE_FILES)) {
        const writeResult = await window.galide.script.write(projectPath, fileName, content)
        if (!writeResult.ok && writeResult.error) {
          pushError({ code: 'SCRIPT_WRITE_FAILED', message: writeResult.error, source: 'script:write' })
          return
        }
      }

      setProject(projectPath, result.manifest)
      await window.galide.project.recordRecent({ path: projectPath, name: result.manifest.name })
    } catch (err) {
      pushError({
        code: 'IPC_ERROR',
        message: err instanceof Error ? err.message : String(err),
        source: 'sample-project:create'
      })
    } finally {
      setBusy(false)
    }
  }, [busy, setProject, pushError])

  return { create, busy }
}
