import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath is mandatory here: URL.pathname produces /C:/... on Windows,
// which path.join can turn into C:\\C:\\... .
const root = fileURLToPath(new URL('../', import.meta.url));
const failures = [];
const warnings = [];

function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }
function text(path) { return readFileSync(join(root, path), 'utf8'); }
function json(path) { return JSON.parse(text(path)); }

const rootPackage = json('package.json');
const rootScripts = rootPackage.scripts ?? {};
for (const name of ['dev', 'build', 'lint', 'test', 'typecheck', 'verify', 'db:validate', 'db:migrate:dev', 'db:migrate:deploy']) {
  if (!String(rootScripts[name] ?? '').includes('corepack pnpm')) fail(`root script must invoke pnpm through Corepack: ${name}`);
}
if (rootPackage.packageManager !== 'pnpm@9.15.4') fail('packageManager must stay pinned to pnpm@9.15.4');
if (rootPackage.engines?.node !== '>=22.16.0 <23') fail('Node engine range changed unexpectedly');
if (text('.node-version').trim() !== '22.16.0') fail('.node-version must stay pinned to 22.16.0');
if (text('.flutter-version').trim() !== '3.44.9') fail('.flutter-version must stay pinned to 3.44.9');

const backendPackage = json('apps/backend/package.json');
for (const direct of ['express', '@nestjs/common', '@nestjs/platform-express', '@prisma/client']) {
  if (!backendPackage.dependencies?.[direct]) fail(`backend direct dependency missing: ${direct}`);
}
if (!backendPackage.devDependencies?.['@types/express']) fail('backend @types/express must be direct');
if (!backendPackage.devDependencies?.['ts-jest']) fail('backend ts-jest must be a direct dev dependency');
if (!String(backendPackage.scripts?.test ?? '').includes('jest.config.cjs')) fail('backend test script must use explicit Jest TypeScript config');
const jestConfig = text('apps/backend/jest.config.cjs');
if (!jestConfig.includes("'ts-jest'")) fail('backend Jest config must transform TypeScript with ts-jest');

const schema = text('apps/backend/prisma/schema.prisma');
for (const field of ['accessTokenHash', 'refreshTokenHash', 'familyId', 'accessExpiresAt', 'refreshExpiresAt', 'revokedAt']) {
  if (!schema.includes(field)) fail(`Prisma Session safety field missing: ${field}`);
}
if (/\n\s*expiresAt\s+DateTime\n/.test(schema.slice(schema.indexOf('model Session'), schema.indexOf('model VerificationChallenge')))) {
  fail('obsolete generic Session.expiresAt field detected');
}

const envSchema = text('apps/backend/src/config/env.schema.ts');
for (const guard of ['Development OTP adapter is forbidden in staging/production', 'Wildcard CORS origin is forbidden', 'Swagger must be disabled in production']) {
  if (!envSchema.includes(guard)) fail(`environment fail-closed guard missing: ${guard}`);
}

const compose = text('infra/docker-compose.dev.yml');
for (const port of [
  '127.0.0.1:${POSTGRES_HOST_PORT:-55432}:5432',
  '127.0.0.1:${REDIS_HOST_PORT:-56379}:6379',
  '127.0.0.1:${MINIO_API_HOST_PORT:-59000}:9000',
  '127.0.0.1:${MINIO_CONSOLE_HOST_PORT:-59001}:9001',
]) {
  if (!compose.includes(port)) fail(`dev service must use dedicated localhost port mapping: ${port}`);
}

const gitignore = text('.gitignore');
if (!gitignore.includes('.env.*') || !gitignore.includes('!.env.example')) {
  fail('.gitignore must ignore local environment files while keeping .env.example tracked');
}

const envExample = text('.env.example');
if (!envExample.includes('APP_ENV=development')) fail('.env.example must define APP_ENV');
if (/^NODE_ENV=/m.test(envExample)) fail('NODE_ENV must not be persisted in shared .env.example');
if (!envSchema.includes('APP_ENV:')) fail('backend must use APP_ENV for deployment stage policy');
for (const setting of [
  'POSTGRES_HOST_PORT=55432',
  'REDIS_HOST_PORT=56379',
  'MINIO_API_HOST_PORT=59000',
  'MINIO_CONSOLE_HOST_PORT=59001',
]) {
  if (!envExample.includes(setting)) fail(`dev host port setting missing: ${setting}`);
}

const flutterConfig = text('apps/client_flutter/lib/core/config/app_config.dart');
if (!flutterConfig.includes("env == 'staging' || env == 'production'")) fail('Flutter must enforce HTTPS in staging/production');
const tokenStore = text('apps/client_flutter/lib/core/storage/token_store.dart');
if (!tokenStore.includes('FlutterSecureStorage')) fail('Flutter auth tokens must use secure storage');

