/**
 * gal DSL CodeMirror 6 集成层
 *
 * 把 src/shared/dsl/lezer-parser.ts 暴露的 StreamParser 包装成
 * @codemirror/language 的 StreamLanguage + LanguageSupport,
 * 让 ScriptEditor 可以作为 CodeMirror extension 直接挂载。
 *
 * 用法:
 *   import { galLanguage } from '../../lib/codemirror/gal-language'
 *   EditorState.create({ doc, extensions: [galLanguage(), ...] })
 *
 * 历史:
 *   旧版基于 `@lezer/generator` 的 LRParser。`@lezer/generator` 在
 *   内部用 `import.meta.url` 启动 worker,Vite 在 renderer dep
 *   optimization 阶段把它当 ESM 解析会爆 `Unexpected token '"]"'`。
 *   现改用 `@codemirror/language` 的内置 `StreamLanguage`,无 LR
 *   解析器,无运行时编译,稳。
 */

import { LanguageSupport, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { galParser, galHighlightStyle, type GalStreamState } from '../../../../shared/dsl/lezer-parser'

const galStreamLanguage = StreamLanguage.define<GalStreamState>(galParser)

/**
 * CodeMirror extension,直接放到 EditorState.create({extensions: [...]}) 里。
 * 自动附带 syntaxHighlighting(galHighlightStyle)。
 */
export const galLanguage = (): LanguageSupport =>
  new LanguageSupport(galStreamLanguage, [syntaxHighlighting(galHighlightStyle)])

/** Re-export highlight style for advanced use cases (e.g. theme override). */
export { galHighlightStyle }
