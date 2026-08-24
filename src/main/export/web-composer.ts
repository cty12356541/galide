/**
 * Web Composer — 导出为单 HTML5 文件
 * 内联 lite 播放器 + 复制 assets 目录;玩家浏览器打开 index.html 即可游玩,零安装
 *
 * Batch 3 重构:消费 ctx.asts(主解析器 AST),序列化为预计算场景图。
 * Preview-fidelity: 播放器复用 shared/preview/runtime-vm 跳转/标记语义。
 */

import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import type { Composer, ExportContext, MultiFileOutput } from './composer.js'
import { buildVmGraph, buildPlayerRuntimeFunctions } from '../../shared/preview/runtime-vm.js'
import { buildPlayerSaveFunctions } from '../../shared/preview/vm-save.js'
import { mergeScriptAsts } from '../../shared/dsl/merge-scripts.js'

/** 安全 JSON 内联:转义 `<` 防 `</script>` 注入 */
const safeJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

const buildHtmlShell = (graphJson: string, vmFunctions: string, saveFunctions: string, projectId: string): string => `<!DOCTYPE html>
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
    .save-bar { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; z-index: 4; }
    .save-btn { background: rgba(0,0,0,0.6); border: 1px solid rgba(167,139,250,0.4); color: #fff; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
    .save-btn:hover { background: rgba(167,139,250,0.3); }
    .save-toast { position: absolute; top: 44px; right: 12px; background: rgba(6,78,59,0.85); padding: 6px 10px; border-radius: 4px; font-size: 11px; z-index: 4; }
    .ctrl-bar { position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; z-index: 4; }
    .ctrl-btn { background: rgba(0,0,0,0.6); border: 1px solid rgba(167,139,250,0.4); color: #fff; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
    .ctrl-btn:hover { background: rgba(167,139,250,0.3); }
    .ctrl-btn.on { background: rgba(167,139,250,0.55); border-color: #a78bfa; }
    .backlog { position: absolute; inset: 0; background: rgba(0,0,0,0.75); z-index: 5; display: flex; flex-direction: column; padding: 24px; box-sizing: border-box; }
    .backlog h3 { margin: 0 0 12px; font-size: 14px; color: #ddd; font-weight: 600; }
    .backlog-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 8px; }
    .backlog-item { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 8px 12px; }
    .backlog-item .character { margin-bottom: 2px; font-size: 12px; }
    .backlog-item .text { font-size: 15px; }
    .backlog-close { position: absolute; top: 20px; right: 20px; }
  </style>
</head>
<body>
  <div id="app"><div id="stage"><div id="bg"></div><div id="sprites"></div>
    <div class="save-bar" id="save-bar"></div>
    <div class="ctrl-bar" id="ctrl-bar"></div>
  </div></div>
  <script>
    const VM_GRAPH = ${graphJson};
    const PROJECT_ID = ${safeJson(projectId)};
    ${vmFunctions}
    ${saveFunctions}

    let vmState = { sceneId: VM_GRAPH.sceneOrder[0] || Object.keys(VM_GRAPH.scenes)[0] || '', stepIndex: 0, variables: {} };
    let errorBanner = null;
    let saveToast = null;
    let autoTimer = null;
    let autoSpeedIdx = 0;
    const AUTO_SPEEDS = [1500, 1000, 600];
    const AUTO_LABELS = ['慢', '中', '快'];
    let skipTimer = null;
    let backlogOpen = false;
    const READ_KEY = 'galide-read-' + PROJECT_ID;
    let readState = { readLineIds: [] };
    try {
      const raw = localStorage.getItem(READ_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.readLineIds)) readState = parsed;
      }
    } catch (e) { /* 损坏的已读记录按空处理 */ }
    const persistReadState = () => {
      try { localStorage.setItem(READ_KEY, JSON.stringify(readState)); } catch (e) { /* 忽略配额错误 */ }
    };
    const markCurrentRead = (step) => {
      if (!step || step.type !== 'dialogue') return;
      const id = dialogueLineId(vmState.sceneId, step.character, step.text);
      readState = markRead(readState, id);
      persistReadState();
    };
    const stopAuto = () => { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } };
    const stopSkip = () => { if (skipTimer) { clearInterval(skipTimer); skipTimer = null; } };
    const advanceOnce = () => {
      const step = getCurrentStep(VM_GRAPH, vmState);
      if (!step) return 'end';
      if (step.type === 'choice') return 'choice';
      if (step.type === 'goto') {
        const j = executeGotoStep(VM_GRAPH, vmState, step);
        if (j.ok) { vmState = j.state; render(); return 'ok'; }
        showError(j.error);
        return 'end';
      }
      const r = advanceVm(VM_GRAPH, vmState);
      if (r.ok && !r.finished) { vmState = r.state; render(); return 'ok'; }
      render();
      return 'end';
    };
    const isAutoPlayable = (step) => !!step && (step.type === 'dialogue' || step.type === 'marker' || step.type === 'set' || step.type === 'stage');
    const startAuto = () => {
      stopSkip();
      autoTimer = setInterval(() => {
        const step = getCurrentStep(VM_GRAPH, vmState);
        if (!isAutoPlayable(step)) { stopAuto(); syncCtrlBar(); return; }
        advanceOnce();
      }, AUTO_SPEEDS[autoSpeedIdx]);
    };
    const startSkip = () => {
      stopAuto();
      skipTimer = setInterval(() => {
        const step = getCurrentStep(VM_GRAPH, vmState);
        if (!step || step.type === 'choice') { stopSkip(); syncCtrlBar(); return; }
        if (step.type === 'dialogue' && !isRead(readState, dialogueLineId(vmState.sceneId, step.character, step.text))) {
          stopSkip(); syncCtrlBar(); return;
        }
        advanceOnce();
      }, 150);
    };
    const syncCtrlBar = () => {
      const bar = document.getElementById('ctrl-bar');
      if (!bar) return;
      bar.innerHTML = '';
      const mkBtn = (label, title, on, fn, testId) => {
        const b = document.createElement('button');
        b.className = 'ctrl-btn' + (on ? ' on' : '');
        b.textContent = label;
        b.title = title;
        if (testId) b.setAttribute('data-testid', testId);
        b.onclick = fn;
        bar.appendChild(b);
      };
      mkBtn(autoTimer ? '自动' + AUTO_LABELS[autoSpeedIdx] : '自动', '自动播放(循环速度)', !!autoTimer, () => {
        if (autoTimer) { autoSpeedIdx = (autoSpeedIdx + 1) % AUTO_SPEEDS.length; stopAuto(); startAuto(); }
        else startAuto();
        syncCtrlBar();
      }, 'web-auto');
      mkBtn('跳过', '跳过已读(至未读或选项)', !!skipTimer, () => {
        if (skipTimer) stopSkip();
        else startSkip();
        syncCtrlBar();
      }, 'web-skip-read');
      mkBtn('回看', '回看日志', backlogOpen, () => { backlogOpen = !backlogOpen; render(); }, 'web-backlog');
    };

    const showSaveToast = (msg) => {
      const stage = document.getElementById('stage');
      if (!saveToast) {
        saveToast = document.createElement('div');
        saveToast.className = 'save-toast';
        stage.appendChild(saveToast);
      }
      saveToast.textContent = msg;
      setTimeout(() => { if (saveToast) saveToast.remove(); saveToast = null; }, 2000);
    };

    const saveToSlot = (slot) => {
      const key = buildWebSaveKey(PROJECT_ID, slot);
      const file = serializeVmSave(vmState, slot);
      try {
        localStorage.setItem(key, JSON.stringify(file));
        showSaveToast('已保存到槽 ' + slot);
      } catch (e) {
        showError('保存失败: ' + (e && e.message ? e.message : String(e)));
      }
    };

    const loadFromSlot = (slot) => {
      const key = buildWebSaveKey(PROJECT_ID, slot);
      try {
        const raw = localStorage.getItem(key);
        if (!raw) { showSaveToast('槽 ' + slot + ' 为空'); return; }
        const parsed = JSON.parse(raw);
        const restored = deserializeVmSave(parsed);
        if (!restored) { showError('存档版本不兼容'); return; }
        vmState = restored;
        currentSpriteKey = null;
        render();
        showSaveToast('已从槽 ' + slot + ' 加载');
      } catch (e) {
        showError('加载失败: ' + (e && e.message ? e.message : String(e)));
      }
    };

    const initSaveBar = () => {
      const bar = document.getElementById('save-bar');
      if (!bar) return;
      for (let slot = 1; slot <= 3; slot++) {
        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-btn';
        saveBtn.textContent = '存' + slot;
        saveBtn.onclick = () => saveToSlot(slot);
        bar.appendChild(saveBtn);
        const loadBtn = document.createElement('button');
        loadBtn.className = 'save-btn';
        loadBtn.textContent = '读' + slot;
        loadBtn.onclick = () => loadFromSlot(slot);
        bar.appendChild(loadBtn);
      }
    };

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

    let currentStageKey = '';
    const updateStage = () => {
      const layer = document.getElementById('sprites');
      const stage = computeStageState(VM_GRAPH, vmState);
      const names = Object.keys(stage).sort();
      const key = names.map((n) => n + '>' + (stage[n].sprite || '') + '@' + (stage[n].position || 'center')).join(';');
      if (key === currentStageKey) return;
      currentStageKey = key;
      layer.innerHTML = '';
      for (const n of names) {
        const slot = stage[n];
        if (!slot || !slot.sprite) continue;
        const img = document.createElement('img');
        img.className = 'sprite ' + positionClass(slot.position);
        img.src = assetUrl(slot.sprite);
        img.alt = n;
        img.setAttribute('data-stage-character', n);
        layer.appendChild(img);
      }
    };


    const renderBacklog = (stage) => {
      if (!backlogOpen) return;
      const entries = buildBacklog(VM_GRAPH, vmState);
      const panel = document.createElement('div');
      panel.className = 'backlog';
      panel.setAttribute('data-testid', 'web-backlog-panel');
      const h = document.createElement('h3');
      h.textContent = '回看日志(' + entries.length + ')';
      panel.appendChild(h);
      const list = document.createElement('div');
      list.className = 'backlog-list';
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text';
        empty.style.color = 'rgba(255,255,255,0.5)';
        empty.style.fontSize = '13px';
        empty.textContent = '还没有播放过的对白';
        list.appendChild(empty);
      }
      for (const e of entries) {
        const item = document.createElement('div');
        item.className = 'backlog-item';
        const ch = document.createElement('div');
        ch.className = 'character';
        ch.textContent = e.character + '  ·  ' + e.sceneId;
        const tx = document.createElement('div');
        tx.className = 'text';
        tx.textContent = e.text;
        item.appendChild(ch);
        item.appendChild(tx);
        list.appendChild(item);
      }
      panel.appendChild(list);
      const close = document.createElement('button');
      close.className = 'ctrl-btn backlog-close';
      close.textContent = '关闭';
      close.setAttribute('data-testid', 'web-backlog-close');
      close.onclick = () => { backlogOpen = false; render(); };
      panel.appendChild(close);
      stage.appendChild(panel);
    };

    const render = () => {
      const stage = document.getElementById('stage');
      stage.querySelectorAll('.dialogue, .choices, .beat-label, .backlog').forEach((el) => el.remove());
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
        renderBacklog(stage);
        return;
      }

      // 已读标记:对白展示即记录并持久化
      markCurrentRead(step);

      // set / stage(进出场)步不渲染,立即自动推进(与 preview 行为对齐,修复卡死)
      if (step.type === 'set' || step.type === 'stage') {
        setTimeout(() => {
          const r = advanceVm(VM_GRAPH, vmState);
          // finished 也必须更新状态,否则 render 仍停在 set 步 → 无限重排
          if (r.ok) { vmState = r.state; }
          render();
        }, 0);
        return;
      }

      updateStage();

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
          if (r.ok) { vmState = r.state; render(); }
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
          if (r.ok) { vmState = r.state; render(); }
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

      renderBacklog(stage);
    };

    initSaveBar();
    syncCtrlBar();
    render();
  </script>
</body>
</html>`

