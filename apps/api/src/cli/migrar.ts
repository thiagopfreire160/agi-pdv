import { criarBanco } from '../db/conexao.js';
import { migrarBanco } from '../db/migrar.js';
import { config } from '../config.js';

const db = criarBanco();
try {
  const aplicadas = await migrarBanco(db);
  const alvo = config.databaseUrl.replace(/:[^:@/]+@/, ':***@');
  console.log(aplicadas.length ? `Migrações aplicadas em ${alvo}: ${aplicadas.join(', ')}` : `Banco ${alvo} já está atualizado.`);
} catch (e) {
  console.error('Falha ao migrar o banco:', e);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
