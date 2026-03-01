/**
 * Report Artifact Handler
 *
 * Records explicit user-facing deliverables in <sessionDir>/.artifacts.json.
 * This is used by the renderer to show artifact summary cards after completion.
 */

import { realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import type { SessionToolContext } from '../context.ts';
import type { ToolResult } from '../types.ts';
import { resolveSessionWorkingDirectory } from '../source-helpers.ts';

const ARTIFACTS_FILE_NAME = '.artifacts.json';

type ArtifactKind = 'deliverable' | 'attachment';

interface ArtifactRecord {
  path: string;
  name: string;
  title: string;
  kind: ArtifactKind;
  note?: string;
  firstReportedAt: number;
  lastReportedAt: number;
  lastReportedTurnId?: string;
}

interface ArtifactStore {
  version: 1;
  items: ArtifactRecord[];
}

export interface ReportArtifactArgs {
  path: string;
  title?: string;
  kind?: ArtifactKind;
  note?: string;
}

function normalizeKind(kind: unknown): ArtifactKind {
  return kind === 'attachment' ? 'attachment' : 'deliverable';
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function loadStore(ctx: SessionToolContext, sessionDir: string): ArtifactStore {
  const storePath = join(sessionDir, ARTIFACTS_FILE_NAME);
  if (!ctx.fs.exists(storePath)) {
    return { version: 1, items: [] };
  }

  try {
    const parsed = JSON.parse(ctx.fs.readFile(storePath)) as Record<string, unknown>;
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const deduped = new Map<string, ArtifactRecord>();
    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const row = rawItem as Record<string, unknown>;
      const itemPath = normalizeString(row.path);
      if (!itemPath) continue;

      const name = normalizeString(row.name) ?? basename(itemPath);
      const title = normalizeString(row.title) ?? name;
      const note = normalizeString(row.note);
      const firstReportedAt = typeof row.firstReportedAt === 'number' ? row.firstReportedAt : Date.now();
      const lastReportedAt = typeof row.lastReportedAt === 'number' ? row.lastReportedAt : firstReportedAt;
      const lastReportedTurnId = normalizeString(row.lastReportedTurnId);

      deduped.set(itemPath, {
        path: itemPath,
        name,
        title,
        kind: normalizeKind(row.kind),
        ...(note ? { note } : {}),
        firstReportedAt,
        lastReportedAt,
        ...(lastReportedTurnId ? { lastReportedTurnId } : {}),
      });
    }

    return { version: 1, items: Array.from(deduped.values()) };
  } catch {
    return { version: 1, items: [] };
  }
}

function saveStoreAtomic(sessionDir: string, store: ArtifactStore): void {
  const targetPath = join(sessionDir, ARTIFACTS_FILE_NAME);
  const tmpPath = join(sessionDir, `${ARTIFACTS_FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf-8');
  renameSync(tmpPath, targetPath);
}

function successResult(artifact: ArtifactRecord): ToolResult {
  return {
    content: [{ type: 'text', text: `Recorded artifact: ${artifact.title} (${artifact.path})` }],
    structuredContent: {
      ok: true,
      artifact,
    },
    isError: false,
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: `[ERROR] ${message}` }],
    structuredContent: {
      ok: false,
      error: message,
    },
    isError: true,
  };
}

/**
 * Persist a user-facing artifact in the current session.
 */
export async function handleReportArtifact(
  ctx: SessionToolContext,
  args: ReportArtifactArgs
): Promise<ToolResult> {
  if (!ctx.sessionPath) {
    return errorResult('report_artifact requires sessionPath in context.');
  }

  const rawPath = normalizeString(args.path);
  if (!rawPath) {
    return errorResult('path is required.');
  }

  try {
    const baseDir =
      ctx.workingDirectory
      ?? resolveSessionWorkingDirectory(ctx.workspacePath, ctx.sessionId)
      ?? ctx.sessionPath;
    const candidatePath = isAbsolute(rawPath) ? rawPath : resolve(baseDir, rawPath);
    let absolutePath = candidatePath;
    try {
      absolutePath = realpathSync(candidatePath);
    } catch {
      // Keep resolved path if realpath fails; existence is validated next.
    }

    if (!ctx.fs.exists(absolutePath)) {
      return errorResult(`Artifact file does not exist: ${absolutePath}`);
    }

    if (ctx.fs.isDirectory(absolutePath)) {
      return errorResult(`Artifact path must be a file: ${absolutePath}`);
    }

    const stat = ctx.fs.stat(absolutePath);
    if (stat.isDirectory()) {
      return errorResult(`Artifact path must be a file: ${absolutePath}`);
    }

    const now = Date.now();
    const name = basename(absolutePath);
    const title = normalizeString(args.title) ?? name;
    const note = normalizeString(args.note);
    const kind = normalizeKind(args.kind);

    const store = loadStore(ctx, ctx.sessionPath);
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
      ...(previous?.lastReportedTurnId ? { lastReportedTurnId: previous.lastReportedTurnId } : {}),
    };

    if (idx >= 0) {
      store.items[idx] = record;
    } else {
      store.items.push(record);
    }

    saveStoreAtomic(ctx.sessionPath, store);
    return successResult(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return errorResult(`Failed to record artifact: ${message}`);
  }
}
