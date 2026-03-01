/**
 * Artifact storage helpers.
 *
 * Artifacts are explicit user-facing deliverables reported by the agent.
 * They are persisted per-session in a hidden JSON file:
 *   <sessionDir>/.artifacts.json
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

export const ARTIFACTS_FILE_NAME = '.artifacts.json';

export type ArtifactKind = 'deliverable' | 'attachment';

export interface ArtifactRecord {
  path: string;
  name: string;
  title: string;
  kind: ArtifactKind;
  note?: string;
  firstReportedAt: number;
  lastReportedAt: number;
  lastReportedTurnId?: string;
}

export interface ArtifactStore {
  version: 1;
  items: ArtifactRecord[];
}

export interface UpsertArtifactInput {
  path: string;
  title?: string;
  kind?: ArtifactKind;
  note?: string;
}

export interface UpsertArtifactContext {
  /** Resolve relative artifact paths against this cwd. Defaults to sessionDir. */
  cwd?: string;
  /** Optional turn id for traceability. */
  turnId?: string;
  /** Optional timestamp override (ms since epoch), mainly for tests. */
  now?: number;
}

export interface ArtifactSummary {
  path: string;
  name: string;
  title: string;
  kind: ArtifactKind;
  size: number;
  updatedAt: number;
  exists: boolean;
}

function getArtifactsFilePath(sessionDir: string): string {
  return join(sessionDir, ARTIFACTS_FILE_NAME);
}

function normalizeKind(kind: unknown): ArtifactKind {
  return kind === 'attachment' ? 'attachment' : 'deliverable';
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  return fallback;
}

function normalizeRecord(raw: unknown, fallbackNow: number): ArtifactRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const path = normalizeString(row.path);
  if (!path) return null;

  const name = normalizeString(row.name) ?? basename(path);
  const title = normalizeString(row.title) ?? name;
  const note = normalizeString(row.note);
  const firstReportedAt = normalizeTimestamp(row.firstReportedAt, fallbackNow);
  const lastReportedAt = normalizeTimestamp(row.lastReportedAt, firstReportedAt);
  const lastReportedTurnId = normalizeString(row.lastReportedTurnId);

  return {
    path,
    name,
    title,
    kind: normalizeKind(row.kind),
    ...(note ? { note } : {}),
    firstReportedAt,
    lastReportedAt,
    ...(lastReportedTurnId ? { lastReportedTurnId } : {}),
  };
}

function writeArtifactsAtomic(sessionDir: string, store: ArtifactStore): void {
  mkdirSync(sessionDir, { recursive: true });
  const targetPath = getArtifactsFilePath(sessionDir);
  const tmpPath = join(sessionDir, `${ARTIFACTS_FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf-8');
  renameSync(tmpPath, targetPath);
}

/**
 * Read the session artifact store.
 * Returns an empty store when the file is missing or malformed.
 */
export function readArtifacts(sessionDir: string): ArtifactStore {
  const artifactsPath = getArtifactsFilePath(sessionDir);
  if (!existsSync(artifactsPath)) {
    return { version: 1, items: [] };
  }

  try {
    const raw = JSON.parse(readFileSync(artifactsPath, 'utf-8')) as Record<string, unknown>;
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const now = Date.now();
    const deduped = new Map<string, ArtifactRecord>();

    for (const item of rawItems) {
      const normalized = normalizeRecord(item, now);
      if (normalized) {
        deduped.set(normalized.path, normalized);
      }
    }

    return {
      version: 1,
      items: Array.from(deduped.values()),
    };
  } catch {
    return { version: 1, items: [] };
  }
}

/**
 * Upsert a reported artifact by absolute path.
 * Uses path as the dedupe key.
 */
export function upsertArtifact(
  sessionDir: string,
  input: UpsertArtifactInput,
  context: UpsertArtifactContext = {}
): ArtifactRecord {
  const rawPath = normalizeString(input.path);
  if (!rawPath) {
    throw new Error('path is required');
  }

  const baseDir = context.cwd ?? sessionDir;
  const resolvedPath = isAbsolute(rawPath) ? rawPath : resolve(baseDir, rawPath);
  let absolutePath = resolvedPath;
  try {
    absolutePath = realpathSync(resolvedPath);
  } catch {
    // Keep resolved path if realpath fails (we still validate existence below).
  }

  if (!existsSync(absolutePath)) {
    throw new Error(`Artifact file does not exist: ${absolutePath}`);
  }

  const stat = statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`Artifact path must be a file: ${absolutePath}`);
  }

  const now = context.now ?? Date.now();
  const name = basename(absolutePath);
  const title = normalizeString(input.title) ?? name;
  const note = normalizeString(input.note);
  const kind = normalizeKind(input.kind);
  const store = readArtifacts(sessionDir);
  const idx = store.items.findIndex(item => item.path === absolutePath);

  const previous = idx >= 0 ? store.items[idx] : null;
  const record: ArtifactRecord = {
    path: absolutePath,
    name,
    title,
    kind,
    ...(note ? { note } : {}),
    firstReportedAt: previous?.firstReportedAt ?? now,
    lastReportedAt: now,
    ...(context.turnId ? { lastReportedTurnId: context.turnId } : previous?.lastReportedTurnId ? { lastReportedTurnId: previous.lastReportedTurnId } : {}),
  };

  if (idx >= 0) {
    store.items[idx] = record;
  } else {
    store.items.push(record);
  }

  writeArtifactsAtomic(sessionDir, store);
  return record;
}

/**
 * Build renderer-friendly artifact summaries for card display.
 * Includes deleted files with exists=false.
 */
export function getArtifactSummaries(sessionDir: string): ArtifactSummary[] {
  const store = readArtifacts(sessionDir);

  return store.items
    .map((item): ArtifactSummary => {
      try {
        const stat = statSync(item.path);
        if (!stat.isFile()) {
          return {
            path: item.path,
            name: item.name,
            title: item.title,
            kind: item.kind,
            size: 0,
            updatedAt: item.lastReportedAt,
            exists: false,
          };
        }
        return {
          path: item.path,
          name: item.name,
          title: item.title,
          kind: item.kind,
          size: stat.size,
          updatedAt: Math.round(stat.mtimeMs),
          exists: true,
        };
      } catch {
        return {
          path: item.path,
          name: item.name,
          title: item.title,
          kind: item.kind,
          size: 0,
          updatedAt: item.lastReportedAt,
          exists: false,
        };
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

