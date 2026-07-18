import { parse } from './src/shared/dsl/parser.js'
import type { SceneNode } from './src/shared/dsl/types.js'

const src = `## s1
小雪: "hi"
## s1
主角: "bye"
`
const result = parse(src)
console.log('ok:', result.ok)
if (result.ok) {
  const scenes = result.value.children.filter(c => c.type === 'scene')
  console.log('scene count:', scenes.length)
  const scene = scenes[0] as SceneNode
  console.log('scene children:', scene.children.map(c => c.type))
  const dialogues = scene.children.filter(c => c.type === 'dialogue')
  console.log('dialogue count:', dialogues.length)
}
