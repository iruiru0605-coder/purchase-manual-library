import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '..');
const logDir = join(root, '.manual-library', 'logs');
mkdirSync(logDir, { recursive: true });

const launcherLog = join(logDir, 'launcher.log');
const outLog = join(logDir, 'app.out.log');
const errLog = join(logDir, 'app.err.log');
const healthUrl = 'http://localhost:5174/api/health';
const appUrl = 'http://localhost:5174';

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  createWriteStream(launcherLog, { flags: 'a' }).end(line);
}

function runChecked(command, args) {
  log(`run: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    shell: false,
    stdio: 'pipe',
    windowsHide: true
  });
  if (result.status !== 0) {
    log(`failed: ${command} ${args.join(' ')}`);
    log(String(result.stderr || result.stdout || ''));
    throw new Error(`${command} failed`);
  }
}

function checkHealth() {
  return new Promise(resolveHealth => {
    const req = http.get(healthUrl, res => {
      res.resume();
      resolveHealth(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.setTimeout(1500, () => {
      req.destroy();
      resolveHealth(false);
    });
    req.on('error', () => resolveHealth(false));
  });
}

async function waitForHealth() {
  for (let i = 0; i < 30; i += 1) {
    if (await checkHealth()) return true;
    await new Promise(resolveWait => setTimeout(resolveWait, 1000));
  }
  return false;
}

function startServer() {
  log('starting production server');
  const out = createWriteStream(outLog, { flags: 'a' });
  const err = createWriteStream(errLog, { flags: 'a' });
  const child = spawn(process.execPath, ['scripts/start-production.js'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  child.unref();
}

function openBrowser() {
  log(`opening ${appUrl}`);
  const child = spawn('cmd.exe', ['/c', 'start', '', appUrl], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
}

try {
  log('launcher started');
  if (!existsSync(join(root, 'node_modules'))) {
    runChecked('npm.cmd', ['install']);
  }
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    runChecked('npm.cmd', ['run', 'build']);
  }
  if (!(await checkHealth())) {
    startServer();
  }
  if (!(await waitForHealth())) {
    throw new Error('server did not become healthy');
  }
  openBrowser();
  log('launcher finished');
} catch (error) {
  log(`error: ${error?.stack || error?.message || error}`);
}
