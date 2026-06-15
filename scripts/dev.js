import { spawn } from 'node:child_process';

const commands = [
  ['server', 'node', ['server/index.js']],
  ['client', 'npx', ['vite', '--host', '0.0.0.0']]
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  });

  child.stdout.on('data', chunk => process.stdout.write(prefix(name, chunk)));
  child.stderr.on('data', chunk => process.stderr.write(prefix(name, chunk)));
  child.on('exit', code => {
    if (code && !shuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
});

let shuttingDown = false;
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function shutdown(code) {
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}

function prefix(name, chunk) {
  return String(chunk)
    .split('\n')
    .map(line => (line ? `[${name}] ${line}` : line))
    .join('\n');
}
