import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const path = '.env.local';
if (!existsSync(path)) process.exit(0);

let env = readFileSync(path, 'utf8');
const before = env;

env = env
  .replaceAll('@localhost:5432/', '@localhost:55432/')
  .replaceAll('redis://localhost:6379', 'redis://localhost:56379')
  .replaceAll('http://localhost:9000', 'http://localhost:59000');

// Furlife uses APP_ENV for its deployment stage. NODE_ENV is reserved for
// Node/Next/Jest and must not be persisted in the shared monorepo env file.
const nodeEnvMatch = env.match(/^NODE_ENV=(development|test|staging|production)\s*$/m);
if (!/^APP_ENV=/m.test(env)) {
  const appEnv = nodeEnvMatch?.[1] ?? 'development';
  env = `APP_ENV=${appEnv}\n${env}`;
}
env = env.replace(/^NODE_ENV=.*(?:\r?\n|$)/gm, '');

const additions = [
  ['POSTGRES_HOST_PORT', '55432'],
  ['REDIS_HOST_PORT', '56379'],
  ['MINIO_API_HOST_PORT', '59000'],
  ['MINIO_CONSOLE_HOST_PORT', '59001'],
];

const missing = additions.filter(([key]) => !new RegExp(`^${key}=`, 'm').test(env));
if (missing.length) {
  env = `${env.trimEnd()}\n\n# Dedicated Furlife host ports\n${missing.map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
}

if (env !== before) {
  writeFileSync(path, env, 'utf8');
  console.log('.env.local upgraded: APP_ENV + dedicated Furlife ports; secrets preserved.');
} else {
  console.log('.env.local already up to date.');
}
