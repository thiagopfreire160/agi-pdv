import pg from 'pg';
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import { config } from '../config.js';

// bigint (somas em centavos) e numeric (quantidades) chegam como texto do pg;
// convertemos para número para simplificar o restante do código.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// Datas puras (date) ficam como texto ISO 'aaaa-mm-dd', sem conversão de fuso.
pg.types.setTypeParser(1082, (v) => v);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Banco = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = Transaction<any> | Kysely<any>;

let instancia: Banco | null = null;

export function criarBanco(url = config.databaseUrl): Banco {
  return new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: url, max: 15 }),
    }),
  });
}

export function banco(): Banco {
  if (!instancia) instancia = criarBanco();
  return instancia;
}

export async function fecharBanco(): Promise<void> {
  if (instancia) {
    await instancia.destroy();
    instancia = null;
  }
}

/** Executa SQL bruto e devolve as linhas. */
export async function consultar<T = Record<string, unknown>>(
  db: Tx,
  consulta: ReturnType<typeof sql>,
): Promise<T[]> {
  const r = await consulta.execute(db);
  return r.rows as T[];
}

export { sql };
