import { configurationChecks } from '../src/lib/readiness';
try { process.loadEnvFile('.env'); } catch { /* Platform-injected env is supported. */ }
const checks = configurationChecks(process.env);
for (const check of checks) console.log(`${check.ready ? 'PASS' : 'FAIL'} ${check.label}: ${check.detail}`);
if (checks.some((check) => !check.ready)) process.exitCode = 1;
