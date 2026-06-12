import type { CharacterCard } from '../../../../shared/types'

export const CharacterAvatar = ({ character }: { character: CharacterCard }): JSX.Element => {
  const firstSprite = character.spriteSet[0]
  const initial = character.name.charAt(0) || '?'

  if (firstSprite?.path) {
    return (
      <div className="w-9 h-9 rounded-lg overflow-hidden bg-bg-elevated shrink-0">
        <img
          src={`file://${firstSprite.path}`}
          alt={character.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement
            img.style.display = 'none'
          }}
        />
      </div>
    )
  }

  return (
    <div className="w-9 h-9 rounded-lg bg-accent-soft flex items-center justify-center text-accent font-medium text-sm shrink-0">
      {initial}
    </div>
  )
}
