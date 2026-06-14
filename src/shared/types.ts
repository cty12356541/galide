/**
 * 项目清单类型
 * Canonical 项目结构描述,存储在 .galproj
 *
 * P1-1 命名补齐: 业务实体按 core/naming.yaml 命名,
 * 老名(SpriteEntry / ChoiceOption)以 alias 形式保留,不影响外部引用。
 */

import type { WorkspaceLayout } from './workspace-layout'

import type { ChoiceNode, ChoiceOption } from './dsl/types.js'

export type CharacterCard = {
  id: string
  name: string
  description: string
  personality: string
  /** 角色立绘集(spec core/naming.yaml: CharacterSprite) */
  spriteSet: CharacterSprite[]
  voiceConfig?: VoiceConfig
}

/**
 * 角色立绘(spec core/naming.yaml: 角色立绘 → CharacterSprite)
 * 包含表情状态(state)和资产相对路径(path)。
 */
export type CharacterSprite = {
  state: string
  path: string
}

/**
 * @deprecated 使用 CharacterSprite(spec 命名)。保留 1-2 个 release
 * 用于兼容外部 plugin / 旧 manifest JSON。
 * @see CharacterSprite
 */
export type SpriteEntry = CharacterSprite

export type VoiceConfig = {
  provider: 'elevenlabs' | 'openai' | 'edge' | 'local'
  voiceId: string
  speed?: number
}

export type ProjectManifest = {
  version: '0.1.0'
  name: string
  createdAt: string
  updatedAt: string
  characters: CharacterCard[]
  assets: {
    characters: string
    backgrounds: string
    bgm: string
  }
  git?: {
    initialized: boolean
    remoteUrl?: string
  }
  /**
   * 规约 .style-spec/layers/renderer/conventions.yaml#workspace_layout.persistence
   * "project_level: .galproj.workspace (项目级覆盖,可选)"
   * main 端 workspace-handlers 写盘时用,renderer 端 hydrate 时读
   * in-flight 修复(2026-06-15): P0-10 配套 — type 必须含 workspace
   */
  workspace?: WorkspaceLayout
}

export type ExportTarget = 'web' | 'renpy' | 'ink' | 'json' | 'electron-desktop'

export type ExportRequest = {
  projectPath: string
  target: ExportTarget
  outputPath: string
}

export type ExportProgress = {
  stage: 'parse' | 'transform' | 'emit' | 'done'
  progress: number
  message: string
}

export type ProjectOpenResult = {
  ok: boolean
  projectPath?: string
  manifest?: ProjectManifest
  error?: string
}

// ----------------------------------------------------------------------------
// P1-1: 决策树别名(spec core/naming.yaml)
// ----------------------------------------------------------------------------
/** 玩家选项(spec: 玩家选项 → PlayerChoice) */
export type PlayerChoice = ChoiceOption

/** 对话选项(spec: 对话选项 → DialogueChoice) */
export type DialogueChoice = ChoiceOption

/** 分支(spec: 分支 → Branch,即 ChoiceNode 的语义别名) */
export type Branch = ChoiceNode

// ----------------------------------------------------------------------------
// P1-1: 资产相关(spec core/naming.yaml: 资产 / 资产文件 / 资产索引)
// ----------------------------------------------------------------------------
export type AssetKind = 'character' | 'background' | 'bgm' | 'voice'

/** 资产(spec: 资产 → Asset):相对项目根的引用 */
export interface Asset {
  readonly id: string
  readonly kind: AssetKind
  readonly path: string
}

/** 资产文件(spec: 资产文件 → AssetFile):由 main 端 resolve 后带 absolutePath */
export interface AssetFile {
  readonly asset: Asset
  readonly absolutePath: string
}

/** 资产索引(spec: 资产索引 → AssetIndex) */
export interface AssetIndex {
  readonly characters: Asset[]
  readonly backgrounds: Asset[]
  readonly bgm: Asset[]
  readonly voice: Asset[]
}

/** 角色资产(spec: 角色资产 → CharacterAsset):语义别名,运行期仍为 Asset */
export type CharacterAsset = Asset

/** 场景资产(spec: 场景资产 → SceneAsset):语义别名,运行期仍为 Asset */
export type SceneAsset = Asset