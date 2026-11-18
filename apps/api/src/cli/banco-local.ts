// Banco de dados portátil: npm run db:local
// Roda um PostgreSQL 16 dentro da pasta do projeto (pasta .banco), sem Docker e sem instalar nada.
// Deixe a janela aberta enquanto o agi pdv estiver em uso. Para desligar, feche a janela ou tecle Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const pasta = resolve(raiz, '.banco');
const url = new URL(config.databaseUrl);
const usuario = decodeURIComponent(url.username || 'postgres');
const senha = decodeURIComponent(url.password || 'agipdv');
const porta = Number(url.port || 5432);

const banco = new EmbeddedPostgres({
  databaseDir: pasta,
  user: usuario,
  password: senha,
  port: porta,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});

async function desligar() {
  console.log('Desligando o banco...');
  await banco.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);

try {
  if (!existsSync(resolve(pasta, 'PG_VERSION'))) {
    console.log('Primeira vez: criando o banco na pasta .banco (leva alguns segundos)...');
    await banco.initialise();
  }
  await banco.start();

  const cliente = new pg.Client({ host: 'localhost', port: porta, user: usuario, password: senha, database: 'postgres' });
  await cliente.connect();
  for (const nome of ['agipdv', 'agipdv_test']) {
    const existe = await cliente.query('select 1 from pg_database where datname = $1', [nome]);
    if (!existe.rowCount) await cliente.query(`create database ${nome}`);
  }
  await cliente.end();

  console.log(`Banco ligado em localhost:${porta}. Deixe esta janela aberta enquanto usar o agi pdv.`);
} catch (e) {
  const msg = String((e as Error).message ?? e);
  if (/EADDRINUSE|already in use|5432/.test(msg)) {
    console.error(`A porta ${porta} já está em uso. Talvez o banco já esteja ligado em outra janela.`);
  } else {
    console.error(`Não foi possível ligar o banco: ${msg}`);
  }
  await banco.stop().catch(() => {});
  process.exit(1);
}

// Mantém o processo vivo até a janela ser fechada.
setInterval(() => {}, 1 << 30);
