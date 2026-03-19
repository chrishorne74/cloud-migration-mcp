#!/usr/bin/env node
/**
 * Packages the cloud-migration MCP server into a .mcpb bundle (ZIP archive).
 *
 * Usage: node scripts/build-mcpb.js
 * Output: dist/cloud-migration.mcpb
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'cloud-migration.mcpb');
const STAGING = path.join(OUT_DIR, '_mcpb_staging');

function log(msg) { console.log(`  ${msg}`); }

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n  Building cloud-migration.mcpb\n');

rimraf(STAGING);
fs.mkdirSync(STAGING, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

log('Copying manifest.json …');
fs.copyFileSync(path.join(ROOT, 'manifest.json'), path.join(STAGING, 'manifest.json'));

log('Copying build/ …');
copyDir(path.join(ROOT, 'build'), path.join(STAGING, 'build'));

log('Copying guardrails/ …');
copyDir(path.join(ROOT, 'guardrails'), path.join(STAGING, 'guardrails'));

log('Copying criteria/ …');
copyDir(path.join(ROOT, 'criteria'), path.join(STAGING, 'criteria'));

log('Installing production dependencies …');
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(STAGING, 'package.json'));
fs.copyFileSync(path.join(ROOT, 'package-lock.json'), path.join(STAGING, 'package-lock.json'));
execSync('npm install --omit=dev --ignore-scripts', {
  cwd: STAGING,
  stdio: 'pipe',
});
fs.unlinkSync(path.join(STAGING, 'package.json'));
fs.unlinkSync(path.join(STAGING, 'package-lock.json'));

log('Creating ZIP archive …');

if (process.platform === 'win32') {
  const TMP_ZIP = path.join(OUT_DIR, 'cloud-migration.zip');
  if (fs.existsSync(TMP_ZIP)) fs.unlinkSync(TMP_ZIP);
  if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE);
  execSync(
    `powershell -Command "Compress-Archive -Path '${STAGING}\\*' -DestinationPath '${TMP_ZIP}'"`,
    { stdio: 'pipe' }
  );
  fs.renameSync(TMP_ZIP, OUT_FILE);
} else {
  if (fs.existsSync(OUT_FILE)) fs.unlinkSync(OUT_FILE);
  execSync(`cd "${STAGING}" && zip -r "${OUT_FILE}" .`, { stdio: 'pipe', shell: true });
}

rimraf(STAGING);

const size = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(1);
console.log(`\n  Done!  →  dist/cloud-migration.mcpb  (${size} MB)\n`);
