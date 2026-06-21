/**
 * Web Composer — 导出为单 HTML5 文件
 * 内联 lite 播放器 + 复制 assets 目录;玩家浏览器打开 index.html 即可游玩,零安装
 *
 * Batch 3 重构:消费 ctx.asts(主解析器 AST),序列化为预计算场景图。
 * Preview-fidelity: 播放器复用 shared/preview/runtime-vm 跳转/标记语义。
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Composer, ExportContext, MultiFileOutput } from './composer.js'
import type { ScriptNode, SceneNode } from '../../shared/dsl/types.js'
import { buildVmGraph, buildPlayerRuntimeFunctions } from '../../shared/preview/runtime-vm.js'

/** 安全 JSON 内联:转义 `<` 防 `</script>` 注入 */
const safeJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

const buildHtmlShell = (graphJson: string, vmFunctions: string): string => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Galide Player</title>
  <style>
    body { margin: 0; background: #000; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; }
    #app { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
    #stage { position: relative; width: 1280px; height: 720px; max-width: 100vw; max-height: 100vh; overflow: hidden; }
    #bg { position: absolute; inset: 0; background: #1a1a1a center/cover no-repeat; }
    #sprites { position: absolute; inset: 0; pointer-events: none; }
    .sprite { position: absolute; bottom: 0; max-height: 85%; object-fit: contain; }
    .sprite-left { left: 8%; }
    .sprite-center { left: 50%; transform: translateX(-50%); }
    .sprite-right { right: 8%; }
    .dialogue { position: absolute; bottom: 40px; left: 40px; right: 40px; background: rgba(0,0,0,0.7); padding: 24px; border-radius: 8px; min-height: 100px; cursor: pointer; z-index: 2; }
    .character { color: #a78bfa; font-weight: bold; margin-bottom: 8px; }
    .text { font-size: 20px; line-height: 1.6; }
    .choices { position: absolute; bottom: 200px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 12px; z-index: 2; }
    .choice { background: rgba(167, 139, 250, 0.2); border: 1px solid #a78bfa; padding: 12px 24px; border-radius: 4px; cursor: pointer; }
    .choice:hover { background: rgba(167, 139, 250, 0.4); }
    .beat-label { position: absolute; bottom: 40px; left: 40px; right: 40px; padding: 24px; border-radius: 8px; cursor: pointer; z-index: 2; font-family: monospace; }
    .beat-marker { background: rgba(180, 83, 9, 0.6); border: 1px solid rgba(251, 191, 36, 0.4); }
    .beat-goto { background: rgba(91, 33, 182, 0.6); border: 1px solid rgba(167, 139, 250, 0.4); }
    .unsupported { position: absolute; top: 12px; left: 12px; right: 12px; background: rgba(127,29,29,0.8); padding: 8px; border-radius: 4px; font-size: 12px; z-index: 3; }
  </style>
</head>
<body>
  <div id="app"><div id="stage"><div id="bg"></div><div id="sprites"></div></div></div>
  <script>
    const VM_GRAPH = ${graphJson};
    ${vmFunctions}

    let vmState = { sceneId: VM_GRAPH.sceneOrder[0] || Object.keys(VM_GRAPH.scenes)[0] || '', stepIndex: 0, variables: {} };
    let currentSpriteKey = null;
    let errorBanner = null;

    const assetUrl = (rel) => rel ? ('assets/' + rel.replace(/^assets\\//, '')) : null;

    const positionClass = (pos) => {
      if (pos === 'left') return 'sprite-left';
      if (pos === 'right') return 'sprite-right';
      return 'sprite-center';
    };

    const showError = (msg) => {
      const stage = document.getElementById('stage');
      if (!errorBanner) {
        errorBanner = document.createElement('div');
        errorBanner.className = 'unsupported';
        stage.appendChild(errorBanner);
      }
      errorBanner.textContent = msg;
    };

    const clearError = () => {
      if (errorBanner) errorBanner.remove();
      errorBanner = null;
    };

    const updateBackground = (scene) => {
      const bg = document.getElementById('bg');
      if (scene && scene.background) {
        bg.style.backgroundImage = 'url(' + assetUrl(scene.background) + ')';
      } else {
        bg.style.backgroundImage = '';
      }
    };

    const updateSprite = (step) => {
      const layer = document.getElementById('sprites');
      layer.innerHTML = '';
      if (!step || step.type !== 'dialogue' || !step.sprite) return;
      const key = step.sprite + '|' + (step.position || 'center');
      if (currentSpriteKey === key) return;
      currentSpriteKey = key;
      const img = document.createElement('img');
      img.className = 'sprite ' + positionClass(step.position);
      img.src = assetUrl(step.sprite);
      img.alt = step.character;
      layer.appendChild(img);
    };

    const render = () => {
      const stage = document.getElementById('stage');
      stage.querySelectorAll('.dialogue, .choices, .beat-label').forEach((el) => el.remove());
      clearError();

      const scene = VM_GRAPH.scenes[vmState.sceneId];
      if (!scene) return;
      updateBackground(scene);

      const step = getCurrentStep(VM_GRAPH, vmState);
      if (!step) {
        const done = document.createElement('div');
        done.className = 'dialogue';
        done.textContent = '场景播放完毕';
        stage.appendChild(done);
        return;
      }

      updateSprite(step);

      if (step.type === 'dialogue') {
        const d = document.createElement('div');
        d.className = 'dialogue';
        const ch = document.createElement('div');
        ch.className = 'character';
        ch.textContent = step.character;
        const tx = document.createElement('div');
        tx.className = 'text';
        tx.textContent = step.text;
        d.appendChild(ch);
        d.appendChild(tx);
        d.onclick = () => {
          const r = advanceVm(VM_GRAPH, vmState);
          if (r.ok && !r.finished) { vmState = r.state; render(); }
        };
        stage.appendChild(d);
      }

      if (step.type === 'choice') {
        const c = document.createElement('div');
        c.className = 'choices';
        for (const opt of step.options) {
          const btn = document.createElement('div');
          btn.className = 'choice';
          btn.textContent = opt.text;
          btn.onclick = () => {
            const jumped = jumpToTarget(VM_GRAPH, vmState, opt.target);
            if (jumped.ok) { vmState = jumped.state; render(); }
            else showError(jumped.error);
          };
          c.appendChild(btn);
        }
        stage.appendChild(c);
      }

      if (step.type === 'marker') {
        const m = document.createElement('div');
        m.className = 'beat-label beat-marker';
        m.textContent = '标记: ' + step.id + ' (点击继续)';
        m.onclick = () => {
          const r = advanceVm(VM_GRAPH, vmState);
          if (r.ok && !r.finished) { vmState = r.state; render(); }
        };
        stage.appendChild(m);
      }

      if (step.type === 'goto') {
        const g = document.createElement('div');
        g.className = 'beat-label beat-goto';
        g.textContent = '跳转 → ' + step.target + ' (点击执行)';
        g.onclick = () => {
          const jumped = executeGotoStep(VM_GRAPH, vmState, step);
          if (jumped.ok) { vmState = jumped.state; render(); }
          else showError(jumped.error);
        };
        stage.appendChild(g);
      }
    };

    render();
  </script>
</body>
</html>`

const mergeAsts = (asts: ExportContext['asts']): ScriptNode => {
  const merged: ScriptNode = { type: 'script', line: 1, column: 1, children: [], errors: [] }
  for (const entry of asts) {
    for (const child of entry.ast.children) {
      if (child.type === 'scene') {
        const existing = merged.children.findIndex(
          (c) => c.type === 'scene' && (c as SceneNode).id === (child as SceneNode).id
        )
        if (existing >= 0) {
          merged.children[existing] = child
        } else {
          merged.children.push(child)
        }
      } else {
        merged.children.push(child)
      }
    }
  }
  return merged
}

export interface WebAst {
  readonly html: string
}

export class WebComposer implements Composer<WebAst, MultiFileOutput> {
  readonly name = 'web' as const
  readonly defaultFilename = 'index.html'

  async transform(ctx: ExportContext): Promise<WebAst> {
    const merged = mergeAsts(ctx.asts)
    const graph = buildVmGraph(merged)
    const graphJson = safeJson(graph)
    const vmFunctions = buildPlayerRuntimeFunctions()

    const assetsOutDir = join(ctx.outputDir, 'assets')
    await fs.mkdir(assetsOutDir, { recursive: true })
    const assetsSrcDir = join(ctx.request.projectPath, 'assets')
    try {
      await fs.cp(assetsSrcDir, assetsOutDir, { recursive: true })
    } catch (err) {
      console.warn(`[galide export] assets 目录复制失败: ${assetsSrcDir}`, err)
    }

    const html = buildHtmlShell(graphJson, vmFunctions)
    return { html }
  }

  emit(target: WebAst, _ctx: ExportContext): MultiFileOutput {
    return { kind: 'multi', files: [{ path: 'index.html', content: target.html }] }
  }
}
