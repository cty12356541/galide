/**
 * script-parse-cache — file-level mtime-based parse cache for parseProject
 *
 * Simple store: maps full file path → { mtime, ast }.
 * The caller (parseProjectScripts) is responsible for stat-ing the file
 * and comparing mtime before using a cached entry.
 *
 * Parse failures are NEVER cached — only successful parses are stored.
 */
import type { ScriptNode } from '../../shared/dsl/types.js'

export class ParseCache {
  private readonly store = new Map<string, { mtime: number; ast: ScriptNode }>()

  get(key: string): { mtime: number; ast: ScriptNode } | undefined {
    return this.store.get(key)
  }

  set(key: string, entry: { mtime: number; ast: ScriptNode }): void {
    this.store.set(key, entry)
  }

  invalidate(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

/** Singleton shared across parseProject callers and writeScript invalidation. */
export const parseCache = new ParseCache()
