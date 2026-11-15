import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar } from '../../lib/auditoria.js';
import { ErroApp, conflito, erroValidacao, naoEncontrado, semPermissao } from '../../lib/erros.js';
import { calcularTroco, calcularVenda, formatarReais, quantidadeValida, NOMES_FORMAS } from '../../lib/dinheiro.js';
import { ehSupervisor, type UsuarioLogado } from '../../lib/contexto.js';
import { fusoDaLoja, hojeNoFuso, inicioDoDia, fimDoDia, somarDias } from '../../lib/datas.js';
import { bloquearProdutos, movimentarEstoque, mil } from '../estoque/movimentar.js';
import { exigirCaixaOperante, caixaAbertoDoOperador } from '../caixa/servico.js';
import { limiteDoPerfil, obterConfiguracoes } from '../configuracoes/servico.js';
import { hashToken } from '../../lib/sessao.js';
import { autorizacaoNecessaria, consumirAutorizacao, type AutorizacaoConsumida } from '../autorizacoes/servico.js';

interface PayloadVenda {
  id: string;
  terminal?: string | null;
  cliente_id?: string | null;
  documento_recibo?: string | null;
  itens: { produto_id: string; quantidade: number | string; preco_unitario: number; desconto: number }[];
  desconto_venda: number;
  pagamentos: { forma: string; valor: number; parcelas?: number; codigo_vale?: string; observacao?: string | null }[];
  autorizacoes: string[];
}

/** Percentual com 2 casas, arredondado para cima (para pedir autorização suficiente). */
const percentualParaCima = (descontoTotal: number, somaBruto: number) => Math.ceil((descontoTotal * 10000) / somaBruto) / 100;

/** desconto_total / soma_bruto ≤ limite%, em aritmética inteira. */
const dentroDoLimite = (descontoTotal: number, somaBruto: number, limite: number) =>
  BigInt(descontoTotal) * 10000n <= BigInt(Math.round(limite * 100)) * BigInt(somaBruto);

export async function finalizarVenda(operador: UsuarioLogado, ip: string, d: PayloadVenda) {
  const existente = await banco().selectFrom('vendas').select(['id', 'operador_id']).where('id', '=', d.id).executeTakeFirst();
  if (existente) return idempotente(existente, operador);
  try {
    const id = await banco().transaction().execute((tx) => gravarVenda(tx, operador, ip, d));
    return { venda: await obterVenda(id, operador, { ignorarEscopo: true }), ja_registrada: false };
  } catch (e) {
    // Reenvio simultâneo da mesma venda: a outra transação gravou primeiro.
    if ((e as { code?: string; constraint?: string }).code === '23505' && (e as { constraint?: string }).constraint === 'vendas_pkey') {
      const v = await banco().selectFrom('vendas').select(['id', 'operador_id']).where('id', '=', d.id).executeTakeFirstOrThrow();
      return idempotente(v, operador);
    }
    throw e;
  }
}

async function idempotente(v: { id: string; operador_id: string }, operador: UsuarioLogado) {
  if (v.operador_id !== operador.id) throw conflito('Esta venda já foi registrada por outro operador. Comece uma nova venda.');
  return { venda: await obterVenda(v.id, operador, { ignorarEscopo: true }), ja_registrada: true };
}

