// Runs the API server (restarting on changes) and the Vite dev server together.
// Plain Node so it works the same on Windows, macOS and Linux.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const CLIENT_URL = 'http://localhost:5173';
const run = (args) => spawn(process.execPath, args, {
  cwd: root, stdio: 'inherit', env: { ...process.env, KAJAK_DEV_CLIENT_URL: CLIENT_URL },
});

console.log(`\n  Åbn appen på ${CLIENT_URL}\n`);

const children = [
  run(['--disable-warning=ExperimentalWarning', '--watch', 'server/index.js']),
  run(['node_modules/vite/bin/vite.js', 'client', '--port', '5173', '--strictPort']),
];

function stop() {
  for (const child of children) child.kill();
  process.exit();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', stop);
