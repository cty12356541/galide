import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/**
 * 递归列出目录下所有相对路径并统一为 POSIX '/' 分隔符。
 * 供 scripts/ 下嵌套子目录扫描使用(与 isGalScriptFileName 配合过滤 .gal)。
 */
export const readDirRecursive = async (dirPath: string): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { recursive: true })
  return entries.map((entry) => entry.replace(/\\/g, '/'))
}

/**
 * 写文件前确保父目录存在(支持 scripts/act1/ch1.gal 等嵌套路径)。
 */
export const writeFileEnsureDir = async (filePath: string, content: string): Promise<void> => {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}
