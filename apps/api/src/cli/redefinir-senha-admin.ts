/**
 * Gera senha temporária para um usuário (uso no servidor quando o administrador esquece a senha).
 * Uso: npm run admin:senha -- admin@loja.com.br
 */
import { sql } from 'kysely';
import { criarBanco } from '../db/conexao.js';
import { config } from '../config.js';
import { gerarHash, gerarSenhaTemporaria } from '../lib/senhas.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Informe o e-mail do usuário. Exemplo: npm run admin:senha -- admin@loja.com.br');
  process.exit(1);
}

const destino = new URL(config.databaseUrl);
console.log(`Conectando ao banco ${destino.hostname}:${destino.port || 5432}${destino.pathname}...`);
// Se a conexão nunca responder, o Node pode encerrar sem aviso. Este alarme evita isso.
const alarme = setTimeout(() => {
  console.error('O banco não respondeu em 15 segundos. Confira se o Docker Desktop está aberto e rode npm run db:up.');
  process.exit(1);
}, 15000);
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
} catch (e) {
  const erro = e as { code?: string; message?: string };
  if (erro.code === 'ECONNREFUSED') console.error('Não consegui conectar ao banco. Abra o Docker Desktop e rode npm run db:up.');
  else if (erro.code === '28P01') console.error('A senha do banco não confere. A senha em apps/api/.env precisa ser igual à de AGI_SENHA_BANCO no .env da raiz.');
  else if (erro.code === '42P01') console.error('As tabelas ainda não existem. Rode npm run db:migrar.');
  else console.error(`Erro: ${erro.message ?? e}`);
  process.exitCode = 1;
} finally {
  clearTimeout(alarme);
  await db.destroy();
}
