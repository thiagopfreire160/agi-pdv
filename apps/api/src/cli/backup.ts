// Cópia de segurança do banco: npm run backup
// Gera backups/nexo-AAAA-MM-DD-HHMM.sql.gz na raiz do projeto e apaga os mais antigos.
// Usa o pg_dump instalado no computador; se não houver, usa o do contêiner Docker.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const pasta = resolve(raiz, process.env.BACKUP_PASTA || 'backups');
const manter = Number(process.env.BACKUP_MANTER || 30);
const pastaExtra = process.env.BACKUP_PASTA_EXTRA?.trim();

function temPgDumpLocal(): boolean {
  return spawnSync('pg_dump', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0;
}

function comandoDump(): { cmd: string; args: string[]; cwd?: string } {
  const opcoes = ['--clean', '--if-exists', '--no-owner'];
  if (temPgDumpLocal()) return { cmd: 'pg_dump', args: [...opcoes, config.databaseUrl] };
  const banco = new URL(config.databaseUrl).pathname.slice(1) || 'nexo';
  return { cmd: 'docker', args: ['compose', 'exec', '-T', 'postgres', 'pg_dump', '-U', 'postgres', ...opcoes, '-d', banco], cwd: raiz };
}

const agora = new Date();
const p = (n: number) => String(n).padStart(2, '0');
const nome = `nexo-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}.sql.gz`;
mkdirSync(pasta, { recursive: true });
const destino = join(pasta, nome);

const { cmd, args, cwd } = comandoDump();
const processo = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
let erros = '';
processo.stderr.on('data', (d) => (erros += d));
const terminou = new Promise<number>((ok) => processo.on('close', (c) => ok(c ?? 1)));
processo.on('error', (e) => {
  console.error(`Não foi possível rodar o ${cmd}: ${e.message}. O Docker Desktop está aberto?`);
  process.exit(1);
});

await pipeline(processo.stdout, createGzip(), createWriteStream(destino));
const codigo = await terminou;
if (codigo !== 0) {
  rmSync(destino, { force: true });
  console.error(`O backup falhou. ${erros.trim() || 'Confira se o banco está ligado.'}`);
  process.exit(1);
}

if (pastaExtra) {
  if (existsSync(pastaExtra)) copyFileSync(destino, join(pastaExtra, nome));
  else console.error(`Aviso: a pasta extra ${pastaExtra} não existe. A cópia extra não foi feita.`);
}

const antigos = readdirSync(pasta).filter((f) => /^nexo-.*\.sql\.gz$/.test(f)).sort().reverse().slice(manter);
for (const f of antigos) rmSync(join(pasta, f));

console.log(`Backup salvo em ${destino}${pastaExtra ? ` e copiado para ${pastaExtra}` : ''}.`);
