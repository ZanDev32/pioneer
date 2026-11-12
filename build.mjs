/**
 * Build script for Pioneer MCP server.
 * Bundles the server into a single file using esbuild.
 */

import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

await esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'server.js')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(__dirname, 'dist', 'server.js'),
  format: 'esm',
  define: { __PIONEER_VERSION__: JSON.stringify(pkg.version) },
  external: ['child_process', 'fs', 'path', 'os', 'crypto', 'net'],
}).catch(() => process.exit(1));

console.log('Built dist/server.js successfully');
