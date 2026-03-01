import * as React from 'react'
import { Search, Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { EntityPanel } from '@/components/ui/entity-panel'
import { EntityListEmptyScreen } from '@/components/ui/entity-list-empty'
import { marketSkillSelection } from '@/hooks/useEntitySelection'
import { cn } from '@/lib/utils'
import type { MarketSkillSummary } from '../../../shared/types'

interface SkillMarketListPanelProps {
  selectedMarketId?: string | null
  onMarketSkillClick: (id: string) => void
}

export function SkillMarketListPanel({ selectedMarketId, onMarketSkillClick }: SkillMarketListPanelProps) {
  const [query, setQuery] = React.useState('agent')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [results, setResults] = React.useState<MarketSkillSummary[]>([])

  const runSearch = React.useCallback(async (nextQuery: string) => {
    const trimmed = nextQuery.trim()
    if (trimmed.length < 2) {
      setResults([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const items = await window.electronAPI.searchMarketSkills(trimmed)
      setResults(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    runSearch('agent')
  }, [runSearch])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-2 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                runSearch(query)
              }
            }}
            className="pl-8 h-8"
            placeholder="Search skills.sh"
          />
        </div>
      </div>

      {error && (
        <div className="px-3 py-3 text-sm text-destructive border-b border-border/40">
          {error}
        </div>
      )}

      {loading && (
        <div className="px-3 py-3 text-sm text-muted-foreground border-b border-border/40">
          Searching...
        </div>
      )}

      <EntityPanel<MarketSkillSummary>
        items={results}
        getId={(item) => item.id}
        selection={marketSkillSelection}
        selectedId={selectedMarketId}
        onItemClick={(item) => onMarketSkillClick(item.id)}
        emptyState={
          <EntityListEmptyScreen
            icon={<Zap />}
            title="No market skills found"
            description="Try another keyword to search skills from skills.sh."
          />
        }
        mapItem={(item) => ({
          icon: (
            <div className="h-4 w-4 rounded-[4px] ring-1 ring-border/30 bg-muted shrink-0 flex items-center justify-center">
              <Zap className="h-3 w-3 text-muted-foreground" />
            </div>
          ),
          title: item.name,
          badges: (
            <span className="truncate">
              {item.source} / {item.skillId}
            </span>
          ),
          trailing: (
            <span className={cn('text-[11px] text-muted-foreground')}>
              Weekly {item.installs.toLocaleString()}
            </span>
          ),
        })}
      />
    </div>
  )
}
