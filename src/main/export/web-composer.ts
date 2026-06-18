/**
 * Web Composer — 导出为单 HTML5 文件
 * 内联 lite 播放器 + 复制 assets 目录;玩家浏览器打开 index.html 即可游玩,零安装
 *
 * Batch 3 重构:播放器不再内联 parseScript(那是一份与主解析器漂移的第三套规则),
 * 改为消费 ctx.asts(export-handlers 已用主解析器解析好的 AST),序列化为预计算
 * 场景图内联进 HTML。这样「同一份 .gal 在编辑器/FlowView/Preview/导出播放器里
 * 语义一致」,符合 canonical artifact 哲学。
 *
 * 安全:用户文本(对白/角色名)经 JSON.stringify + `<` 转义内联,播放器运行时用
 * textContent 渲染,杜绝 XSS(对比旧版 innerHTML 拼接)。
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Composer, ExportContext, MultiFileOutput } from './composer.js'
import type {
  ChoiceNode,
  DialogueNode,
  SceneNode
} from '../../shared/dsl/types.js'

/** 播放器场景图 item — 对白 / 选项 */
type WebItem =
  | { type: 'dialogue'; character: string; text: string; sprite?: string; position?: string }
  | { type: 'choice'; options: { text: string; target: string }[] }

/** 播放器场景图 */
type WebScene = {
  id: string
  background?: string
  bgm?: string
  items: WebItem[]
}

/** 把单个 SceneNode 转成播放器场景图(只取 dialogue + choice,跳过 goto/marker/comment) */
const toWebScene = (scene: SceneNode): WebScene => {
  const items: WebItem[] = []
  for (const child of scene.children) {
    if (child.type === 'dialogue') {
      const d = child as DialogueNode
      items.push({
        type: 'dialogue',
        character: d.character,
        text: d.lines[0] ?? '',
        ...(d.sprite !== undefined ? { sprite: d.sprite } : {}),
        ...(d.position !== undefined ? { position: d.position } : {})
      })
    } else if (child.type === 'choice') {
      const c = child as ChoiceNode
      items.push({ type: 'choice', options: c.options })
    }
  }
  return {
    id: scene.id,
    ...(scene.background !== undefined ? { background: scene.background } : {}),
    ...(scene.bgm !== undefined ? { bgm: scene.bgm } : {}),
    items
  }
}

/** 安全 JSON 内联:转义 `<` 防 `</script>` 注入 */
const safeJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

const buildHtmlShell = (scenes: Record<string, WebScene>): string => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Galide Player</title>
  <style>
    body { margin: 0; background: #000; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; }
    #app { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
    #stage { position: relative; width: 1280px; height: 720px; max-width: 100vw; max-height: 100vh; }
    .dialogue { position: absolute; bottom: 40px; left: 40px; right: 40px; background: rgba(0,0,0,0.7); padding: 24px; border-radius: 8px; min-height: 100px; }
    .character { color: #a78bfa; font-weight: bold; margin-bottom: 8px; }
    .text { font-size: 20px; line-height: 1.6; }
    .choices { position: absolute; bottom: 200px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 12px; }
    .choice { background: rgba(167, 139, 250, 0.2); border: 1px solid #a78bfa; padding: 12px 24px; border-radius: 4px; cursor: pointer; }
    .choice:hover { background: rgba(167, 139, 250, 0.4); }
  </style>
</head>
<body>
  <div id="app"><div id="stage"></div></div>
  <script>
    const SCENES = ${safeJson(scenes)};
    ${playerRuntime}
  </script>
</body>
</html>`

const playerRuntime = `
let currentScene = null;
let cursor = 0;

const render = () => {
  const stage = document.getElementById('stage');
  stage.innerHTML = '';
  if (!currentScene) {
    const first = Object.keys(SCENES)[0];
    currentScene = SCENES[first];
    cursor = 0;
  }
  if (!currentScene) return;
  const item = currentScene.items[cursor];
  if (!item) return;
  if (item.type === 'dialogue') {
    const d = document.createElement('div');
    d.className = 'dialogue';
    const ch = document.createElement('div');
    ch.className = 'character';
    ch.textContent = item.character;
    const tx = document.createElement('div');
    tx.className = 'text';
    tx.textContent = item.text;
    d.appendChild(ch);
    d.appendChild(tx);
    stage.appendChild(d);
    d.onclick = () => { cursor++; render(); };
  }
  if (item.type === 'choice') {
    const c = document.createElement('div');
    c.className = 'choices';
    for (const opt of item.options) {
      const btn = document.createElement('div');
      btn.className = 'choice';
      btn.textContent = opt.text;
      btn.onclick = () => {
        if (SCENES[opt.target]) {
          currentScene = SCENES[opt.target];
          cursor = 0;
          render();
        }
      };
      c.appendChild(btn);
    }
    stage.appendChild(c);
  }
};

render();
`

export interface WebAst {
  readonly html: string
}

export class WebComposer implements Composer<WebAst, MultiFileOutput> {
  readonly name = 'web' as const
  readonly defaultFilename = 'index.html'

  async transform(ctx: ExportContext): Promise<WebAst> {
    // 消费 ctx.asts(export-handlers 已解析),不再自行读 .gal 原文
    const scenes: Record<string, WebScene> = {}
    for (const entry of ctx.asts) {
      for (const child of entry.ast.children) {
        if (child.type === 'scene') {
          const ws = toWebScene(child as SceneNode)
          // 同名场景后者覆盖(与主解析器合并语义一致)
          scenes[ws.id] = ws
        }
      }
    }
    // 复制 assets 目录到 outputDir/assets
    const assetsOutDir = join(ctx.outputDir, 'assets')
    await fs.mkdir(assetsOutDir, { recursive: true })
    const assetsSrcDir = join(ctx.request.projectPath, 'assets')
    try {
      await fs.cp(assetsSrcDir, assetsOutDir, { recursive: true })
    } catch (err) {
      // 资源目录可能不存在 — 留 warn 便于排错
      console.warn(`[galide export] assets 目录复制失败: ${assetsSrcDir}`, err)
    }
    const html = buildHtmlShell(scenes)
    return { html }
  }

  emit(target: WebAst, _ctx: ExportContext): MultiFileOutput {
    return { kind: 'multi', files: [{ path: 'index.html', content: target.html }] }
  }
}
