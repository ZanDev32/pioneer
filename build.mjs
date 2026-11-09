/**
 * Build script for Pioneer MCP server.
 * Bundles the server into a single file using esbuild.
 */

import esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'server.js')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: path.join(__dirname, 'dist', 'server.js'),
  format: 'esm',
  external: ['child_process', 'fs', 'path', 'os', 'crypto', 'net'],
}).catch(() => process.exit(1));

console.log('Built dist/server.js successfully');