const windowsBootstrap = text('scripts/bootstrap-windows.ps1');
if (!windowsBootstrap.includes('Import-DotEnvFile')) fail('Windows bootstrap must import .env.local before Prisma CLI');
if (!windowsBootstrap.includes('Download-LargeFile')) fail('Windows bootstrap must use robust large-file download helper for Flutter');
if (!windowsBootstrap.includes('curl.exe')) fail('Windows Flutter bootstrap must prefer curl.exe for large archives');
if (!windowsBootstrap.includes('Get-FreeSpaceBytes')) fail('Windows Flutter bootstrap must preflight disk capacity before SDK extraction');
if (!windowsBootstrap.includes('10 * 1GB')) fail('Windows Flutter bootstrap must reserve extraction headroom');
if (!windowsBootstrap.includes('Extracting Flutter with tar.exe')) fail('Windows Flutter bootstrap must prefer tar.exe over Expand-Archive for the large Flutter SDK');
if (!windowsBootstrap.includes('Existing Flutter archive checksum: OK. Reusing download.')) fail('Windows Flutter bootstrap must reuse a verified Flutter archive after a failed extraction');
if (!windowsBootstrap.includes("throw 'Downloaded archive is empty.'")) fail('Windows Flutter bootstrap must reject empty downloads');
if (!windowsBootstrap.includes("SetEnvironmentVariable('NODE_ENV', $null, 'Process')")) fail('Windows bootstrap must leave NODE_ENV framework-managed');
if (!windowsBootstrap.includes('v0.3.10')) fail('Windows bootstrap version marker must be v0.3.10');
if (!windowsBootstrap.includes("$flutterMachine.channel -eq 'stable'")) fail('Windows bootstrap must require stable Flutter for system SDK reuse');
const windowsBootstrapBytes = readFileSync(join(root, 'scripts/bootstrap-windows.ps1'));
if (windowsBootstrapBytes[0] === 0xef && windowsBootstrapBytes[1] === 0xbb && windowsBootstrapBytes[2] === 0xbf) fail('Windows bootstrap must not contain a UTF-8 BOM');
if ([...windowsBootstrapBytes].some((byte) => byte > 0x7f)) fail('Windows bootstrap must remain ASCII-only for Windows PowerShell 5.1');

const eslintConfig = text('eslint.config.mjs');
if (!eslintConfig.includes("typescript-eslint")) fail('shared TypeScript ESLint flat config missing');


try {
  statSync(join(root, 'apps/admin/src/app'));
  fail('duplicate Next.js app router detected at apps/admin/src/app; canonical router is apps/admin/app');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const adminPage = text('apps/admin/app/page.tsx');
if (!adminPage.includes('Administration')) fail('Admin App Router bootstrap page missing');
const adminPackage = json('apps/admin/package.json');
if (String(adminPackage.scripts?.test ?? '').includes('not implemented')) fail('Admin test script must not be a placeholder');
if (adminPackage.scripts?.test !== 'node scripts/smoke-test.mjs') fail('Admin test script must run the HTTP smoke test');
const adminSmoke = text('apps/admin/scripts/smoke-test.mjs');
for (const assertion of ['Admin smoke test: PASS', 'response.status', 'Furlife Admin', 'Administration']) {
  if (!adminSmoke.includes(assertion)) fail(`Admin smoke-test assertion missing: ${assertion}`);
}
const gitAttributes = text('.gitattributes');
if (!gitAttributes.includes('*.ps1 text eol=lf')) fail('PowerShell scripts must be normalized to LF');
for (const l10nPath of ['apps/client_flutter/l10n.yaml', 'apps/partner_flutter/l10n.yaml']) {
  if (text(l10nPath).includes('synthetic-package')) fail(`obsolete Flutter l10n synthetic-package option detected: ${l10nPath}`);
}
if (tokenStore.includes('value!.isEmpty')) fail('obsolete unnecessary non-null assertion detected in TokenStore');
const doctor = text('scripts/dev-doctor.mjs');
if (!doctor.includes("process.platform === 'win32'") || !doctor.includes("process.env.ComSpec || 'cmd.exe'")) {
  fail('developer doctor must support Windows .cmd/.bat launchers');
}
const partnerSmokeTest = text('apps/partner_flutter/test/bootstrap_test.dart');
if (!partnerSmokeTest.includes('bootstrap test harness')) fail('Partner Flutter smoke test missing');

const ci = text('.github/workflows/ci.yml');
if (!ci.includes('pnpm install --frozen-lockfile')) fail('CI must use frozen pnpm lockfile');
if (!ci.includes('flutter-version: 3.44.9')) fail('CI must pin Flutter 3.44.9');
if (!ci.includes('flutter gen-l10n')) fail('CI must generate Flutter localization before analysis');

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (['.git', '.tools', 'node_modules', '.dart_tool', 'build', 'dist'].includes(name)) continue;
    const full = join(dir, name);
    const rel = relative(root, full).replaceAll('\\', '/');
    const stat = statSync(full);
    if (stat.isDirectory()) { walk(full); continue; }
    if (/(^|\/)\.env($|\.)/.test(rel) && !rel.endsWith('.env.example') && rel !== '.env.example') {
      // .env.local is an expected runtime-only file generated after extraction.
      // GitHub CI separately verifies that no environment file is tracked by Git.
      if (rel !== '.env.local') fail(`environment file forbidden in baseline tree: ${rel}`);
    }
    const extension = extname(name).toLowerCase();
    if (['.ts', '.tsx', '.dart', '.json', '.yaml', '.yml', '.md', '.mjs', '.toml', '.ps1', '.sh'].includes(extension) || ['.editorconfig', '.npmrc', '.gitattributes', '.gitignore', '.node-version', '.flutter-version'].includes(name)) {
      const content = readFileSync(full);
      if (content.includes(13)) fail(`CRLF detected: ${rel}`);
    }
  }
}
walk(root);

try {
  statSync(join(root, 'pnpm-lock.yaml'));
} catch {
  warn('pnpm-lock.yaml is not generated yet; Node CI cannot be considered green');
}
try {
  statSync(join(root, 'apps/backend/prisma/migrations'));
} catch {
  warn('Prisma migrations directory is not generated yet; DB gate remains open');
}

for (const message of warnings) console.warn(`WARN: ${message}`);
if (failures.length) {
  for (const message of failures) console.error(`FAIL: ${message}`);
  process.exit(1);
}
console.log('Baseline structural checks: PASS');
