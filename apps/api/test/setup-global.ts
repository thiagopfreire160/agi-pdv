import { criarBanco } from '../src/db/conexao.js';
import { migrarBanco } from '../src/db/migrar.js';

export default async function () {
  const db = criarBanco(process.env.DATABASE_URL ?? 'postgres://postgres:nexo@localhost:5432/nexo_test');
  await migrarBanco(db);
  await db.destroy();
}
