// Stages the static game into www/ for Capacitor and GitHub Pages.
// Run with: npm run build:web
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'www');
const entries = ['index.html', 'css', 'js', 'assets', 'vendor'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of entries) {
    await cp(path.join(root, entry), path.join(output, entry), {
        recursive: true,
        filter: (source) => !source.endsWith('.DS_Store')
    });
}

console.log(`Staged static build in ${path.relative(process.cwd(), output)}/`);
