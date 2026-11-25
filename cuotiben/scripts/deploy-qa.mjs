import { execFileSync } from 'node:child_process';

const alias = 'cuotiben-qa-xiaoweis-projects-cf1fe430.vercel.app';
const output = execFileSync('vercel', ['deploy', '--yes', '--json'], {
  encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'],
});
const { deployment } = JSON.parse(output);
if (deployment?.environment !== 'preview' || deployment.readyState !== 'READY') {
  throw new Error('预览部署未就绪，验收域名仍指向上一版。');
}
execFileSync('vercel', ['alias', 'set', deployment.url, alias], { stdio: 'inherit' });
console.log(JSON.stringify({ url: deployment.url, id: deployment.id, preview: 'https://' + alias }));
