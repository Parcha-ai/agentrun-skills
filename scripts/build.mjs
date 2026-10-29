import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, digest, validateBundle } from './install.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = args(process.argv.slice(2));
const output = options.out ? path.resolve(options.out) : path.join(root, 'dist');
const files = [];
for (const name of ['install.mjs', 'cli.mjs']) files.push({ path: `scripts/${name}`, content: await fs.readFile(path.join(root, 'scripts', name), 'utf8') });
async function collect(dir) {
  for (const entry of (await fs.readdir(path.join(root, dir), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const name = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await collect(name);
    else files.push({ path: name, content: await fs.readFile(path.join(root, name), 'utf8') });
  }
}
await collect('skills');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
const bundle = { version, files };
validateBundle(bundle);
const raw = JSON.stringify(bundle);
const sha256 = digest(raw);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, `${sha256}.json`), raw);
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ name: 'agentrun-skills', version, sha256, bundle: `${sha256}.json` }, null, 2)+'\n');
await fs.copyFile(path.join(root, 'scripts/install.mjs'), path.join(output, 'install.mjs'));
// Public entrypoints are readable even before the coding agent installs the package.
for (const file of files.filter(file => file.path.startsWith('skills/'))) {
  const dest = path.join(output, file.path.replace('skills/agentrun/', ''));
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, file.content);
}
console.log(JSON.stringify({ output, version, sha256 }));
