import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const name = 'cuotiben-ai';
const root = fileURLToPath(new URL('../', import.meta.url));
const variables = ['DOUBAO_API_KEY', 'DOUBAO_MODEL_ID', 'CLOUDBASE_ENV_ID', 'CLOUDBASE_APIKEY'];
for (const key of variables) if (!process.env[key]?.trim()) throw Error('缺少云端变量 ' + key);
const stage = mkdtempSync(join(tmpdir(), 'cuotiben-function-'));
try {
  const dir = join(stage, 'functions', name);
  mkdirSync(dir, { recursive: true });
  for (const path of ['server', 'shared', 'api', 'package.json', 'package-lock.json'])
    cpSync(join(root, path), join(dir, path), { recursive: true });
  for (const file of ['index.js', 'scf_bootstrap']) cpSync(join(root, 'functions', name, file), join(dir, file));
  const config = { version: '2.0', envId: process.env.CLOUDBASE_ENV_ID, functionRoot: 'functions',
    functions: [{ name, type: 'HTTP', runtime: 'Nodejs20.19', timeout: 150, memorySize: 512,
      installDependency: true, public: true, gatewayPath: '/' + name,
      envVariables: Object.fromEntries(variables.map(key => [key, '{{env.' + key + '}}'])) }] };
  writeFileSync(join(stage, 'cloudbaserc.json'), JSON.stringify(config));
  const flags = process.argv.includes('--update') ? ['--force'] : [];
  execFileSync('tcb', ['fn', 'deploy', name, '--httpFn', '--path', '/' + name, '--dir', dir,
    '-e', process.env.CLOUDBASE_ENV_ID, ...flags], { cwd: stage, stdio: 'inherit' });
} finally {
  rmSync(stage, { recursive: true, force: true });
}
