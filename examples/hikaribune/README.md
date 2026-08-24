# 星灯渡 — Galide 示例游戏

Galide 的活体示例项目:用于驱动 runtime 全特性、充当回归 fixture 与 Agent eval 素材。

## 当前进度
- 第一章「拾光书屋」:约 10 分钟流程,2 个选择点、2 个变量(curiosity / trust_wanqing)、3 种章末组合
- 使用特性:多角色登场/退场、变量、条件分支、跨文件跳转(marker ch1_fin)、BGM/背景槽位、项目大脑(3 伏笔 / 2 关系 / 2 知识边界)

## 素材
- 背景:本机 ComfyUI + Animagine XL 4.0 生成(见下),已入 `assets/backgrounds/`
- 立绘:纯色占位图,路径已在 .galproj 登记;替换 `assets/sprites/*.png` 即可,剧本无需改动

## 本机生图环境(已搭好)
- ComfyUI 0.33.0 @ `~/tools/ComfyUI`(venv + torch 2.13 MPS),checkpoint: `models/checkpoints/model.safetensors`(Animagine XL 4.0)
- 启动: `cd ~/tools/ComfyUI && ./venv/bin/python main.py --port 8188`
- Galide 接入: `imageProxy.generate({ provider: 'comfyui', ... })`,默认 `http://127.0.0.1:8188`(M5/16GB 上 ~60s/张,1344×768)

## 玩法
用 Galide 打开本目录,预览运行;或导出 Web 单文件播放。

## 结构性约定(供回归)
- `ch1_diary_open`/`ch1_diary_back` 两条前段分支必须都可达 `ch1_clock`(见 example-project.test.ts 的图走查)
- project-brain.json 的伏笔 plantedInSceneId 必须真实存在于剧本(叙事一致性门禁)
