import { sql, type Kysely } from 'kysely';

// agi pdv: o tema escuro passa a ser o padrão de todo usuário novo.
// Quem ainda estava no padrão antigo ("sistema") passa para o escuro.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE usuarios ALTER COLUMN tema SET DEFAULT 'escuro';
    UPDATE usuarios SET tema = 'escuro' WHERE tema = 'sistema';
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE usuarios ALTER COLUMN tema SET DEFAULT 'sistema';`.execute(db);
}
