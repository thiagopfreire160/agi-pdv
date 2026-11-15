import type { FastifyReply, FastifyRequest } from 'fastify';
import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar } from '../../lib/auditoria.js';
import { ErroApp, erroValidacao } from '../../lib/erros.js';
import { conferirSenha, gastarTempoDeVerificacao, gerarHash, validarPoliticaSenha } from '../../lib/senhas.js';
import { criarSessao, encerrarSessoesDoUsuario, limparCookie } from '../../lib/sessao.js';
import { limitarPorIp, limparFalhas, normalizarIdentificador, registrarFalha, verificarBloqueio } from '../../lib/bloqueio.js';
import { obterConfiguracoes } from '../configuracoes/servico.js';
import { formatarUsuario } from '../usuarios/formato.js';
import type { UsuarioLogado } from '../../lib/contexto.js';

export const MSG_CREDENCIAIS = 'E-mail/CPF ou senha incorretos. Confira e tente de novo.';

export async function buscarPorIdentificador(db: Tx, identificador: string) {
  const id = normalizarIdentificador(identificador);
  let q = db.selectFrom('usuarios').selectAll();
  q = id.includes('@') ? q.where(sql`lower(email)`, '=', id) : q.where('cpf', '=', id);
  return q.executeTakeFirst();
}

/**
 * Confere credenciais aplicando bloqueio por tentativas (identificador + IP).
 * Usado no login e na janela de autorização de supervisor.
 */
export async function conferirCredenciais(identificador: string, senha: string, ip: string, contexto: 'login' | 'autorizacao') {
  const db = banco();
  const cfg = await obterConfiguracoes(db);
  await verificarBloqueio(db, identificador, ip);
  const u = await buscarPorIdentificador(db, identificador);
  let ok = false;
  if (u) ok = await conferirSenha(u.senha_hash, senha);
  else await gastarTempoDeVerificacao(senha);
  if (!u || !ok || !u.ativo) {
    const bloqueou = await registrarFalha(db, identificador, ip, cfg.tentativas_login, cfg.tempo_bloqueio_minutos);
    await auditar(db, { usuarioId: u?.id ?? null, ip }, {
      entidade: 'usuario',
      entidadeId: u?.id ?? null,
      acao: contexto === 'login' ? 'login_falhou' : 'autorizacao_negada',
      depois: { identificador: normalizarIdentificador(identificador) },
      soDiferencas: false,
    });
    if (bloqueou) {
      await auditar(db, { usuarioId: u?.id ?? null, ip }, {
        entidade: 'usuario',
        entidadeId: u?.id ?? null,
        acao: 'bloqueio',
        depois: { identificador: normalizarIdentificador(identificador), minutos: cfg.tempo_bloqueio_minutos },
        soDiferencas: false,
      });
    }
    throw new ErroApp(401, contexto === 'login' ? MSG_CREDENCIAIS : 'E-mail/CPF ou senha de quem autoriza estão incorretos. Confira e tente de novo.', {
      codigo: 'CREDENCIAIS_INVALIDAS',
    });
  }
  await limparFalhas(db, identificador, ip);
  return u;
}

export async function entrar(req: FastifyRequest, reply: FastifyReply, identificador: string, senha: string) {
  limitarPorIp(req.ip);
  const u = await conferirCredenciais(identificador, senha, req.ip, 'login');
  const cfg = await obterConfiguracoes();
  await criarSessao(req, reply, u.id, cfg.duracao_sessao_horas);
  const db = banco();
  await db.updateTable('usuarios').set({ ultimo_acesso: sql`now()` }).where('id', '=', u.id).execute();
  await auditar(db, { usuarioId: u.id, ip: req.ip }, { entidade: 'usuario', entidadeId: u.id, acao: 'login' });
  return {
    usuario: formatarUsuario(u),
    deve_trocar_senha: u.deve_trocar_senha,
    tela_inicial: u.deve_trocar_senha ? 'trocar_senha' : u.perfil === 'caixa' ? 'caixa' : 'dashboard',
  };
}

export async function sair(req: FastifyRequest, reply: FastifyReply) {
  if (req.sessaoLoginId) {
    await banco()
      .updateTable('sessoes_login')
      .set({ encerrada_em: sql`now()`, motivo_encerramento: 'logout' })
      .where('id', '=', req.sessaoLoginId)
      .execute();
    await auditar(banco(), { usuarioId: req.usuario!.id, ip: req.ip }, { entidade: 'usuario', entidadeId: req.usuario!.id, acao: 'logout' });
  }
  limparCookie(reply);
}

export async function trocarPropriaSenha(
  req: FastifyRequest,
  usuario: UsuarioLogado,
  dados: { senha_atual?: string | null; nova_senha: string; confirmacao_senha: string },
) {
  const db = banco();
  const u = await db.selectFrom('usuarios').selectAll().where('id', '=', usuario.id).executeTakeFirstOrThrow();
  // Na troca obrigatória (após senha temporária) a senha atual não é pedida.
  if (!u.deve_trocar_senha) {
    if (!dados.senha_atual || !(await conferirSenha(u.senha_hash, dados.senha_atual))) {
      throw erroValidacao('A senha atual está incorreta.', { senha_atual: 'Senha atual incorreta.' });
    }
  }
  validarPoliticaSenha(dados.nova_senha);
  if (dados.nova_senha !== dados.confirmacao_senha) {
    throw erroValidacao('A confirmação não confere com a nova senha.', { confirmacao_senha: 'Digite a mesma senha nos dois campos.' });
  }
  if (await conferirSenha(u.senha_hash, dados.nova_senha)) {
    throw erroValidacao('A nova senha deve ser diferente da atual.', { nova_senha: 'Escolha uma senha diferente da atual.' });
  }
  await db
    .updateTable('usuarios')
    .set({
      senha_hash: await gerarHash(dados.nova_senha),
      deve_trocar_senha: false,
      versao: sql`versao + 1`,
      atualizado_em: sql`now()`,
      atualizado_por: u.id,
    })
    .where('id', '=', u.id)
    .execute();
  const encerradas = await encerrarSessoesDoUsuario(u.id, 'senha_alterada', req.sessaoLoginId);
  await auditar(db, { usuarioId: u.id, ip: req.ip }, {
    entidade: 'usuario',
    entidadeId: u.id,
    acao: 'trocar_senha',
    depois: { outras_sessoes_encerradas: encerradas },
    soDiferencas: false,
  });
  return { ok: true, outras_sessoes_encerradas: encerradas };
}

export async function atualizarPerfilProprio(
  req: FastifyRequest,
  usuario: UsuarioLogado,
  dados: { nome?: string; telefone?: string | null; tema?: string },
) {
  const db = banco();
  const antes = await db.selectFrom('usuarios').selectAll().where('id', '=', usuario.id).executeTakeFirstOrThrow();
  const depois = await db
    .updateTable('usuarios')
    .set({ ...dados, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: usuario.id })
    .where('id', '=', usuario.id)
    .returningAll()
    .executeTakeFirstOrThrow();
  await auditar(db, { usuarioId: usuario.id, ip: req.ip }, { entidade: 'usuario', entidadeId: usuario.id, acao: 'editar', antes, depois });
  return formatarUsuario(depois);
}
