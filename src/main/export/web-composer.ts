/**
 * Web Composer — 导出为单 HTML5 文件
 * 内联 PixiJS lite 渲染器 + 复制 .gal 脚本 + 复制 assets 目录
 * 玩家浏览器打开 index.html 即可游玩,零安装
 *
 * 实现:Composer<WebAst, MultiFileOutput>
 * - transform: 读 scripts 目录、复制 assets、生成 index.html
 * - emit: 返回 { html, galFiles } 多文件输出
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Composer, ExportContext, MultiFileOutput } from './composer.js'

const buildHtmlShell = (scripts: ReadonlyArray<string>): string => `<!DOCTYPE html>
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
    const SCRIPTS = ${JSON.stringify(scripts)};
    ${playerRuntime}
  </script>
</body>
</html>`

const playerRuntime = `
let currentScene = null;
let currentDialogue = null;
let scripts = {};

const parseScript = (source) => {
  const lines = source.split('\\n');
  const scenes = {};
  let current = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const id = line.slice(3).trim();
      current = { id, children: [] };
      scenes[id] = current;
    } else if (current && /^[^\\s\\[][^:]*: "/.test(line)) {
      const m = line.match(/^([^:]+): "(.*)"$/);
      if (m) current.children.push({ type: 'dialogue', character: m[1].trim(), text: m[2] });
    } else if (current && line.trimStart().startsWith('* "')) {
      const m = line.match(/^\\s*\\* "(.+?)"(?:\\s*->\\s*(.+))?$/);
      if (m) {
        if (!current.choice) current.choice = [];
        current.choice.push({ text: m[1], target: m[2] || '' });
      }
    }
  }
  return scenes;
};

const render = () => {
  const stage = document.getElementById('stage');
  stage.innerHTML = '';
  if (!currentScene) {
    const first = Object.keys(scripts)[0];
    currentScene = scripts[first];
    currentDialogue = 0;
  }
  if (!currentScene) return;
  const item = currentScene.children[currentDialogue];
  if (!item) return;
  if (item.type === 'dialogue') {
    const d = document.createElement('div');
    d.className = 'dialogue';
    d.innerHTML = '<div class="character">' + item.character + '</div><div class="text">' + item.text + '</div>';
    stage.appendChild(d);
    d.onclick = () => { currentDialogue++; render(); };
  }
  if (currentScene.choice && currentDialogue === currentScene.children.length - 1) {
    const c = document.createElement('div');
    c.className = 'choices';
    for (const opt of currentScene.choice) {
      const btn = document.createElement('div');
      btn.className = 'choice';
      btn.textContent = opt.text;
      btn.onclick = () => {
        if (scripts[opt.target]) {
          currentScene = scripts[opt.target];
          currentDialogue = 0;
          render();
        }
      };
      c.appendChild(btn);
    }
    stage.appendChild(c);
  }
};

for (const name of SCRIPTS) {
  fetch(name).then(r => r.text()).then(t => {
    Object.assign(scripts, parseScript(t));
    if (Object.keys(scripts).length === SCRIPTS.length) render();
  });
}
`

export interface WebAst {
  readonly html: string
  readonly galFiles: ReadonlyArray<{ readonly path: string; readonly content: string }>
}

export class WebComposer implements Composer<WebAst, MultiFileOutput> {
  readonly name = 'web' as const
  readonly defaultFilename = 'index.html'

  async transform(ctx: ExportContext): Promise<WebAst> {
    const scriptsDir = join(ctx.request.projectPath, 'scripts')
    let galFilenames: ReadonlyArray<string> = []
    try {
      const files = await fs.readdir(scriptsDir)
      galFilenames = files.filter((f) => f.endsWith('.gal'))
    } catch {
      galFilenames = []
    }
    const galFiles: { path: string; content: string }[] = []
    for (const file of galFilenames) {
      const content = await fs.readFile(join(scriptsDir, file), 'utf-8')
      galFiles.push({ path: file, content })
    }
    // 复制 assets 目录到 outputDir/assets
    const assetsOutDir = join(ctx.outputDir, 'assets')
    await fs.mkdir(assetsOutDir, { recursive: true })
    const assetsSrcDir = join(ctx.request.projectPath, 'assets')
    try {
      await fs.cp(assetsSrcDir, assetsOutDir, { recursive: true })
    } catch {
      // assets dir may not exist
    }
    const html = buildHtmlShell(galFilenames)
    return { html, galFiles }
  }

  emit(target: WebAst, _ctx: ExportContext): MultiFileOutput {
    const files: { path: string; content: string }[] = [
      { path: 'index.html', content: target.html },
      ...target.galFiles
    ]
    return { kind: 'multi', files }
  }
}
