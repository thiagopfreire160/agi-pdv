// Cópia de segurança do banco: npm run backup
// Gera backups/nexo-AAAA-MM-DD-HHMM.nexo.gz na raiz do projeto e apaga os mais antigos.
// Funciona com o banco portátil (npm run db:local), com Docker ou com PostgreSQL instalado.
import { createWriteStream, mkdirSync, readdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { gerarBackup } from '../db/copia.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const pasta = resolve(raiz, process.env.BACKUP_PASTA || 'backups');
const manter = Number(process.env.BACKUP_MANTER || 30);
const pastaExtra = process.env.BACKUP_PASTA_EXTRA?.trim();

const agora = new Date();
const p = (n: number) => String(n).padStart(2, '0');
const nome = `nexo-${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}.nexo.gz`;
mkdirSync(pasta, { recursive: true });
const destino = join(pasta, nome);

try {
  const gz = createGzip();
  const arquivo = createWriteStream(destino);
  gz.pipe(arquivo);
  const r = await gerarBackup(config.databaseUrl, gz);
  await new Promise<void>((ok, erro) => { arquivo.on('finish', ok); arquivo.on('error', erro); gz.end(); });

  if (pastaExtra) {
    if (existsSync(pastaExtra)) copyFileSync(destino, join(pastaExtra, nome));
    else console.error(`Aviso: a pasta extra ${pastaExtra} não existe. A cópia extra não foi feita.`);
  }
  const antigos = readdirSync(pasta).filter((f) => /^nexo-.*\.(nexo|sql)\.gz$/.test(f)).sort().reverse().slice(manter);
  for (const f of antigos) rmSync(join(pasta, f));

  console.log(`Backup salvo em ${destino} (${r.tabelas} tabelas)${pastaExtra ? ` e copiado para ${pastaExtra}` : ''}.`);
} catch (e) {
  rmSync(destino, { force: true });
  const erro = e as { code?: string; message?: string };
  if (erro.code === 'ECONNREFUSED') console.error('O backup falhou: o banco está desligado. Ligue-o com npm run db:local (ou npm run db:up, se usar Docker).');
  else console.error(`O backup falhou: ${erro.message ?? e}`);
  process.exit(1);
}