export interface WebAst {
  readonly html: string
}

export class WebComposer implements Composer<WebAst, MultiFileOutput> {
  readonly name = 'web' as const
  readonly defaultFilename = 'index.html'

  async transform(ctx: ExportContext): Promise<WebAst> {
    const merged = mergeScriptAsts(ctx.asts)
    const graph = buildVmGraph(merged)
    const graphJson = safeJson(graph)
    const vmFunctions = buildPlayerRuntimeFunctions()
    const saveFunctions = buildPlayerSaveFunctions()
    const projectId = basename(ctx.request.projectPath) || 'galide-player'

    const assetsOutDir = join(ctx.outputDir, 'assets')
    await fs.mkdir(assetsOutDir, { recursive: true })
    const assetsSrcDir = join(ctx.request.projectPath, 'assets')
    try {
      await fs.cp(assetsSrcDir, assetsOutDir, { recursive: true })
    } catch (err) {
      console.warn(`[galide export] assets 目录复制失败: ${assetsSrcDir}`, err)
    }

    const html = buildHtmlShell(graphJson, vmFunctions, saveFunctions, projectId)
    return { html }
  }

  emit(target: WebAst, _ctx: ExportContext): MultiFileOutput {
    return { kind: 'multi', files: [{ path: 'index.html', content: target.html }] }
  }
}
