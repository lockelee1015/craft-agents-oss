import * as React from 'react'
import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ArtifactSummary } from '../../../shared/types'
import { ArtifactSummaryCard, shouldRenderArtifactSummaryCard } from './ArtifactSummaryCard'

describe('shouldRenderArtifactSummaryCard', () => {
  it('returns true when artifacts exist', () => {
    const artifacts: ArtifactSummary[] = [
      {
        path: '/tmp/output.pptx',
        name: 'output.pptx',
        title: 'Final Deck',
        kind: 'deliverable',
        size: 1024,
        updatedAt: Date.now(),
        exists: true,
      },
    ]

    expect(shouldRenderArtifactSummaryCard(artifacts)).toBe(true)
  })

  it('returns false when artifacts are empty or undefined', () => {
    expect(shouldRenderArtifactSummaryCard([])).toBe(false)
    expect(shouldRenderArtifactSummaryCard(undefined)).toBe(false)
  })

  it('returns true even when an artifact no longer exists', () => {
    const artifacts: ArtifactSummary[] = [
      {
        path: '/tmp/missing.pptx',
        name: 'missing.pptx',
        title: 'Missing Deck',
        kind: 'deliverable',
        size: 0,
        updatedAt: Date.now(),
        exists: false,
      },
    ]

    expect(shouldRenderArtifactSummaryCard(artifacts)).toBe(true)
  })
})

describe('ArtifactSummaryCard rendering', () => {
  it('renders one card per artifact', () => {
    const artifacts: ArtifactSummary[] = [
      {
        path: '/tmp/one.pdf',
        name: 'one.pdf',
        title: 'One',
        kind: 'deliverable',
        size: 2000,
        updatedAt: Date.now(),
        exists: true,
      },
      {
        path: '/tmp/two.csv',
        name: 'two.csv',
        title: 'Two',
        kind: 'deliverable',
        size: 3000,
        updatedAt: Date.now(),
        exists: true,
      },
    ]

    const html = renderToStaticMarkup(
      React.createElement(ArtifactSummaryCard, {
        artifacts,
        onOpenFile: () => {},
      })
    )

    const cards = html.match(/data-artifact-card=\"true\"/g) ?? []
    expect(cards.length).toBe(2)
  })
})
