import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

let failed = false;

function quoteCmdArg(value) {
  const text = String(value);
  if (!/[\s&|<>^()%!"]/u.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function commandOutput(command, args) {
  const options = {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  };

  if (process.platform === 'win32') {
    // corepack and Flutter are .cmd/.bat launchers on Windows. Node's
    // execFileSync cannot execute batch files directly, so resolve them
    // through cmd.exe while keeping command/arguments fixed by this script.
    const commandLine = [command, ...args].map(quoteCmdArg).join(' ');
    return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], options);
  }

  return execFileSync(command, args, options);
}

function firstLine(command, args) {
  return commandOutput(command, args).trim().split(/\r?\n/u)[0];
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major === 22 && minor >= 16) {
  console.log(`OK   node: v${process.versions.node}`);
} else {
  console.error(`FAIL node: v${process.versions.node}; Furlife pins Node 22.16.x+ (<23)`);
  failed = true;
}

try {
  const output = firstLine('corepack', ['pnpm', '--version']);
  console.log(`OK   pnpm via Corepack: ${output}`);
} catch {
  try {
    const output = firstLine('pnpm', ['--version']);
    console.log(`OK   pnpm: ${output}`);
  } catch {
    console.error('MISS pnpm/Corepack pnpm');
    failed = true;
  }
}

try {
  console.log(`OK   docker: ${firstLine('docker', ['--version'])}`);
} catch {
  console.error('MISS docker');
  failed = true;
}

try {
  const flutterMachine = JSON.parse(commandOutput('flutter', ['--version', '--machine']));
  if (flutterMachine.frameworkVersion !== '3.44.9' || flutterMachine.channel !== 'stable') {
    console.error(`FAIL flutter: ${flutterMachine.frameworkVersion} ${flutterMachine.channel}; Furlife pins Flutter 3.44.9 stable`);
    failed = true;
  } else {
    console.log(`OK   flutter: ${flutterMachine.frameworkVersion} ${flutterMachine.channel}`);
  }
} catch {
  console.error('MISS flutter');
  failed = true;
}

if (!existsSync('.env.local')) {
  console.error('MISS .env.local');
  failed = true;
} else {
  const env = readFileSync('.env.local', 'utf8');
  if (env.includes('CHANGE_ME')) {
    console.error('FAIL .env.local still contains CHANGE_ME placeholders');
    failed = true;
  } else {
    console.log('OK   .env.local has no CHANGE_ME placeholder');
  }
  for (const expected of ['POSTGRES_HOST_PORT=55432', 'REDIS_HOST_PORT=56379', 'MINIO_API_HOST_PORT=59000', 'MINIO_CONSOLE_HOST_PORT=59001']) {
    if (!env.includes(expected)) {
      console.error(`FAIL .env.local missing ${expected}`);
      failed = true;
    }
  }
}

try {
  execFileSync(process.execPath, ['scripts/verify-baseline.mjs'], { stdio: 'inherit' });
} catch {
  failed = true;
}

if (failed) process.exit(1);
console.log('Developer workstation doctor: PASS');
