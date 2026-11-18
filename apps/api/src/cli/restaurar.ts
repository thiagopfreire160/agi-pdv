// Restaura um backup: npm run restaurar -- backups/agipdv-AAAA-MM-DD-HHMM.agipdv.gz
// ATENÇÃO: substitui todos os dados atuais do banco pelos do arquivo.
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { config } from '../config.js';
import { restaurarBackup } from '../db/copia.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const informado = process.argv.slice(2).find((a) => !a.startsWith('--'));
const arquivo = informado ? resolve(raiz, informado) : '';
if (!arquivo || !existsSync(arquivo)) {
  console.error('Informe o arquivo de backup. Exemplo: npm run restaurar -- backups/agipdv-2026-11-15-2200.agipdv.gz');
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

try {
  const r = await restaurarBackup(config.databaseUrl, gunzipSync(readFileSync(arquivo)));
  console.log(`Backup restaurado (${r.tabelas} tabelas). Reinicie o agi pdv.`);
} catch (e) {
  console.error(`A restauração falhou: ${(e as Error).message ?? e}`);
  process.exit(1);
}
