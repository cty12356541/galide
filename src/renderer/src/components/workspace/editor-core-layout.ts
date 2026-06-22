/** 面板 onLayout 回调用:仅在尺寸实际变化时写 store */
export const panelSizesChanged = (prev: number, next: number): boolean =>
  Math.round(prev) !== Math.round(next)

export const shouldPatchHorizontalLayout = (
  cur: { beat: number; right: number },
  sizes: number[]
): boolean => {
  if (sizes.length < 2) return false
  return panelSizesChanged(cur.beat, sizes[0]) || panelSizesChanged(cur.right, sizes[1])
}

/** 通用 EditorCore layout patch:两键映射到 sizes[0]/sizes[1] */
export const patchEditorCoreLayout = <K1 extends string, K2 extends string>(
  keys: readonly [K1, K2],
  sizes: number[],
  cur: Record<K1 | K2, number>
): Partial<Record<K1 | K2, number>> | null => {
  if (sizes.length < 2) return null
  const [k0, k1] = keys
  if (!panelSizesChanged(cur[k0], sizes[0]) && !panelSizesChanged(cur[k1], sizes[1])) {
    return null
  }
  return { [k0]: sizes[0], [k1]: sizes[1] } as Partial<Record<K1 | K2, number>>
}
