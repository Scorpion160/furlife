import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const adminRoot = dirname(scriptDir);
const nextPackage = require.resolve('next/package.json');
const nextBin = join(dirname(nextPackage), 'dist', 'bin', 'next');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error('Could not reserve a local port for Admin smoke test.'));
        else resolve(port);
      });
    });
  });
}

function stopProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGTERM');
}

async function waitForAdmin(url, child, logs) {
  const deadline = Date.now() + 60_000;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js Admin exited before becoming ready.\n${logs.join('')}`);
    }

    try {
      const response = await fetch(url, { redirect: 'error' });
      if (response.ok) return response;
      lastError = new Error(`Admin returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Admin did not become ready. ${lastError?.message ?? ''}\n${logs.join('')}`);
}

const port = await reservePort();
const url = `http://127.0.0.1:${port}/`;
const logs = [];
const child = spawn(
  process.execPath,
  [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: adminRoot,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);

child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

try {
  const response = await waitForAdmin(url, child, logs);
  const html = await response.text();

  assert.equal(response.status, 200, 'Admin root must return HTTP 200.');
  assert.match(html, /<html[^>]*lang=["']fr["']/i, 'Admin root must declare French document language.');
  assert.match(html, /Furlife Admin/i, 'Admin root must expose the expected metadata title.');
  assert.match(html, />Administration</i, 'Admin root must render the Administration heading.');

  console.log(`Admin smoke test: PASS (${response.status} ${url})`);
} finally {
  stopProcessTree(child);
}
