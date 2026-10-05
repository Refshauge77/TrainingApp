// Runs the API server (restarting on changes) and the Vite dev server together.
// Plain Node so it works the same on Windows, macOS and Linux.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (args) => spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });

const children = [
  run(['--disable-warning=ExperimentalWarning', '--watch', 'server/index.js']),
  run(['node_modules/vite/bin/vite.js', 'client']),
];

function stop() {
  for (const child of children) child.kill();
  process.exit();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', stop);
