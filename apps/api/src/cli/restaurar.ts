// Restaura um backup: npm run restaurar -- backups/nexo-AAAA-MM-DD-HHMM.sql.gz
// ATENÇÃO: substitui todos os dados atuais do banco pelos do arquivo.
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { config } from '../config.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const arquivo = process.argv[2] ? resolve(raiz, process.argv[2]) : '';
if (!arquivo || !existsSync(arquivo)) {
  console.error('Informe o arquivo de backup. Exemplo: npm run restaurar -- backups/nexo-2026-11-15-2200.sql.gz');
  process.exit(1);
}

if (!process.argv.includes('--sim')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const resp = await rl.question(`Isso troca TODOS os dados atuais pelos do backup ${arquivo}. Digite RESTAURAR para continuar: `);
  rl.close();
  if (resp.trim() !== 'RESTAURAR') {
    console.log('Nada foi alterado.');
    process.exit(0);
  }
}

const temPsql = spawnSync('psql', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0;
const banco = new URL(config.databaseUrl).pathname.slice(1) || 'nexo';
const { cmd, args, cwd } = temPsql
  ? { cmd: 'psql', args: ['-q', '-v', 'ON_ERROR_STOP=1', config.databaseUrl], cwd: undefined }
  : { cmd: 'docker', args: ['compose', 'exec', '-T', 'postgres', 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', banco], cwd: raiz };

const processo = spawn(cmd, args, { cwd, stdio: ['pipe', 'ignore', 'inherit'] });
const terminou = new Promise<number>((ok) => processo.on('close', (c) => ok(c ?? 1)));
await pipeline(createReadStream(arquivo), createGunzip(), processo.stdin);
if ((await terminou) !== 0) {
  console.error('A restauração falhou. Os detalhes estão acima.');
  process.exit(1);
}
console.log('Backup restaurado. Reinicie o NEXO.');
