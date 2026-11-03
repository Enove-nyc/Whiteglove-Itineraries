// Preload for disposable SQL verification only; never used by production startup.
import { createRequire } from 'node:module';
import { neonConfig } from '@neondatabase/serverless';
if (process.env.AUDIT_ISOLATED !== '1' || new URL(process.env.DATABASE_URL || 'https://invalid').hostname !== '127.0.0.1' || new URL(process.env.UPSTASH_REDIS_REST_URL || 'https://invalid').hostname !== '127.0.0.1') throw Error('Cost verification requires disposable loopback stores.');
// Neon normally pipelines a password; the disposable Postgres trusts loopback clients.
// Waiting for AuthenticationOk avoids sending a password after authentication completed.
neonConfig.pipelineConnect = false;
// Prisma/Next can load the CommonJS export alongside the ESM export.
createRequire(import.meta.url)('@neondatabase/serverless').neonConfig.pipelineConnect = false;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname !== '127.0.0.1') throw Error('Cost fixtures cannot call external services.');
  return nativeFetch(input, init);
};
