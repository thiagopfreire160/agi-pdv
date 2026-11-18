import type { Migration } from 'kysely/migration';
import * as m0001 from './0001_esquema_inicial.js';
import * as m0002 from './0002_tema_escuro_padrao.js';

/** Lista versionada de migrações (ordem pela chave). */
export const migracoes: Record<string, Migration> = {
  '0001_esquema_inicial': m0001,
  '0002_tema_escuro_padrao': m0002,
};
