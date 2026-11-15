/**
 * Gera senha temporária para um usuário (uso no servidor quando o administrador esquece a senha).
 * Uso: npm run admin:senha -- admin@loja.com.br
 */
import { sql } from 'kysely';
import { criarBanco } from '../db/conexao.js';
import { gerarHash, gerarSenhaTemporaria } from '../lib/senhas.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Informe o e-mail do usuário. Exemplo: npm run admin:senha -- admin@loja.com.br');
  process.exit(1);
}

const db = criarBanco();
try {
  const u = await db.selectFrom('usuarios').select(['id', 'nome', 'perfil', 'ativo']).where(sql`lower(email)`, '=', email).executeTakeFirst();
  if (!u) {
    console.error(`Nenhum usuário encontrado com o e-mail ${email}.`);
    process.exitCode = 1;
  } else {
    const senha = gerarSenhaTemporaria();
    await db
      .updateTable('usuarios')
      .set({ senha_hash: await gerarHash(senha), deve_trocar_senha: true, ativo: true, versao: sql`versao + 1`, atualizado_em: sql`now()` })
      .where('id', '=', u.id)
      .execute();
    await db.updateTable('sessoes_login').set({ encerrada_em: sql`now()`, motivo_encerramento: 'revogada' }).where('usuario_id', '=', u.id).where('encerrada_em', 'is', null).execute();
    await db.deleteFrom('tentativas_login').where('chave', 'like', `${email}|%`).execute();
    await db
      .insertInto('auditoria')
      .values({ usuario_id: null, entidade: 'usuario', entidade_id: u.id, acao: 'redefinir_senha', depois: JSON.stringify({ origem: 'linha_de_comando' }) })
      .execute();
    console.log(`Senha temporária de ${u.nome} (${u.perfil}): ${senha}`);
    console.log('No próximo login o sistema pedirá uma nova senha.');
  }
} finally {
  await db.destroy();
}