async function gravarVenda(tx: Tx, operador: UsuarioLogado, ip: string, d: PayloadVenda): Promise<string> {
  const sessao = await exigirCaixaOperante(tx, operador.id);
  const cfg = await obterConfiguracoes(tx);
  const fuso = await fusoDaLoja(tx);
  const hoje = hojeNoFuso(fuso);

  // Produtos: bloqueio das linhas (evita dois caixas vendendo a última unidade).
  const produtos = await bloquearProdutos(tx, d.itens.map((i) => i.produto_id));
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const alterados: { produto_id: string; nome: string; preco_informado: number; preco_atual: number }[] = [];
  const quantidades = d.itens.map((it, idx) => {
    const p = porId.get(it.produto_id);
    if (!p || p.excluido_em) throw erroValidacao(`O produto do item ${idx + 1} não existe mais. Remova-o da venda.`, { [`itens.${idx}.produto_id`]: 'Produto inexistente.' });
    if (!p.ativo) throw erroValidacao(`O produto "${p.nome}" foi inativado e não pode ser vendido. Remova-o da venda.`, { [`itens.${idx}.produto_id`]: 'Produto inativo.' });
    if (p.preco_venda !== it.preco_unitario && !alterados.some((a) => a.produto_id === p.id)) {
      alterados.push({ produto_id: p.id, nome: p.nome, preco_informado: it.preco_unitario, preco_atual: p.preco_venda });
    }
    return quantidadeValida(it.quantidade, p.unidade, `itens.${idx}.quantidade`);
  });
  if (alterados.length) {
    throw conflito('O preço de alguns produtos mudou desde que foram incluídos. Confira os novos preços e finalize de novo.', {
      codigo: 'PRECOS_ALTERADOS',
      precos_alterados: alterados,
    });
  }
  if (!cfg.permitir_vender_sem_estoque) {
    const somaPorProduto = new Map<string, number>();
    d.itens.forEach((it, i) => somaPorProduto.set(it.produto_id, (somaPorProduto.get(it.produto_id) ?? 0) + quantidades[i]));
    for (const [pid, q] of somaPorProduto) {
      const p = porId.get(pid)!;
      if (p.controla_estoque && mil(p.estoque_atual) < q) {
        throw conflito(`Estoque insuficiente de "${p.nome}". Disponível: ${Number(p.estoque_atual).toLocaleString('pt-BR')} ${p.unidade}.`, {
          codigo: 'ESTOQUE_INSUFICIENTE',
          produto_id: p.id,
          disponivel: Number(p.estoque_atual),
        });
      }
    }
  }

  const calc = calcularVenda(
    d.itens.map((it, i) => ({ quantidade: quantidades[i], preco_unitario: porId.get(it.produto_id)!.preco_venda, desconto: it.desconto })),
    d.desconto_venda,
  );
  if (calc.total < 1) throw erroValidacao('O total da venda deve ser de pelo menos R$ 0,01.');

  // Autorizações enviadas pelo terminal.
  const autorizacoes: AutorizacaoConsumida[] = [];
  for (const token of d.autorizacoes) {
    const a = await tx.selectFrom('autorizacoes').select(['acao']).where('token_hash', '=', hashToken(token)).executeTakeFirst();
    if (!a) throw new ErroApp(403, 'Autorização inválida. Peça a autorização de novo.', { codigo: 'AUTORIZACAO_INVALIDA' });
    autorizacoes.push(await consumirAutorizacao(tx, token, operador.id, a.acao));
  }

  // Limite de desconto: percentual do desconto total sobre a soma dos valores brutos.
  const limite = limiteDoPerfil(cfg, operador.perfil);
  let autorizacaoDesconto: AutorizacaoConsumida | undefined;
  if (calc.desconto_total > 0 && !dentroDoLimite(calc.desconto_total, calc.soma_bruto, limite)) {
    const necessario = percentualParaCima(calc.desconto_total, calc.soma_bruto);
    autorizacaoDesconto = autorizacoes
      .filter((a) => a.acao === 'desconto' && a.percentual !== null && dentroDoLimite(calc.desconto_total, calc.soma_bruto, a.percentual))
      .find((a) => dentroDoLimite(calc.desconto_total, calc.soma_bruto, limiteDoPerfil(cfg, a.autorizador_perfil)));
    if (!autorizacaoDesconto) {
      throw autorizacaoNecessaria(
        'desconto',
        `Desconto de ${necessario.toLocaleString('pt-BR')}% acima do seu limite de ${limite.toLocaleString('pt-BR')}%. Peça autorização a um gerente ou administrador.`,
        { percentual: necessario, limite },
      );
    }
  }

  if (d.cliente_id) {
    const c = await tx.selectFrom('clientes').select(['ativo']).where('id', '=', d.cliente_id).where('excluido_em', 'is', null).executeTakeFirst();
    if (!c) throw erroValidacao('Cliente não encontrado.', { cliente_id: 'Cliente inexistente.' });
    if (!c.ativo) throw erroValidacao('Este cliente está inativo e não pode ser usado em novas vendas.', { cliente_id: 'Cliente inativo.' });
  }

  // Pagamentos.
  const vales = new Map<string, { id: string; codigo: string; saldo: number; usar: number }>();
  for (const [idx, p] of d.pagamentos.entries()) {
    if (p.forma === 'credito') {
      const parcelas = p.parcelas ?? 1;
      if (parcelas < 1 || parcelas > cfg.max_parcelas_credito) {
        throw erroValidacao(`Parcelas no crédito: de 1 a ${cfg.max_parcelas_credito}.`, { [`pagamentos.${idx}.parcelas`]: `Use de 1 a ${cfg.max_parcelas_credito}.` });
      }
    } else if (p.parcelas !== undefined && p.parcelas !== 1) {
      throw erroValidacao('Parcelas só se aplicam ao crédito.', { [`pagamentos.${idx}.parcelas`]: 'Só no crédito.' });
    }
    if (p.forma === 'vale_troca') {
      if (!p.codigo_vale) throw erroValidacao('Informe o código do vale-troca.', { [`pagamentos.${idx}.codigo_vale`]: 'Obrigatório.' });
      let v = vales.get(p.codigo_vale);
      if (!v) {
        const linha = await tx.selectFrom('vales_troca').selectAll().where('codigo', '=', p.codigo_vale).forUpdate().executeTakeFirst();
        if (!linha) throw erroValidacao(`Vale-troca ${p.codigo_vale} não encontrado. Confira o código.`, { [`pagamentos.${idx}.codigo_vale`]: 'Não encontrado.' });
        if (linha.situacao !== 'ativo') throw erroValidacao(`O vale-troca ${p.codigo_vale} está ${linha.situacao} e não pode ser usado.`, { [`pagamentos.${idx}.codigo_vale`]: `Vale ${linha.situacao}.` });
        if (linha.validade < hoje) throw erroValidacao(`O vale-troca ${p.codigo_vale} expirou e não pode ser usado.`, { [`pagamentos.${idx}.codigo_vale`]: 'Vale expirado.' });
        v = { id: linha.id, codigo: linha.codigo, saldo: linha.saldo, usar: 0 };
        vales.set(p.codigo_vale, v);
      }
      v.usar += p.valor;
      if (v.usar > v.saldo) {
        throw erroValidacao(`O vale-troca ${v.codigo} tem saldo de ${formatarReais(v.saldo)}.`, { [`pagamentos.${idx}.valor`]: 'Acima do saldo do vale.' });
      }
    }
  }
  const troco = calcularTroco(calc.total, d.pagamentos);

  const numero = Number((await sql<{ n: number }>`SELECT nextval('seq_venda') AS n`.execute(tx)).rows[0].n);
  await tx
    .insertInto('vendas')
    .values({
      id: d.id,
      numero,
      sessao_caixa_id: sessao.id,
      operador_id: operador.id,
      cliente_id: d.cliente_id ?? null,
      documento_recibo: d.documento_recibo ?? null,
      terminal: d.terminal ?? sessao.terminal ?? null,
      soma_bruto: calc.soma_bruto,
      subtotal: calc.subtotal,
      desconto_itens: calc.desconto_total - calc.desconto_venda,
      desconto_venda: calc.desconto_venda,
      total: calc.total,
      troco,
      criado_por: operador.id,
      atualizado_por: operador.id,
    })
    .execute();

  await tx
    .insertInto('vendas_itens')
    .values(
      d.itens.map((it, i) => {
        const p = porId.get(it.produto_id)!;
        const c = calc.itens[i];
        return {
          venda_id: d.id,
          ordem: i + 1,
          produto_id: p.id,
          descricao: p.nome,
          codigo_barras: p.codigo_barras,
          unidade: p.unidade,
          quantidade: quantidades[i] / 1000,
          preco_unitario: p.preco_venda,
          custo_unitario: p.preco_custo,
          total_bruto: c.bruto,
          desconto: c.desconto,
          rateio_desconto: c.rateio,
          total_liquido: c.liquido,
        };
      }),
    )
    .execute();

  await tx
    .insertInto('vendas_pagamentos')
    .values(
      d.pagamentos.map((p, i) => ({
        venda_id: d.id,
        ordem: i + 1,
        forma: p.forma,
        valor: p.valor,
        parcelas: p.forma === 'credito' ? (p.parcelas ?? 1) : 1,
        vale_troca_id: p.forma === 'vale_troca' ? vales.get(p.codigo_vale!)!.id : null,
        observacao: p.observacao ?? null,
      })),
    )
    .execute();

  for (const a of autorizacoes) {
    await tx
      .insertInto('vendas_autorizacoes')
      .values({
        venda_id: d.id,
        autorizacao_id: a.id,
        tipo: a.acao === 'desconto' ? 'desconto_acima_limite' : a.acao,
        operador_id: operador.id,
        autorizador_id: a.autorizador_id,
        percentual: a.acao === 'desconto' ? a.percentual : null,
        valor: a.acao === 'desconto' ? calc.desconto_total : ((a.detalhes?.total as number | undefined) ?? null),
        motivo: a.motivo,
        detalhes: a.detalhes ? JSON.stringify(a.detalhes) : null,
      })
      .execute();
  }

  for (const [i, it] of d.itens.entries()) {
    const p = porId.get(it.produto_id)!;
    if (!p.controla_estoque) continue;
    await movimentarEstoque(tx, { produtoId: p.id, tipo: 'venda', variacaoMil: -quantidades[i], usuarioId: operador.id, origemTipo: 'venda', origemId: d.id });
  }

  for (const v of vales.values()) {
    const saldo = v.saldo - v.usar;
    await tx
      .updateTable('vales_troca')
      .set({ saldo, situacao: saldo === 0 ? 'usado' : 'ativo', atualizado_em: sql`now()`, atualizado_por: operador.id })
      .where('id', '=', v.id)
      .execute();
  }

  await auditar(tx, { usuarioId: operador.id, ip }, {
    entidade: 'venda',
    entidadeId: d.id,
    acao: 'finalizar',
    autorizadorId: autorizacaoDesconto?.autorizador_id ?? null,
    depois: { numero, total: calc.total, desconto_total: calc.desconto_total, troco, sessao_caixa: sessao.numero },
    soDiferencas: false,
  });
  return d.id;
}

