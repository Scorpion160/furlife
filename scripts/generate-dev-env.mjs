import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = '.env.local';
if (existsSync(target) && !process.argv.includes('--force')) {
  console.log(`${target} existe déjà; aucune modification.`);
  process.exit(0);
}

const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
const dbPassword = token(24);
const s3Access = `furlife${token(12)}`.slice(0, 24);
const s3Secret = token(36);
const privacySecret = token(48);
const otpSecret = token(48);

let env = readFileSync('.env.example', 'utf8');
env = env
  .replaceAll('CHANGE_ME_DB', dbPassword)
  .replaceAll('CHANGE_ME_S3_ACCESS', s3Access)
  .replaceAll('CHANGE_ME_S3_SECRET', s3Secret)
  .replaceAll('CHANGE_ME_MINIMUM_32_RANDOM_CHARACTERS', privacySecret)
  .replaceAll('CHANGE_ME_DIFFERENT_MIN_32_RANDOM_CHARACTERS', otpSecret)
  .replace('OTP_DEV_EXPOSE_CODE=false', 'OTP_DEV_EXPOSE_CODE=true');

if (env.includes('CHANGE_ME')) {
  throw new Error('Un placeholder CHANGE_ME non reconnu subsiste; génération annulée.');
}
writeFileSync(target, env, { encoding: 'utf8', mode: 0o600 });
console.log(`${target} généré avec des secrets aléatoires locaux. Ne jamais le commiter.`);
