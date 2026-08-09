#!/usr/bin/env node
// scripts/trip-sync.mjs
//
// Two-way sync between the Obsidian vault (source of truth while planning
// the trip) and this repo's src/content/trip/*.md (so the build/CI, which
// cannot see the vault in iCloud, has a copy). Content is copied byte for
// byte in either direction — no markdown reformatting.
//
// A small state file (scripts/.trip-sync.json) records the sha256 each
// file had *at the last successful sync*. pull/push use that to detect
// "the destination side changed since we last agreed" and refuse to
// silently clobber it, unless --force is passed.
//
// Usage:
//   node scripts/trip-sync.mjs status          # read-only report, changes nothing
//   node scripts/trip-sync.mjs pull [--force]  # vault -> repo
//   node scripts/trip-sync.mjs push [--force]  # repo -> vault
//
// Env:
//   TRIP_VAULT_DIR   overrides the default vault path below.

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const REPO_DIR = path.join(REPO_ROOT, 'src', 'content', 'trip');
const STATE_FILE = path.join(__dirname, '.trip-sync.json');

const TRAVEL_ROOT =
  '/Users/seanachan/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/Travel';
const DEFAULT_VAULT_DIR = path.join(TRAVEL_ROOT, '20260830_首爾+釜山');

// The itinerary note is identified by the same marker the parser uses, so a
// folder rename in Obsidian (which has happened) does not break the sync.
const ITINERARY_MARKER = '## 每日行程';

function holdsItinerary(dir) {
  return listMdFiles(dir).some((name) => {
    try {
      return readFileSync(path.join(dir, name), 'utf8').includes(ITINERARY_MARKER);
    } catch {
      return false;
    }
  });
}

function locateVaultDir() {
  if (process.env.TRIP_VAULT_DIR) return process.env.TRIP_VAULT_DIR;
  if (existsSync(DEFAULT_VAULT_DIR)) return DEFAULT_VAULT_DIR;
  if (!existsSync(TRAVEL_ROOT)) return DEFAULT_VAULT_DIR;

  const found = readdirSync(TRAVEL_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(TRAVEL_ROOT, e.name))
    .filter(holdsItinerary);

  if (found.length === 1) {
    console.log(`note: 資料夾已更名，改用 ${path.basename(found[0])}`);
    return found[0];
  }
  if (found.length > 1) {
    throw new Error(
      `Travel/ 下有多個資料夾含行程筆記，無法判斷要用哪一個:\n` +
        found.map((d) => `  ${d}`).join('\n') +
        '\n請設定環境變數 TRIP_VAULT_DIR 指定。',
    );
  }
  return DEFAULT_VAULT_DIR;
}

const VAULT_DIR = locateVaultDir();

function assertVaultExists() {
  if (!existsSync(VAULT_DIR)) {
    throw new Error(
      `找不到 Obsidian vault 目錄:\n  ${VAULT_DIR}\n` +
        `也在 ${TRAVEL_ROOT} 下找不到含「${ITINERARY_MARKER}」的資料夾。\n` +
        '請確認 iCloud 已同步完成，或設定環境變數 TRIP_VAULT_DIR 指向正確路徑。',
    );
  }
}

function listMdFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    throw new Error(`狀態檔損毀，無法解析為 JSON: ${STATE_FILE}`);
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function readIfExists(filePath) {
  return existsSync(filePath) ? readFileSync(filePath) : null;
}

// --- diff ----------------------------------------------------------------