/** Venda completa. Para o perfil Caixa, restringe à sessão aberta dele e oculta custos. */
export async function obterVenda(id: string, quem: UsuarioLogado, opcoes: { ignorarEscopo?: boolean } = {}): Promise<Record<string, any>> {
  const db = banco();
  const v = await db
    .selectFrom('vendas as v')
    .innerJoin('sessoes_caixa as s', 's.id', 'v.sessao_caixa_id')
    .innerJoin('usuarios as o', 'o.id', 'v.operador_id')
    .leftJoin('clientes as c', 'c.id', 'v.cliente_id')
    .leftJoin('usuarios as cp', 'cp.id', 'v.cancelada_por')
    .leftJoin('usuarios as ca', 'ca.id', 'v.cancelamento_autorizado_por')
    .selectAll('v')
    .select([
      's.numero as sessao_numero', 's.situacao as sessao_situacao', 'o.nome as operador_nome', 'c.nome as cliente_nome', 'c.documento as cliente_documento',
      'cp.nome as cancelada_por_nome', 'ca.nome as cancelamento_autorizado_por_nome',
    ])
    .where('v.id', '=', id)
    .executeTakeFirst();
  if (!v) throw naoEncontrado('Venda não encontrada.');
  const supervisor = ehSupervisor(quem.perfil);
  if (!supervisor && !opcoes.ignorarEscopo) {
    const atual = await caixaAbertoDoOperador(db, quem.id);
    if (!atual || atual.id !== v.sessao_caixa_id) throw semPermissao('Você só pode consultar as vendas do seu caixa aberto.');
  }
  const itens = await db.selectFrom('vendas_itens').selectAll().where('venda_id', '=', id).orderBy('ordem').execute();
  const pagamentos = await db
    .selectFrom('vendas_pagamentos as p')
    .leftJoin('vales_troca as vt', 'vt.id', 'p.vale_troca_id')
    .select(['p.id', 'p.ordem', 'p.forma', 'p.valor', 'p.parcelas', 'p.vale_troca_id', 'vt.codigo as codigo_vale', 'p.observacao'])
    .where('p.venda_id', '=', id)
    .orderBy('p.ordem')
    .execute();
  const autorizacoes = await db
    .selectFrom('vendas_autorizacoes as a')
    .innerJoin('usuarios as o', 'o.id', 'a.operador_id')
    .innerJoin('usuarios as z', 'z.id', 'a.autorizador_id')
    .select(['a.id', 'a.tipo', 'a.percentual', 'a.valor', 'a.motivo', 'a.detalhes', 'a.data_hora', 'a.operador_id', 'o.nome as operador_nome', 'a.autorizador_id', 'z.nome as autorizador_nome'])
    .where('a.venda_id', '=', id)
    .execute();
  const devolucoes = await db
    .selectFrom('devolucoes')
    .select(['id', 'numero', 'valor', 'destino', 'forma_estorno', 'criado_em'])
    .where('venda_id', '=', id)
    .orderBy('numero')
    .execute();
  const { atualizado_por: _a, criado_por: _c, ...venda } = v;
  return {
    ...venda,
    desconto_total: v.desconto_itens + v.desconto_venda,
    pode_cancelar: v.situacao === 'finalizada' && v.sessao_situacao === 'aberto' && devolucoes.length === 0,
    itens: itens.map((i) => {
      const { custo_unitario, venda_id: _v, ...resto } = i;
      return {
        ...resto,
        quantidade: Number(i.quantidade),
        quantidade_devolvida: Number(i.quantidade_devolvida),
        quantidade_disponivel_devolucao: (mil(i.quantidade) - mil(i.quantidade_devolvida)) / 1000,
        ...(supervisor ? { custo_unitario } : {}),
      };
    }),
    pagamentos,
    autorizacoes: autorizacoes.map((a) => ({ ...a, percentual: a.percentual === null ? null : Number(a.percentual) })),
    devolucoes,
  };
}

