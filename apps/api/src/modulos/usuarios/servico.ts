import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { conflito, erroConflitoVersao, erroValidacao, naoEncontrado, semPermissao } from '../../lib/erros.js';
import { gerarHash, gerarSenhaTemporaria, validarPoliticaSenha } from '../../lib/senhas.js';
import { encerrarSessoesDoUsuario } from '../../lib/sessao.js';
import type { UsuarioLogado } from '../../lib/contexto.js';
import { formatarUsuario } from './formato.js';

export async function listarUsuarios(f: { busca?: string; perfil?: string; situacao: string; pagina: number; por_pagina: number }) {
  let q = banco().selectFrom('usuarios');
  if (f.busca) {
    const termo = `%${f.busca.trim()}%`;
    q = q.where((eb) => eb.or([eb(sql`f_normalizar(nome)`, 'like', sql`f_normalizar(${termo})`), eb('email', 'ilike', termo)]));
  }
  if (f.perfil) q = q.where('perfil', '=', f.perfil);
  if (f.situacao === 'ativos') q = q.where('ativo', '=', true);
  if (f.situacao === 'inativos') q = q.where('ativo', '=', false);
  const total = await q.select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
  const linhas = await q
    .selectAll()
    .orderBy('nome')
    .limit(f.por_pagina)
    .offset((f.pagina - 1) * f.por_pagina)
    .execute();
  return { itens: linhas.map(formatarUsuario), total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
}

export async function obterUsuario(id: string) {
  const u = await banco().selectFrom('usuarios').selectAll().where('id', '=', id).executeTakeFirst();
  if (!u) throw naoEncontrado('Usuário não encontrado.');
  return u;
}

/** Gerente só gerencia usuários do perfil Caixa. */
function conferirAlcance(ator: UsuarioLogado, alvoPerfil: string, novoPerfil?: string) {
  if (ator.perfil === 'administrador') return;
  if (ator.perfil === 'gerente' && alvoPerfil === 'caixa' && (!novoPerfil || novoPerfil === 'caixa')) return;
  throw semPermissao('Gerente só pode alterar usuários do perfil Caixa.');
}

async function conferirUnicidade(db: Tx, dados: { email?: string; cpf?: string | null }, ignorarId?: string) {
  if (dados.email) {
    let q = db.selectFrom('usuarios').select('nome').where(sql`lower(email)`, '=', dados.email.toLowerCase());
    if (ignorarId) q = q.where('id', '!=', ignorarId);
    const r = await q.executeTakeFirst();
    if (r) throw conflito(`Este e-mail já está em uso por ${r.nome}.`, { campos: { email: 'E-mail já cadastrado.' } });
  }
  if (dados.cpf) {
    let q = db.selectFrom('usuarios').select('nome').where('cpf', '=', dados.cpf);
    if (ignorarId) q = q.where('id', '!=', ignorarId);
    const r = await q.executeTakeFirst();
    if (r) throw conflito(`Este CPF já está em uso por ${r.nome}.`, { campos: { cpf: 'CPF já cadastrado.' } });
  }
}

async function administradoresAtivos(db: Tx) {
  const r = await db
    .selectFrom('usuarios')
    .select(sql<number>`count(*)`.as('n'))
    .where('perfil', '=', 'administrador')
    .where('ativo', '=', true)
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

export async function criarUsuario(
  quem: UsuarioLogado,
  ator: Ator,
  dados: { nome: string; email: string; cpf?: string | null; telefone?: string | null; perfil: string; senha?: string | null; gerar_senha?: boolean },
) {
  conferirAlcance(quem, dados.perfil, dados.perfil);
  let senha = dados.senha ?? null;
  let gerada = false;
  if (!senha || dados.gerar_senha) {
    senha = gerarSenhaTemporaria();
    gerada = true;
  } else validarPoliticaSenha(senha, 'senha');
  const hash = await gerarHash(senha);
  return banco()
    .transaction()
    .execute(async (tx) => {
      await conferirUnicidade(tx, dados);
      const u = await tx
        .insertInto('usuarios')
        .values({
          nome: dados.nome,
          email: dados.email,
          cpf: dados.cpf ?? null,
          telefone: dados.telefone ?? null,
          perfil: dados.perfil,
          senha_hash: hash,
          deve_trocar_senha: true,
          criado_por: ator.usuarioId,
          atualizado_por: ator.usuarioId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'usuario', entidadeId: u.id, acao: 'criar', depois: formatarUsuario(u) });
      // A senha gerada é exibida uma única vez, nesta resposta.
      return { usuario: formatarUsuario(u), senha_temporaria: gerada ? senha : null };
    });
}

export async function editarUsuario(
  quem: UsuarioLogado,
  ator: Ator,
  id: string,
  dados: { versao: number; nome?: string; email?: string; cpf?: string | null; telefone?: string | null; perfil?: string },
) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const antes = await tx.selectFrom('usuarios').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!antes) throw naoEncontrado('Usuário não encontrado.');
      conferirAlcance(quem, antes.perfil, dados.perfil);
      if (antes.versao !== dados.versao) throw erroConflitoVersao();
      if (dados.perfil && dados.perfil !== antes.perfil) {
        if (id === quem.id) throw erroValidacao('Você não pode alterar o seu próprio perfil.', { perfil: 'Peça a outro administrador.' });
        if (antes.perfil === 'administrador' && antes.ativo && (await administradoresAtivos(tx)) <= 1) {
          throw conflito('Este é o último administrador ativo e não pode ser rebaixado. Promova outro usuário antes.');
        }
      }
      await conferirUnicidade(tx, dados, id);
      const { versao: _v, ...campos } = dados;
      const depois = await tx
        .updateTable('usuarios')
        .set({ ...campos, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'usuario', entidadeId: id, acao: 'editar', antes: formatarUsuario(antes), depois: formatarUsuario(depois) });
      return formatarUsuario(depois);
    });
}