// Classic O(n*m) LCS-based line diff. Files here are small trip notes
// (tens of KB), so the DP table is cheap; no need for a smarter algorithm.
function diffOps(aLines, bLines) {
  const n = aLines.length;
  const m = bLines.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      ops.push({ type: 'equal', line: aLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', line: aLines[i] });
      i++;
    } else {
      ops.push({ type: 'add', line: bLines[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: 'remove', line: aLines[i++] });
  while (j < m) ops.push({ type: 'add', line: bLines[j++] });
  return ops;
}

// Simple unified-style diff: '-' = only in aText, '+' = only in bText,
// with a few lines of context around each change so a one-line edit in a
// long file doesn't dump the whole file.
function renderDiff(aText, bText, aLabel, bLabel, context = 3) {
  const ops = diffOps(aText.split('\n'), bText.split('\n'));
  const changed = [];
  ops.forEach((op, idx) => {
    if (op.type !== 'equal') changed.push(idx);
  });
  if (changed.length === 0) return [];

  const keep = new Set();
  for (const idx of changed) {
    for (let k = idx - context; k <= idx + context; k++) {
      if (k >= 0 && k < ops.length) keep.add(k);
    }
  }

  const lines = [`--- ${aLabel}`, `+++ ${bLabel}`];
  let lastPrinted = -2;
  for (let idx = 0; idx < ops.length; idx++) {
    if (!keep.has(idx)) continue;
    if (idx !== lastPrinted + 1) lines.push('  ⋮');
    const op = ops[idx];
    const prefix = op.type === 'equal' ? ' ' : op.type === 'remove' ? '-' : '+';
    lines.push(`${prefix} ${op.line}`);
    lastPrinted = idx;
  }
  return lines;
}

// --- commands --------------------------------------------------------------

function cmdStatus() {
  assertVaultExists();
  const state = loadState();
  const vaultFiles = listMdFiles(VAULT_DIR);
  const repoFiles = listMdFiles(REPO_DIR);
  const names = Array.from(new Set([...vaultFiles, ...repoFiles])).sort();

  if (names.length === 0) {
    console.log('沒有找到任何 .md 檔案（vault 與 repo 都是空的）。');
    return;
  }

  for (const name of names) {
    const vaultPath = path.join(VAULT_DIR, name);
    const repoPath = path.join(REPO_DIR, name);
    const vaultBuf = readIfExists(vaultPath);
    const repoBuf = readIfExists(repoPath);

    if (vaultBuf && !repoBuf) {
      console.log(`${name}: vault-only (repo 端缺少此檔，可用 pull 帶入)`);
      continue;
    }
    if (repoBuf && !vaultBuf) {
      // Synced before and now gone from the vault means renamed or deleted
      // there, not a file the repo is waiting to hand over.
      console.log(
        state[name] !== undefined
          ? `${name}: repo-only (vault 端已移除此檔，下次 pull 會一併刪除)`
          : `${name}: repo-only (vault 端缺少此檔，可用 push 帶入)`,
      );
      continue;
    }

    const vaultHash = sha256(vaultBuf);
    const repoHash = sha256(repoBuf);
    const recorded = state[name]?.sha256;

    let label;
    if (vaultHash === repoHash) {
      label = 'same';
    } else if (recorded === undefined) {
      label = 'both-changed (no baseline yet -- run pull/push once to establish one)';
    } else if (repoHash === recorded && vaultHash !== recorded) {
      label = 'vault-newer';
    } else if (vaultHash === recorded && repoHash !== recorded) {
      label = 'repo-newer';
    } else {
      label = 'both-changed';
    }

    console.log(`${name}: ${label}`);
    if (vaultHash !== repoHash) {
      const diff = renderDiff(
        repoBuf.toString('utf8'),
        vaultBuf.toString('utf8'),
        `repo/${name}`,
        `vault/${name}`,
      );
      for (const line of diff) console.log('  ' + line);
    }
  }
}

function cmdTransfer(direction, force) {
  assertVaultExists();
  const state = loadState();

  const [srcDir, dstDir, dstLabel] =
    direction === 'pull' ? [VAULT_DIR, REPO_DIR, 'repo'] : [REPO_DIR, VAULT_DIR, 'vault'];

  const srcFiles = listMdFiles(srcDir);
  if (srcFiles.length === 0) {
    console.log(`來源端沒有任何 .md 檔案，沒有東西可以同步。`);
    return;
  }

  // Files this tool put at the destination that the source no longer has —
  // renamed or deleted upstream. Without removing them the old copy lingers,
  // and `tripSchedule.ts` picks between the extra candidates by find order,
  // which can silently serve a stale itinerary. Only files recorded in the
  // state file are eligible: anything else at the destination was not put
  // there by this script and is none of its business.
  const stale = listMdFiles(dstDir).filter(
    (name) => !srcFiles.includes(name) && state[name] !== undefined,
  );

  // Pass 1: check for conflicts before touching anything, so a rejected
  // run leaves both sides completely untouched.
  const conflicts = [];
  for (const name of srcFiles) {
    const dstPath = path.join(dstDir, name);
    const dstBuf = readIfExists(dstPath);
    if (!dstBuf) continue; // first sync of this file, nothing to conflict with
    const recorded = state[name]?.sha256;
    if (recorded === undefined) continue; // never synced before, treat as clean
    const dstHash = sha256(dstBuf);
    if (dstHash !== recorded) conflicts.push(name);
  }

  // A stale file edited since the last sync is not obviously rubbish — it may
  // be the only copy of that edit. Treat it like any other clobber and stop.
  for (const name of stale) {
    const dstBuf = readIfExists(path.join(dstDir, name));
    if (dstBuf && sha256(dstBuf) !== state[name].sha256) conflicts.push(name);
  }

  if (conflicts.length > 0 && !force) {
    console.error(`拒絕執行 ${direction}：以下檔案在 ${dstLabel} 端有尚未同步的修改：`);
    for (const name of conflicts) console.error(`  - ${name}`);
    console.error(
      `請先跑 ${direction === 'pull' ? 'push' : 'pull'} 同步回去，或加上 --force 強制覆蓋 ${dstLabel} 端。`,
    );
    process.exitCode = 1;
    return;
  }

  // Pass 2: copy + update state.
  if (!existsSync(dstDir)) mkdirSync(dstDir, { recursive: true });
  let count = 0;
  for (const name of srcFiles) {
    const srcPath = path.join(srcDir, name);
    const dstPath = path.join(dstDir, name);
    copyFileSync(srcPath, dstPath);
    const hash = sha256(readFileSync(srcPath));
    state[name] = { sha256: hash, syncedAt: new Date().toISOString() };
    count++;
    console.log(`${direction === 'pull' ? '<-' : '->'} ${name}`);
  }

  let removed = 0;
  for (const name of stale) {
    const dstPath = path.join(dstDir, name);
    if (existsSync(dstPath)) unlinkSync(dstPath);
    delete state[name];
    removed++;
    console.log(`x  ${name}（來源端已移除）`);
  }

  saveState(state);
  console.log(
    removed > 0
      ? `完成，已同步 ${count} 個檔案，移除 ${removed} 個來源端已不存在的檔案。`
      : `完成，已同步 ${count} 個檔案。`,
  );
}

// --- main --------------------------------------------------------------

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const force = rest.includes('--force');

  switch (command) {
    case 'status':
      cmdStatus();
      break;
    case 'pull':
      cmdTransfer('pull', force);
      break;
    case 'push':
      cmdTransfer('push', force);
      break;
    default:
      console.error('用法: node scripts/trip-sync.mjs <status|pull|push> [--force]');
      process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
