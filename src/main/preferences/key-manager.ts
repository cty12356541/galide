/**
 * 加密 Key 访问层 - 集中所有 API Key 读写
 * renderer 永远拿不到 Key 明文,只返 hasKey boolean
 */

import { apiKeyStore } from '../ai/key-store.js'
import type { ApiKeyProvider } from '../../shared/api-key-provider.js'

export const keyManager = {
  set: (provider: ApiKeyProvider, key: string): void => {
    apiKeyStore.set(provider, key)
  },
  delete: (provider: ApiKeyProvider): void => {
    apiKeyStore.delete(provider)
  },
  has: (provider: ApiKeyProvider): boolean => {
    return apiKeyStore.get(provider) !== undefined
  }
}