export async function redefinirSenha(quem: UsuarioLogado, ator: Ator, id: string) {
  const alvo = await obterUsuario(id);
  conferirAlcance(quem, alvo.perfil);
  const senha = gerarSenhaTemporaria();
  await banco()
    .updateTable('usuarios')
    .set({ senha_hash: await gerarHash(senha), deve_trocar_senha: true, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
    .where('id', '=', id)
    .execute();
  await encerrarSessoesDoUsuario(id, 'revogada');
  await banco().deleteFrom('tentativas_login').where('chave', 'like', `${alvo.email.toLowerCase()}|%`).execute();
  await auditar(banco(), ator, { entidade: 'usuario', entidadeId: id, acao: 'redefinir_senha' });
  return { senha_temporaria: senha };
}

export async function alterarSituacao(quem: UsuarioLogado, ator: Ator, id: string, ativo: boolean) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const antes = await tx.selectFrom('usuarios').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!antes) throw naoEncontrado('Usuário não encontrado.');
      conferirAlcance(quem, antes.perfil);
      if (!ativo) {
        if (id === quem.id) throw erroValidacao('Você não pode inativar o seu próprio usuário.');
        if (antes.perfil === 'administrador' && antes.ativo && (await administradoresAtivos(tx)) <= 1) {
          throw conflito('Este é o último administrador ativo e não pode ser inativado.');
        }
        const caixa = await tx
          .selectFrom('sessoes_caixa')
          .select(['id', 'numero'])
          .where('operador_id', '=', id)
          .where('situacao', '=', 'aberto')
          .executeTakeFirst();
        if (caixa) {
          throw conflito(`${antes.nome} está com o caixa nº ${caixa.numero} aberto. Feche o caixa dessa pessoa antes de inativar.`, {
            codigo: 'CAIXA_ABERTO',
            sessao_caixa_id: caixa.id,
          });
        }
      }
      const depois = await tx
        .updateTable('usuarios')
        .set({ ativo, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      if (!ativo) {
        await tx
          .updateTable('sessoes_login')
          .set({ encerrada_em: sql`now()`, motivo_encerramento: 'usuario_inativado' })
          .where('usuario_id', '=', id)
          .where('encerrada_em', 'is', null)
          .execute();
      }
      await auditar(tx, ator, { entidade: 'usuario', entidadeId: id, acao: ativo ? 'reativar' : 'inativar', antes, depois });
      return formatarUsuario(depois);
    });
}

export async function encerrarSessoes(quem: UsuarioLogado, ator: Ator, id: string) {
  const alvo = await obterUsuario(id);
  conferirAlcance(quem, alvo.perfil);
  const n = await encerrarSessoesDoUsuario(id, 'revogada');
  await auditar(banco(), ator, { entidade: 'usuario', entidadeId: id, acao: 'encerrar_sessoes', depois: { sessoes: n }, soDiferencas: false });
  return { sessoes_encerradas: n };
}

export async function listarSessoesAtivas() {
  const r = await sql<Record<string, unknown>>`
    SELECT s.id, s.usuario_id, u.nome AS usuario_nome, u.perfil, s.ip, s.navegador, s.criada_em, s.ultimo_uso, s.expira_em
      FROM sessoes_login s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.encerrada_em IS NULL AND s.expira_em > now()
     ORDER BY s.ultimo_uso DESC`.execute(banco());
  return { itens: r.rows };
}

export async function encerrarSessao(ator: Ator, id: string) {
  const r = await banco()
    .updateTable('sessoes_login')
    .set({ encerrada_em: sql`now()`, motivo_encerramento: 'revogada' })
    .where('id', '=', id)
    .where('encerrada_em', 'is', null)
    .returning(['usuario_id'])
    .executeTakeFirst();
  if (!r) throw naoEncontrado('Acesso não encontrado ou já encerrado.');
  await auditar(banco(), ator, { entidade: 'sessao_login', entidadeId: id, acao: 'encerrar', depois: { usuario_id: r.usuario_id }, soDiferencas: false });
  return { ok: true };
}
