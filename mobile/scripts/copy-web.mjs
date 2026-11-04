// Copies the shared web frontend into ./www, which Capacitor packages into the native app.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, '..', 'frontend');
const dest = resolve(root, 'www');

if (!existsSync(src)) throw new Error(`Frontend not found at ${src}`);
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
