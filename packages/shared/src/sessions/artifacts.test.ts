import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ARTIFACTS_FILE_NAME, getArtifactSummaries, readArtifacts, upsertArtifact } from './artifacts.ts';

let rootDir = '';
let sessionDir = '';

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'session-artifacts-test-'));
  sessionDir = join(rootDir, 'sessions', 'session-1');
  mkdirSync(sessionDir, { recursive: true });
});

afterEach(() => {
  if (rootDir && existsSync(rootDir)) {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

describe('artifacts store', () => {
  it('writes .artifacts.json on first report', () => {
    const artifactPath = join(rootDir, 'deck.pptx');
    const canonicalArtifactPath = realpathSync(rootDir).replace(/\/$/, '') + '/deck.pptx';
    writeFileSync(artifactPath, 'pptx-binary', 'utf-8');

    const record = upsertArtifact(
      sessionDir,
      { path: artifactPath, title: 'Pricing Deck' },
      { turnId: 'turn-1', now: 1000 }
    );

    expect(record.path).toBe(canonicalArtifactPath);
    expect(record.title).toBe('Pricing Deck');
    expect(record.kind).toBe('deliverable');
    expect(record.firstReportedAt).toBe(1000);
    expect(record.lastReportedAt).toBe(1000);
    expect(record.lastReportedTurnId).toBe('turn-1');

    const persistedPath = join(sessionDir, ARTIFACTS_FILE_NAME);
    expect(existsSync(persistedPath)).toBe(true);
    const persisted = JSON.parse(readFileSync(persistedPath, 'utf-8')) as {
      version: number;
      items: Array<{ path: string }>;
    };
    expect(persisted.version).toBe(1);
    expect(persisted.items).toHaveLength(1);
    expect(persisted.items[0]?.path).toBe(canonicalArtifactPath);
  });

  it('upserts by absolute path without duplicates', () => {
    const artifactPath = join(rootDir, 'deck.pptx');
    writeFileSync(artifactPath, 'v1', 'utf-8');

    upsertArtifact(sessionDir, { path: artifactPath, title: 'Deck v1' }, { turnId: 'turn-1', now: 1000 });
    upsertArtifact(sessionDir, { path: artifactPath, title: 'Deck v2', kind: 'attachment', note: 'latest build' }, { turnId: 'turn-2', now: 2000 });

    const store = readArtifacts(sessionDir);
    expect(store.items).toHaveLength(1);

    const item = store.items[0]!;
    expect(item.title).toBe('Deck v2');
    expect(item.kind).toBe('attachment');
    expect(item.note).toBe('latest build');
    expect(item.firstReportedAt).toBe(1000);
    expect(item.lastReportedAt).toBe(2000);
    expect(item.lastReportedTurnId).toBe('turn-2');
  });

  it('resolves relative paths against provided cwd', () => {
    const projectDir = join(rootDir, 'project');
    const outputDir = join(projectDir, 'deliverables');
    mkdirSync(outputDir, { recursive: true });
    const artifactPath = join(outputDir, 'report.pdf');
    writeFileSync(artifactPath, 'pdf', 'utf-8');

    const record = upsertArtifact(
      sessionDir,
      { path: 'deliverables/report.pdf' },
      { cwd: projectDir, now: 1234 }
    );

    expect(record.path).toBe(realpathSync(artifactPath));
    expect(record.title).toBe('report.pdf');
  });

  it('throws on missing target file and does not persist', () => {
    expect(() => {
      upsertArtifact(sessionDir, { path: join(rootDir, 'missing.pptx') }, { now: 1000 });
    }).toThrow('does not exist');

    expect(existsSync(join(sessionDir, ARTIFACTS_FILE_NAME))).toBe(false);
  });

  it('throws when target path is a directory', () => {
    const dirPath = join(rootDir, 'deliverables');
    mkdirSync(dirPath, { recursive: true });

    expect(() => {
      upsertArtifact(sessionDir, { path: dirPath }, { now: 1000 });
    }).toThrow('must be a file');

    expect(existsSync(join(sessionDir, ARTIFACTS_FILE_NAME))).toBe(false);
  });

  it('keeps deleted artifacts in summaries with exists=false', () => {
    const artifactPath = join(rootDir, 'deck.pptx');
    const canonicalArtifactPath = realpathSync(rootDir).replace(/\/$/, '') + '/deck.pptx';
    writeFileSync(artifactPath, 'pptx', 'utf-8');
    upsertArtifact(sessionDir, { path: artifactPath, title: 'Deck' }, { now: 1000 });

    unlinkSync(artifactPath);

    const summaries = getArtifactSummaries(sessionDir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.path).toBe(canonicalArtifactPath);
    expect(summaries[0]?.exists).toBe(false);
    expect(summaries[0]?.size).toBe(0);
    expect(summaries[0]?.updatedAt).toBe(1000);
  });
});