export async function listarVendas(
  quem: UsuarioLogado,
  f: { inicio?: string | null; fim?: string | null; operador_id?: string; forma?: string; situacao?: string; cliente_id?: string; numero?: number; pagina: number; por_pagina: number },
) {
  const db = banco();
  const fuso = await fusoDaLoja(db);
  let q = db
    .selectFrom('vendas as v')
    .innerJoin('usuarios as o', 'o.id', 'v.operador_id')
    .leftJoin('clientes as c', 'c.id', 'v.cliente_id');
  if (!ehSupervisor(quem.perfil)) {
    // Perfil Caixa: apenas vendas da sessão aberta atual.
    const atual = await caixaAbertoDoOperador(db, quem.id);
    if (!atual) return { itens: [], total: 0, pagina: f.pagina, por_pagina: f.por_pagina, totais: { quantidade: 0, quantidade_finalizadas: 0, soma_finalizadas: 0 } };
    q = q.where('v.sessao_caixa_id', '=', atual.id);
  } else if (f.numero === undefined) {
    const hoje = hojeNoFuso(fuso);
    q = q.where('v.finalizada_em', '>=', inicioDoDia(f.inicio ?? hoje, fuso)).where('v.finalizada_em', '<', fimDoDia(f.fim ?? f.inicio ?? hoje, fuso));
  }
  if (f.numero !== undefined) q = q.where('v.numero', '=', f.numero);
  if (f.operador_id) q = q.where('v.operador_id', '=', f.operador_id);
  if (f.situacao) q = q.where('v.situacao', '=', f.situacao);
  if (f.cliente_id) q = q.where('v.cliente_id', '=', f.cliente_id);
  if (f.forma) q = q.where(sql<boolean>`EXISTS (SELECT 1 FROM vendas_pagamentos p WHERE p.venda_id = v.id AND p.forma = ${f.forma})`);
  const tot = await q
    .select([
      sql<number>`count(*)`.as('quantidade'),
      sql<number>`count(*) FILTER (WHERE v.situacao = 'finalizada')`.as('quantidade_finalizadas'),
      sql<number>`coalesce(sum(v.total) FILTER (WHERE v.situacao = 'finalizada'), 0)`.as('soma_finalizadas'),
    ])
    .executeTakeFirstOrThrow();
  const itens = await q
    .select([
      'v.id', 'v.numero', 'v.finalizada_em', 'v.operador_id', 'o.nome as operador_nome', 'v.cliente_id', 'c.nome as cliente_nome',
      'v.desconto_itens', 'v.desconto_venda', 'v.total', 'v.troco', 'v.situacao', 'v.sessao_caixa_id',
    ])
    .select(sql<string[]>`ARRAY(SELECT DISTINCT p.forma FROM vendas_pagamentos p WHERE p.venda_id = v.id)`.as('formas'))
    .orderBy('v.numero', 'desc')
    .limit(f.por_pagina)
    .offset((f.pagina - 1) * f.por_pagina)
    .execute();
  return {
    itens: itens.map((i) => ({ ...i, desconto_total: i.desconto_itens + i.desconto_venda, formas_resumo: i.formas.map((x) => NOMES_FORMAS[x as keyof typeof NOMES_FORMAS]).join(' + ') })),
    total: Number(tot.quantidade),
    pagina: f.pagina,
    por_pagina: f.por_pagina,
    totais: { quantidade: Number(tot.quantidade), quantidade_finalizadas: Number(tot.quantidade_finalizadas), soma_finalizadas: Number(tot.soma_finalizadas) },
  };
}

