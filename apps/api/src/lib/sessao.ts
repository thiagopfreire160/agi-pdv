import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { banco, sql } from '../db/conexao.js';
import { config } from '../config.js';
import { ErroApp } from './erros.js';
import type { UsuarioLogado } from './contexto.js';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function criarSessao(req: FastifyRequest, reply: FastifyReply, usuarioId: string, duracaoHoras: number) {
  const token = randomBytes(32).toString('base64url'); // 256 bits
  const db = banco();
  const r = await db
    .insertInto('sessoes_login')
    .values({
      usuario_id: usuarioId,
      token_hash: hashToken(token),
      expira_em: sql`now() + make_interval(hours => ${duracaoHoras})`,
      ip: req.ip,
      navegador: (req.headers['user-agent'] ?? '').slice(0, 300),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  reply.setCookie(config.nomeCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSeguro,
    path: '/',
    maxAge: duracaoHoras * 3600,
  });
  return r.id as string;
}

export function limparCookie(reply: FastifyReply) {
  reply.clearCookie(config.nomeCookie, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSeguro });
}

export async function encerrarSessoesDoUsuario(usuarioId: string, motivo: string, excetoSessaoId?: string) {
  let q = banco()
    .updateTable('sessoes_login')
    .set({ encerrada_em: sql`now()`, motivo_encerramento: motivo })
    .where('usuario_id', '=', usuarioId)
    .where('encerrada_em', 'is', null);
  if (excetoSessaoId) q = q.where('id', '!=', excetoSessaoId);
  const r = await q.executeTakeFirst();
  return Number(r.numUpdatedRows);
}

/** Carrega a sessão a partir do cookie; lança 401 se ausente/expirada. */
export async function carregarSessao(req: FastifyRequest): Promise<void> {
  const token = req.cookies?.[config.nomeCookie];
  if (!token) throw new ErroApp(401, 'Entre no sistema para continuar.', { codigo: 'NAO_AUTENTICADO' });
  const db = banco();
  const linha = await sql<{
    sessao_id: string;
    expira_em: Date;
    ultimo_uso: Date;
    encerrada_em: Date | null;
    inatividade_minutos: number;
  } & UsuarioLogado & { ativo: boolean }>`
    SELECT s.id AS sessao_id, s.expira_em, s.ultimo_uso, s.encerrada_em,
           coalesce(c.inatividade_minutos, 0) AS inatividade_minutos,
           u.id, u.nome, u.email, u.cpf, u.telefone, u.perfil, u.deve_trocar_senha, u.tema, u.ativo
      FROM sessoes_login s
      JOIN usuarios u ON u.id = s.usuario_id
      LEFT JOIN configuracoes c ON true
     WHERE s.token_hash = ${hashToken(token)}
  `.execute(db);
  const s = linha.rows[0];
  const expirada = (motivo: string) =>
    new ErroApp(401, motivo, { codigo: 'SESSAO_EXPIRADA' });
  if (!s || s.encerrada_em) throw expirada('Sua sessão foi encerrada. Entre de novo para continuar.');
  if (!s.ativo) throw expirada('Sua sessão foi encerrada. Entre de novo para continuar.');
  const agora = Date.now();
  let motivo: string | null = null;
  if (s.expira_em.getTime() <= agora) motivo = 'expirou';
  else if (s.inatividade_minutos > 0 && agora - s.ultimo_uso.getTime() > s.inatividade_minutos * 60000) motivo = 'expirou';
  if (motivo) {
    await db
      .updateTable('sessoes_login')
      .set({ encerrada_em: sql`now()`, motivo_encerramento: motivo })
      .where('id', '=', s.sessao_id)
      .execute();
    throw expirada('Sua sessão expirou. Entre de novo para continuar de onde parou.');
  }
  await db.updateTable('sessoes_login').set({ ultimo_uso: sql`now()` }).where('id', '=', s.sessao_id).execute();
  req.sessaoLoginId = s.sessao_id;
  req.usuario = {
    id: s.id,
    nome: s.nome,
    email: s.email,
    cpf: s.cpf,
    telefone: s.telefone,
    perfil: s.perfil,
    deve_trocar_senha: s.deve_trocar_senha,
    tema: s.tema,
  };
}
