#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

export const digest = value => createHash('sha256').update(value).digest('hex');
export function safeUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use an HTTPS URL without credentials, query or fragment (HTTP allowed only on loopback).');
  }
  return url;
}
export async function fetchText(url, fetcher = fetch, options = {}) {
  safeUrl(url);
  const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error('Response exceeds package limit.');
  return text;
}
export async function stat(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function validateBundle(bundle) {
  if (!bundle || typeof bundle.version !== 'string' || !Array.isArray(bundle.files) || !bundle.files.length || bundle.files.length > 100) throw new Error('Invalid bundle.');
  const seen = new Set();
  for (const file of bundle.files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string' ||
        !/^(scripts\/[a-z-]+\.mjs|skills\/agentrun\/(SKILL\.md|references\/[a-z-]+\.md))$/.test(file.path) || seen.has(file.path)) throw new Error('Unsafe or duplicate package path.');
    seen.add(file.path);
  }
  for (const required of ['skills/agentrun/SKILL.md', 'scripts/cli.mjs', 'scripts/install.mjs']) {
    if (!seen.has(required)) throw new Error(`Package missing ${required}`);
  }
}
async function ownedDirectory(dir) {
  const info = await stat(dir);
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error(`Refusing non-directory: ${dir}`);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}
export async function install({ source, home = os.homedir(), fetcher = fetch }) {
  source = safeUrl(source).href.replace(/\/$/, '');
  const manifest = JSON.parse(await fetchText(`${source}/manifest.json`, fetcher));
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.bundle !== `${manifest.sha256}.json`) throw new Error('Invalid manifest.');
  const raw = await fetchText(`${source}/${manifest.bundle}`, fetcher);
  if (digest(raw) !== manifest.sha256) throw new Error('Bundle checksum mismatch.');
  const bundle = JSON.parse(raw);
  validateBundle(bundle);
  if (bundle.version !== manifest.version) throw new Error('Version mismatch.');
  const root = path.join(home, '.agentrun-skills');
  await ownedDirectory(root);
  const releases = path.join(root, 'releases');
  await ownedDirectory(releases);
  const release = path.join(releases, manifest.sha256);
  const existing = await stat(release);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('Unsafe existing release.');
    for (const file of bundle.files) {
      const location = path.join(release, file.path);
      if (!(await stat(location))?.isFile() || await fs.realpath(location) !== location || await fs.readFile(location, 'utf8') !== file.content) throw new Error('Installed release was modified; refusing to overwrite it.');
    }
  } else {
    const stage = path.join(releases, `.stage-${randomUUID()}`);
    await fs.mkdir(stage, { mode: 0o700 });
    try {
      for (const file of bundle.files) {
        const dest = path.join(stage, file.path);
        await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
        await fs.writeFile(dest, file.content, { flag: 'wx', mode: 0o600 });
      }
      await fs.rename(stage, release);
    } finally { await fs.rm(stage, { recursive: true, force: true }); }
  }
  const current = path.join(root, 'current');
  const currentInfo = await stat(current);
  if (currentInfo && !currentInfo.isSymbolicLink()) throw new Error('Existing current path is user-owned; refusing to replace it.');
  const previous = currentInfo ? await fs.readlink(current) : null;
  if (previous && !/^releases\/[a-f0-9]{64}$/.test(previous)) throw new Error('Existing current link is not managed by agentrun-skills.');
  const link = path.join(root, `.current-${randomUUID()}`);
  await fs.symlink(`releases/${manifest.sha256}`, link);
  await fs.rename(link, current);
  const skipped = [];
  for (const client of ['.agents', '.claude', '.codex', '.cursor']) {
    const dir = path.join(home, client, 'skills');
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, 'agentrun');
    const expected = path.join(current, 'skills/agentrun');
    const info = await stat(target);
    if (info) {
      if (!info.isSymbolicLink() || path.resolve(dir, await fs.readlink(target)) !== expected) skipped.push(target);
    } else { await fs.symlink(expected, target); }
  }
  return { installed: true, updated: previous !== `releases/${manifest.sha256}`, version: bundle.version, revision: manifest.sha256, skill: path.join(current, 'skills/agentrun/SKILL.md'), skipped };
}
export function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Expected --option value.');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = args(process.argv.slice(2));
    if (!options.source) throw new Error('Usage: node install.mjs --source https://CONSOLE/agentrun-skills');
    console.log(JSON.stringify(await install({ source: options.source, home: options.home }), null, 2));
  } catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
}
