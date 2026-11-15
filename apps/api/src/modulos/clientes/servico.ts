import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { conflito, erroConflitoVersao, erroValidacao, naoEncontrado } from '../../lib/erros.js';
import { conferirCidadeUf } from '../../lib/esquemas.js';
import { somenteDigitos, tipoPessoa } from '../../lib/documentos.js';
import { fusoDaLoja, hojeNoFuso } from '../../lib/datas.js';

const saldoVales = sql<number>`coalesce((SELECT sum(v.saldo) FROM vales_troca v
  WHERE v.cliente_id = c.id AND v.situacao = 'ativo' AND v.validade >= (now() AT TIME ZONE coalesce((SELECT fuso_horario FROM empresa), 'America/Sao_Paulo'))::date), 0)`;

export function formatarCliente(c: Record<string, any>) {
  const { excluido_em: _e, excluido_por: _p, ...resto } = c;
  return { ...resto, tipo_pessoa: tipoPessoa(c.documento), saldo_credito: Number(c.saldo_credito ?? 0) };
}

export async function listarClientes(f: { busca?: string; situacao: string; pagina: number; por_pagina: number }) {
  let q = banco().selectFrom('clientes as c').where('c.excluido_em', 'is', null);
  if (f.busca?.trim()) {
    const t = f.busca.trim();
    const dig = somenteDigitos(t);
    q = q.where((eb) => {
      const conds = [eb(sql`f_normalizar(c.nome)`, 'like', sql`'%' || f_normalizar(${t}) || '%'`)];
      if (dig.length >= 3) {
        conds.push(eb('c.documento', 'like', `%${dig}%`), eb('c.celular', 'like', `%${dig}%`), eb('c.telefone', 'like', `%${dig}%`));
      }
      return eb.or(conds);
    });
  }
  if (f.situacao === 'ativos') q = q.where('c.ativo', '=', true);
  if (f.situacao === 'inativos') q = q.where('c.ativo', '=', false);
  const total = await q.select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
  const itens = await q
    .selectAll('c')
    .select(saldoVales.as('saldo_credito'))
    .orderBy('c.nome')
    .limit(f.por_pagina)
    .offset((f.pagina - 1) * f.por_pagina)
    .execute();
  return { itens: itens.map(formatarCliente), total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
}

export async function obterCliente(id: string) {
  const db = banco();
  const c = await db.selectFrom('clientes as c').selectAll('c').select(saldoVales.as('saldo_credito')).where('c.id', '=', id).where('c.excluido_em', 'is', null).executeTakeFirst();
  if (!c) throw naoEncontrado('Cliente não encontrado.');
  const compras = await db
    .selectFrom('vendas')
    .select(['id', 'numero', 'finalizada_em', 'total', 'situacao'])
    .where('cliente_id', '=', id)
    .orderBy('finalizada_em', 'desc')
    .limit(10)
    .execute();
  const fuso = await fusoDaLoja(db);
  const vales = await db
    .selectFrom('vales_troca')
    .select(['id', 'codigo', 'valor_original', 'saldo', 'validade', 'situacao'])
    .where('cliente_id', '=', id)
    .where('situacao', '=', 'ativo')
    .where('validade', '>=', hojeNoFuso(fuso))
    .orderBy('validade')
    .execute();
  return { ...formatarCliente(c), ultimas_compras: compras, vales_ativos: vales };
}

async function conferirDocumento(tx: Tx, documento: string | null | undefined, ignorarId?: string) {
  if (!documento) return;
  let q = tx.selectFrom('clientes').select(['id', 'nome']).where('documento', '=', documento).where('excluido_em', 'is', null);
  if (ignorarId) q = q.where('id', '!=', ignorarId);
  const r = await q.executeTakeFirst();
  if (r) {
    throw conflito(`Este documento já está cadastrado para o cliente "${r.nome}".`, {
      campos: { documento: `Já cadastrado para ${r.nome}.` },
      cliente_existente: { id: r.id, nome: r.nome },
    });
  }
}

function conferirNascimento(data?: string | null) {
  if (data && data > new Date().toISOString().slice(0, 10)) {
    throw erroValidacao('A data de nascimento não pode ser futura.', { data_nascimento: 'Data futura.' });
  }
}

export async function criarCliente(ator: Ator, d: Record<string, any>) {
  conferirNascimento(d.data_nascimento);
  conferirCidadeUf(d);
  return banco()
    .transaction()
    .execute(async (tx) => {
      await conferirDocumento(tx, d.documento);
      const c = await tx
        .insertInto('clientes')
        .values({ ...d, criado_por: ator.usuarioId, atualizado_por: ator.usuarioId })
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'cliente', entidadeId: c.id, acao: 'criar', depois: c });
      return c.id as string;
    });
}

export async function editarCliente(ator: Ator, id: string, d: Record<string, any>) {
  conferirNascimento(d.data_nascimento);
  return banco()
    .transaction()
    .execute(async (tx) => {
      const antes = await tx.selectFrom('clientes').selectAll().where('id', '=', id).where('excluido_em', 'is', null).forUpdate().executeTakeFirst();
      if (!antes) throw naoEncontrado('Cliente não encontrado.');
      if (antes.versao !== d.versao) throw erroConflitoVersao();
      conferirCidadeUf({ cidade: d.cidade !== undefined ? d.cidade : antes.cidade, uf: d.uf !== undefined ? d.uf : antes.uf });
      await conferirDocumento(tx, d.documento, id);
      const { versao: _v, ...campos } = d;
      const depois = await tx
        .updateTable('clientes')
        .set({ ...campos, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'cliente', entidadeId: id, acao: 'editar', antes, depois });
    });
}

export async function alterarSituacaoCliente(ator: Ator, id: string, ativo: boolean) {
  const antes = await banco().selectFrom('clientes').selectAll().where('id', '=', id).where('excluido_em', 'is', null).executeTakeFirst();
  if (!antes) throw naoEncontrado('Cliente não encontrado.');
  const depois = await banco()
    .updateTable('clientes')
    .set({ ativo, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
  await auditar(banco(), ator, { entidade: 'cliente', entidadeId: id, acao: ativo ? 'reativar' : 'inativar', antes, depois });
}

export async function excluirCliente(ator: Ator, id: string) {
  const c = await banco().selectFrom('clientes').selectAll().where('id', '=', id).where('excluido_em', 'is', null).executeTakeFirst();
  if (!c) throw naoEncontrado('Cliente não encontrado.');
  const venda = await banco().selectFrom('vendas').select('id').where('cliente_id', '=', id).executeTakeFirst();
  const vale = await banco().selectFrom('vales_troca').select('id').where('cliente_id', '=', id).executeTakeFirst();
  if (venda || vale) throw conflito('Este cliente tem compras ou vales registrados e não pode ser excluído. Inative-o em vez disso.');
  await banco().updateTable('clientes').set({ excluido_em: sql`now()`, excluido_por: ator.usuarioId, ativo: false }).where('id', '=', id).execute();
  await auditar(banco(), ator, { entidade: 'cliente', entidadeId: id, acao: 'excluir', antes: c, soDiferencas: false });
}
