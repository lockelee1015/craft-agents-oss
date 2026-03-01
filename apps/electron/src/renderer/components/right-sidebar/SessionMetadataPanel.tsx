/**
 * SessionMetadataPanel - Right sidebar panel showing session files
 */

import * as React from 'react'
import { PanelHeader } from '../app-shell/PanelHeader'
import { SessionFilesSection } from './SessionFilesSection'
import { useI18n } from '@/context/I18nContext'

export interface SessionMetadataPanelProps {
  sessionId?: string
  closeButton?: React.ReactNode
}

/**
 * Panel displaying session files only.
 */
export function SessionMetadataPanel({ sessionId, closeButton }: SessionMetadataPanelProps) {
  const { te } = useI18n()

  // Early return if no sessionId
  if (!sessionId) {
    return (
      <div className="h-full flex flex-col">
        <PanelHeader title={te('Files')} actions={closeButton} />
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
          <p className="text-sm text-center">{te('No session selected')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <PanelHeader title={te('Files')} actions={closeButton} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <SessionFilesSection sessionId={sessionId} showHeader={false} />
      </div>
    </div>
  )
}
