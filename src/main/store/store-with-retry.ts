/**
 * 通用 retry helper — 用于 electron-store 偶发的 ELIFECYCLE 锁冲突。
 *
 * 规约: dev hot-reload 时 main 进程被重启,旧的 store 实例持有 lock
 *       未释放;后续 create/open 可能短暂失败。短延迟 + 少量重试即可。
 */
const LOCK_ERROR_CODES: ReadonlySet<string> = new Set(['ELIFECYCLE', 'EBUSY', 'EAGAIN'])

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const isLockError = (e: unknown): boolean => {
  if (!(e instanceof Error)) return false
  const code = (e as { code?: unknown }).code
  if (typeof code === 'string' && LOCK_ERROR_CODES.has(code)) return true
  // 兜底:message 里包含关键字也算(electron-store 有时把 lock 信息拼到 message)
  const msg = e.message.toLowerCase()
  return msg.includes('lock') || msg.includes('busy') || msg.includes('another instance')
}

export const withRetry = async <T>(
  fn: () => T | Promise<T>,
  opts: { retries: number; delayMs: number }
): Promise<T> => {
  let lastErr: unknown
  const totalAttempts = opts.retries + 1
  for (let i = 0; i < totalAttempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (!isLockError(e) || i === totalAttempts - 1) throw e
      await sleep(opts.delayMs * (i + 1))
    }
  }
  throw lastErr
}
