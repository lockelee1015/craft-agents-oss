/**
 * Cross-platform resources copy script
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

const ROOT_DIR = join(import.meta.dir, "..");
const ELECTRON_DIR = join(ROOT_DIR, "apps/electron");
const UV_VERSION = "0.7.8";
const UV_RELEASE_BASE = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`;

const srcDir = join(ELECTRON_DIR, "resources");
const destDir = join(ELECTRON_DIR, "dist/resources");

type UvTarget = {
  key: string;
  archive: string;
  binaryName: string;
};

function getUvTargetsForHost(): UvTarget[] {
  switch (process.platform) {
    case "darwin":
      // Build pipeline produces both arm64/x64 mac packages on macOS runners.
      return [
        { key: "darwin-arm64", archive: "uv-aarch64-apple-darwin.tar.gz", binaryName: "uv" },
        { key: "darwin-x64", archive: "uv-x86_64-apple-darwin.tar.gz", binaryName: "uv" },
      ];
    case "win32":
      return [
        { key: "win32-x64", archive: "uv-x86_64-pc-windows-msvc.zip", binaryName: "uv.exe" },
      ];
    case "linux":
      if (process.arch === "arm64") {
        return [
          { key: "linux-arm64", archive: "uv-aarch64-unknown-linux-gnu.tar.gz", binaryName: "uv" },
        ];
      }
      return [
        { key: "linux-x64", archive: "uv-x86_64-unknown-linux-gnu.tar.gz", binaryName: "uv" },
      ];
    default:
      return [];
  }
}

async function run(cmd: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn({
    cmd,
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Command failed (${code}): ${cmd.join(" ")}`);
  }
}

async function downloadFile(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const data = new Uint8Array(await res.arrayBuffer());
  writeFileSync(outPath, data);
}

function verifySha256(filePath: string, shaPath: string): void {
  const expected = readFileSync(shaPath, "utf-8").trim().split(/\s+/)[0]?.toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error(`Invalid sha256 file: ${shaPath}`);
  }
  const actual = createHash("sha256").update(readFileSync(filePath)).digest("hex").toLowerCase();
  if (actual !== expected) {
    throw new Error(`SHA256 mismatch for ${filePath}. Expected ${expected}, got ${actual}`);
  }
}

async function ensureBundledUvTarget(target: UvTarget): Promise<void> {
  const targetDir = join(srcDir, "bin", target.key);
  const uvPath = join(targetDir, target.binaryName);
  if (existsSync(uvPath)) {
    return;
  }

  mkdirSync(targetDir, { recursive: true });

  const tempDir = mkdtempSync(join(tmpdir(), "craft-agent-uv-"));
  try {
    const archivePath = join(tempDir, target.archive);
    const shaPath = `${archivePath}.sha256`;
    const archiveUrl = `${UV_RELEASE_BASE}/${target.archive}`;
    const shaUrl = `${archiveUrl}.sha256`;

    console.log(`⬇️ Downloading bundled uv ${UV_VERSION} for ${target.key}...`);
    await downloadFile(archiveUrl, archivePath);
    await downloadFile(shaUrl, shaPath);
    verifySha256(archivePath, shaPath);

    if (target.archive.endsWith(".tar.gz")) {
      await run(["tar", "-xzf", archivePath, "-C", tempDir], tempDir);
    } else if (target.archive.endsWith(".zip")) {
      if (process.platform === "win32") {
        await run(
          [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${tempDir.replace(/'/g, "''")}' -Force`,
          ],
          tempDir,
        );
      } else {
        await run(["unzip", "-o", archivePath, "-d", tempDir], tempDir);
      }
    } else {
      throw new Error(`Unsupported archive format: ${target.archive}`);
    }
    const extractedDir = join(tempDir, target.archive.replace(/\.tar\.gz$|\.zip$/, ""));
    const extractedUv = join(extractedDir, target.binaryName);

    if (!existsSync(extractedUv)) {
      throw new Error(`Extracted uv binary not found at ${extractedUv}`);
    }

    cpSync(extractedUv, uvPath, { force: true });
    if (process.platform !== "win32") {
      chmodSync(uvPath, 0o755);
    }
    console.log(`✅ Bundled uv ready: ${uvPath}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function ensureBundledUv(): Promise<void> {
  const targets = getUvTargetsForHost();
  for (const target of targets) {
    await ensureBundledUvTarget(target);
  }
}

async function main(): Promise<void> {
  if (!existsSync(srcDir)) {
    console.log("⚠️ No resources directory found");
    return;
  }

  await ensureBundledUv();
  cpSync(srcDir, destDir, { recursive: true, force: true });
  console.log("📦 Copied resources to dist");
}

await main();
