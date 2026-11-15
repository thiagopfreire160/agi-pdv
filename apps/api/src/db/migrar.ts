import { Migrator, type MigrationProvider } from 'kysely/migration';
import type { Banco } from './conexao.js';
import { migracoes } from './migracoes/index.js';

const provedor: MigrationProvider = { getMigrations: async () => migracoes };

export async function migrarBanco(db: Banco): Promise<string[]> {
  const migrator = new Migrator({ db, provider: provedor, migrationTableName: 'migracoes', migrationLockTableName: 'migracoes_trava' });
  const { error, results } = await migrator.migrateToLatest();
  if (error) throw error;
  return (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
}
