interface CraftAgentsLogoProps {
  className?: string
}

import mooncakeSymbol from '@/assets/mooncake-symbol.png'

/**
 * MoonCake product logo.
 */
export function CraftAgentsLogo({ className }: CraftAgentsLogoProps) {
  return (
    <img
      src={mooncakeSymbol}
      alt="MoonCake"
      className={className ? `${className} object-contain scale-110` : 'object-contain scale-110'}
      draggable={false}
    />
  )
}