export async function cancelarVenda(quem: UsuarioLogado, ip: string, id: string, d: { motivo: string; token_autorizacao?: string }) {
  await banco()
    .transaction()
    .execute(async (tx) => {
      const v = await tx.selectFrom('vendas').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!v) throw naoEncontrado('Venda não encontrada.');
      if (v.situacao === 'cancelada') throw conflito('Esta venda já está cancelada.');
      const sessao = await tx.selectFrom('sessoes_caixa').selectAll().where('id', '=', v.sessao_caixa_id).forUpdate().executeTakeFirstOrThrow();
      if (sessao.situacao !== 'aberto') {
        throw conflito('O caixa desta venda já foi fechado, então ela não pode mais ser cancelada. Use troca/devolução.', { codigo: 'CAIXA_DA_VENDA_FECHADO' });
      }
      const dev = await tx.selectFrom('devolucoes').select('id').where('venda_id', '=', id).executeTakeFirst();
      if (dev) throw conflito('Esta venda já tem devolução registrada e não pode ser cancelada. Use troca/devolução para os demais itens.');
      let autorizadorId: string | null = null;
      if (!ehSupervisor(quem.perfil)) {
        if (sessao.operador_id !== quem.id) throw semPermissao('Você só pode cancelar vendas do seu caixa.');
        if (!d.token_autorizacao) throw autorizacaoNecessaria('cancelar_venda', 'Cancelar uma venda finalizada exige autorização de um gerente ou administrador.');
        const a = await consumirAutorizacao(tx, d.token_autorizacao, quem.id, 'cancelar_venda');
        autorizadorId = a.autorizador_id;
      }
      await tx
        .updateTable('vendas')
        .set({
          situacao: 'cancelada',
          cancelada_em: sql`now()`,
          cancelada_por: quem.id,
          cancelamento_autorizado_por: autorizadorId,
          motivo_cancelamento: d.motivo,
          atualizado_em: sql`now()`,
          atualizado_por: quem.id,
        })
        .where('id', '=', id)
        .execute();
      const itens = await tx.selectFrom('vendas_itens').selectAll().where('venda_id', '=', id).orderBy('ordem').execute();
      const produtos = await bloquearProdutos(tx, itens.map((i) => i.produto_id));
      const porId = new Map(produtos.map((p) => [p.id, p]));
      for (const i of itens) {
        if (!porId.get(i.produto_id)!.controla_estoque) continue;
        await movimentarEstoque(tx, { produtoId: i.produto_id, tipo: 'cancelamento_venda', variacaoMil: mil(i.quantidade), usuarioId: quem.id, origemTipo: 'venda', origemId: id });
      }
      // Vales usados recebem o saldo de volta; se expiraram, ganham mais 30 dias.
      const fuso = await fusoDaLoja(tx);
      const hoje = hojeNoFuso(fuso);
      const pagosComVale = await tx.selectFrom('vendas_pagamentos').select(['vale_troca_id', 'valor']).where('venda_id', '=', id).where('forma', '=', 'vale_troca').execute();
      for (const p of pagosComVale) {
        const vale = await tx.selectFrom('vales_troca').selectAll().where('id', '=', p.vale_troca_id).forUpdate().executeTakeFirstOrThrow();
        await tx
          .updateTable('vales_troca')
          .set({
            saldo: vale.saldo + p.valor,
            situacao: vale.situacao === 'cancelado' ? 'cancelado' : 'ativo',
            validade: vale.validade < hoje ? somarDias(hoje, 30) : vale.validade,
            atualizado_em: sql`now()`,
            atualizado_por: quem.id,
          })
          .where('id', '=', vale.id)
          .execute();
      }
      await auditar(tx, { usuarioId: quem.id, ip }, {
        entidade: 'venda',
        entidadeId: id,
        acao: 'cancelar',
        autorizadorId,
        antes: { situacao: 'finalizada' },
        depois: { situacao: 'cancelada', numero: v.numero, total: v.total, motivo: d.motivo },
        soDiferencas: false,
      });
    });
}

/** Registra na auditoria uma venda em andamento descartada (ela nunca existiu no servidor). */
export async function registrarDescarte(
  quem: UsuarioLogado,
  ip: string,
  d: { itens: unknown[]; total: number; motivo?: string | null; token_autorizacao?: string },
) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      let autorizadorId: string | null = null;
      let motivo = d.motivo ?? null;
      if (!ehSupervisor(quem.perfil) && d.itens.length > 0) {
        if (!d.token_autorizacao) {
          throw autorizacaoNecessaria('cancelar_venda_andamento', 'Cancelar a venda em andamento exige autorização de um gerente ou administrador.');
        }
        const a = await consumirAutorizacao(tx, d.token_autorizacao, quem.id, 'cancelar_venda_andamento');
        autorizadorId = a.autorizador_id;
        motivo = a.motivo;
      }
      await auditar(tx, { usuarioId: quem.id, ip }, {
        entidade: 'venda_em_andamento',
        acao: 'cancelar',
        autorizadorId,
        depois: { itens: d.itens, total: d.total, motivo },
        soDiferencas: false,
      });
      return { ok: true };
    });
}
