interface CraftAgentsSymbolProps {
  className?: string
}

import mooncakeSymbol from '@/assets/mooncake-symbol.png'

/**
 * MoonCake symbol icon used across onboarding/menu/splash.
 */
export function CraftAgentsSymbol({ className }: CraftAgentsSymbolProps) {
  return (
    <img
      src={mooncakeSymbol}
      alt="MoonCake"
      className={className ? `${className} object-contain scale-110` : 'object-contain scale-110'}
      draggable={false}
    />
  )
}
