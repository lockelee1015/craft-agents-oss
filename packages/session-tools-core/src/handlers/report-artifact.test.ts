import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleReportArtifact } from './report-artifact.ts';

function createCtx(workspacePath: string, sessionPath: string) {
  return {
    sessionId: 'test-session',
    workspacePath,
    get sourcesPath() { return join(workspacePath, 'sources'); },
    get skillsPath() { return join(workspacePath, 'skills'); },
    plansFolderPath: join(sessionPath, 'plans'),
    workingDirectory: workspacePath,
    sessionPath,
    callbacks: {
      onPlanSubmitted: () => {},
      onAuthRequest: () => {},
    },
    fs: {
      exists: (path: string) => existsSync(path),
      readFile: (path: string) => readFileSync(path, 'utf-8'),
      readFileBuffer: (path: string) => readFileSync(path),
      writeFile: (path: string, content: string) => writeFileSync(path, content),
      isDirectory: (path: string) => existsSync(path) && statSync(path).isDirectory(),
      readdir: (path: string) => readdirSync(path),
      stat: (path: string) => {
        const s = statSync(path);
        return { size: s.size, isDirectory: () => s.isDirectory() };
      },
    },
    validators: undefined,
    loadSourceConfig: () => null,
  } as const;
}

describe('report_artifact handler', () => {
  let tempDir = '';
  let sessionDir = '';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'report-artifact-handler-test-'));
    sessionDir = join(tempDir, 'sessions', 's1');
    mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records a deliverable artifact', async () => {
    const artifactPath = join(tempDir, 'final.pptx');
    writeFileSync(artifactPath, 'pptx');
    const canonicalArtifactPath = realpathSync(artifactPath);

    const result = await handleReportArtifact(createCtx(tempDir, sessionDir), {
      path: artifactPath,
      title: 'Final Deck',
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.ok).toBe(true);
    const structuredArtifact = result.structuredContent?.artifact as { path: string; title: string } | undefined;
    expect(structuredArtifact?.path).toBe(canonicalArtifactPath);
    expect(structuredArtifact?.title).toBe('Final Deck');
    expect(result.content[0]?.text).toContain('Recorded artifact');
  });

  it('returns error when file does not exist', async () => {
    const result = await handleReportArtifact(createCtx(tempDir, sessionDir), {
      path: join(tempDir, 'missing.pptx'),
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.ok).toBe(false);
    expect(String(result.structuredContent?.error)).toContain('does not exist');
  });

  it('upserts the same path without duplication', async () => {
    const artifactPath = join(tempDir, 'final.pptx');
    writeFileSync(artifactPath, 'pptx');
    const canonicalArtifactPath = realpathSync(artifactPath);

    await handleReportArtifact(createCtx(tempDir, sessionDir), {
      path: artifactPath,
      title: 'Deck v1',
    });
    await handleReportArtifact(createCtx(tempDir, sessionDir), {
      path: artifactPath,
      title: 'Deck v2',
      kind: 'attachment',
    });

    const storePath = join(sessionDir, '.artifacts.json');
    const store = JSON.parse(readFileSync(storePath, 'utf-8')) as {
      items: Array<{ path: string; title: string; kind: string }>;
    };

    expect(store.items).toHaveLength(1);
    expect(store.items[0]?.path).toBe(canonicalArtifactPath);
    expect(store.items[0]?.title).toBe('Deck v2');
    expect(store.items[0]?.kind).toBe('attachment');
  });
});
