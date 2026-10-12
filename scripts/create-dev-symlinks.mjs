import { lstat, readlink, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const links = [
  ['index.js', 'dist/index.js'],
  ['tui.ts', 'dist/tui.js'],
];

for (const [name, target] of links) {
  const path = join(root, name);

  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() && (await readlink(path)) === target) continue;
    throw new Error(`Refusing to replace existing ${name}; remove it manually to create the build symlink`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await symlink(target, path, 'file');
}
