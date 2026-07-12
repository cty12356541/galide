export const formatSaveSlotLabel = (
  slot: number,
  occupied: boolean,
  sceneId: string | null,
  timestamp: string | null,
  sceneName?: string
): string => {
  if (!occupied || !timestamp) return `槽 ${slot} (空)`
  const name = sceneName ?? sceneId ?? `槽 ${slot}`
  const date = new Date(timestamp)
  const timeText = Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
  return `${name} · ${timeText}`
}
