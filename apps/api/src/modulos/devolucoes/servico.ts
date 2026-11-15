import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar } from '../../lib/auditoria.js';
import { conflito, erroValidacao, naoEncontrado, ErroApp } from '../../lib/erros.js';
import { quantidadeValida, arredDivisao, formatarReais } from '../../lib/dinheiro.js';
import { ehSupervisor, type UsuarioLogado } from '../../lib/contexto.js';
import { dataNoFuso, diasEntre, fusoDaLoja, hojeNoFuso, somarDias, inicioDoDia, fimDoDia } from '../../lib/datas.js';
import { bloquearProdutos, movimentarEstoque, mil } from '../estoque/movimentar.js';
import { exigirCaixaOperante, resumoSessao } from '../caixa/servico.js';
import { obterConfiguracoes } from '../configuracoes/servico.js';
import { autorizacaoNecessaria, consumirAutorizacao } from '../autorizacoes/servico.js';
import { gerarCodigoVale } from '../vales/servico.js';

export interface PedidoDevolucao {
  venda_id: string;
  itens: { venda_item_id: string; quantidade: number | string; volta_estoque?: boolean }[];
  destino?: 'vale_troca' | 'estorno';
  forma_estorno?: 'dinheiro' | 'debito' | 'credito' | 'pix' | null;
  motivo?: 'defeito' | 'arrependimento' | 'tamanho_modelo' | 'outro';
  motivo_texto?: string | null;
  token_autorizacao?: string;
}

/**
 * Valor proporcional ao líquido do item; a devolução que zera o item usa o restante exato
 * (assim devoluções sucessivas somam exatamente o total líquido).
 */
export function valorDevolucaoItem(item: { quantidade: number; quantidade_devolvida: number; total_liquido: number; valor_devolvido: number }, qtdMil: number) {
  const vendida = mil(item.quantidade);
  const jaDevolvida = mil(item.quantidade_devolvida);
  if (jaDevolvida + qtdMil === vendida) return item.total_liquido - item.valor_devolvido;
  return arredDivisao(BigInt(item.total_liquido) * BigInt(qtdMil), BigInt(vendida));
}

async function calcular(tx: Tx, quem: UsuarioLogado, p: PedidoDevolucao, bloquear: boolean) {
  let qv = tx.selectFrom('vendas').selectAll().where('id', '=', p.venda_id);
  if (bloquear) qv = qv.forUpdate();
  const venda = await qv.executeTakeFirst();
  if (!venda) throw naoEncontrado('Venda não encontrada. Confira o número da venda.');
  if (venda.situacao !== 'finalizada') throw conflito('Esta venda foi cancelada e não aceita troca ou devolução.');
  const cfg = await obterConfiguracoes(tx);
  const fuso = await fusoDaLoja(tx);
  const dias = diasEntre(dataNoFuso(venda.finalizada_em, fuso), hojeNoFuso(fuso));
  const foraDoPrazo = cfg.prazo_trocas_dias > 0 && dias > cfg.prazo_trocas_dias;
  if (!p.itens?.length) throw erroValidacao('Escolha pelo menos um item para devolver.', { itens: 'Nenhum item escolhido.' });
  let qi = tx.selectFrom('vendas_itens').selectAll().where('venda_id', '=', venda.id);
  if (bloquear) qi = qi.forUpdate();
  const itensVenda = new Map((await qi.execute()).map((i) => [i.id, i]));
  const vistos = new Set<string>();
  const itens = p.itens.map((it, idx) => {
    const iv = itensVenda.get(it.venda_item_id);
    if (!iv) throw erroValidacao(`O item ${idx + 1} não pertence a esta venda.`, { [`itens.${idx}.venda_item_id`]: 'Item inválido.' });
    if (vistos.has(iv.id)) throw erroValidacao(`O item "${iv.descricao}" foi informado duas vezes.`);
    vistos.add(iv.id);
    const q = quantidadeValida(it.quantidade, iv.unidade, `itens.${idx}.quantidade`);
    const disponivel = mil(iv.quantidade) - mil(iv.quantidade_devolvida);
    if (q > disponivel) {
      throw erroValidacao(`Quantidade maior que a disponível para devolução de "${iv.descricao}" (disponível: ${(disponivel / 1000).toLocaleString('pt-BR')}).`, {
        [`itens.${idx}.quantidade`]: `Máximo ${(disponivel / 1000).toLocaleString('pt-BR')}.`,
      });
    }
    const valor = valorDevolucaoItem({ total_liquido: iv.total_liquido, valor_devolvido: iv.valor_devolvido, quantidade: Number(iv.quantidade), quantidade_devolvida: Number(iv.quantidade_devolvida) }, q);
    return { venda_item: iv, quantidadeMil: q, valor, volta_estoque: it.volta_estoque ?? true };
  });
  const valor = itens.reduce((s, i) => s + i.valor, 0);
  return { venda, itens, valor, foraDoPrazo, diasDesdeVenda: dias, prazo: cfg.prazo_trocas_dias, cfg, fuso, precisaAutorizacao: !ehSupervisor(quem.perfil) };
}

export async function simularDevolucao(quem: UsuarioLogado, p: PedidoDevolucao) {
  const c = await calcular(banco(), quem, p, false);
  return {
    venda_id: c.venda.id,
    venda_numero: c.venda.numero,
    valor: c.valor,
    fora_do_prazo: c.foraDoPrazo,
    dias_desde_venda: c.diasDesdeVenda,
    prazo_trocas_dias: c.prazo,
    precisa_autorizacao: c.precisaAutorizacao,
    itens: c.itens.map((i) => ({
      venda_item_id: i.venda_item.id,
      descricao: i.venda_item.descricao,
      quantidade: i.quantidadeMil / 1000,
      valor: i.valor,
      volta_estoque: i.volta_estoque,
    })),
  };
}

export async function registrarDevolucao(quem: UsuarioLogado, ip: string, p: PedidoDevolucao) {
  if (!p.destino) throw erroValidacao('Escolha o destino do valor: vale-troca ou estorno.', { destino: 'Obrigatório.' });
  if (!p.motivo) throw erroValidacao('Escolha o motivo da devolução.', { motivo: 'Obrigatório.' });
  if (p.motivo === 'outro' && (!p.motivo_texto || p.motivo_texto.trim().length < 3)) {
    throw erroValidacao('Descreva o motivo da devolução.', { motivo_texto: 'Obrigatório quando o motivo é "outro".' });
  }
  if (p.destino === 'estorno' && !p.forma_estorno) throw erroValidacao('Escolha a forma do estorno.', { forma_estorno: 'Obrigatória no estorno.' });
  return banco()
    .transaction()
    .execute(async (tx) => {
      const c = await calcular(tx, quem, p, true);
      if (c.valor <= 0) throw erroValidacao('O valor desta devolução é zero. Confira os itens escolhidos.');
      let autorizadorId: string | null = null;
      if (c.precisaAutorizacao) {
        if (!p.token_autorizacao) {
          throw autorizacaoNecessaria(
            'devolucao',
            c.foraDoPrazo
              ? `Venda fora do prazo de trocas (${c.prazo} dias). Peça autorização a um gerente ou administrador.`
              : 'Trocas e devoluções exigem autorização de um gerente ou administrador.',
            { fora_do_prazo: c.foraDoPrazo },
          );
        }
        autorizadorId = (await consumirAutorizacao(tx, p.token_autorizacao, quem.id, 'devolucao')).autorizador_id;
      }

      let sessaoId: string | null = null;
      if (p.destino === 'estorno' && p.forma_estorno === 'dinheiro') {
        const sessao = await exigirCaixaOperante(tx, quem.id).catch((e: ErroApp) => {
          throw new ErroApp(409, `Para estornar em dinheiro, você precisa estar com o caixa aberto. ${e.extras?.codigo === 'CAIXA_VENCIDO' ? 'Feche o caixa do dia anterior e abra o de hoje.' : 'Abra o caixa e tente de novo.'}`, { codigo: e.extras?.codigo ?? 'CAIXA_FECHADO' });
        });
        const r = await resumoSessao(tx, sessao.id);
        if (c.valor > r.esperado_dinheiro) {
          throw conflito(`Não há dinheiro suficiente no caixa para estornar ${formatarReais(c.valor)}. Escolha outra forma de estorno ou faça um suprimento.`, {
            codigo: 'DINHEIRO_INSUFICIENTE',
          });
        }
        sessaoId = sessao.id;
      }

      const dev = await tx
        .insertInto('devolucoes')
        .values({
          venda_id: c.venda.id,
          cliente_id: c.venda.cliente_id,
          valor: c.valor,
          destino: p.destino!,
          forma_estorno: p.destino === 'estorno' ? p.forma_estorno! : null,
          motivo: p.motivo!,
          motivo_texto: p.motivo_texto ?? null,
          usuario_id: quem.id,
          autorizador_id: autorizadorId,
          sessao_caixa_id: sessaoId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await tx
        .insertInto('devolucoes_itens')
        .values(
          c.itens.map((i) => ({
            devolucao_id: dev.id,
            venda_item_id: i.venda_item.id,
            produto_id: i.venda_item.produto_id,
            quantidade: i.quantidadeMil / 1000,
            valor: i.valor,
            volta_estoque: i.volta_estoque,
          })),
        )
        .execute();

      for (const i of c.itens) {
        await tx
          .updateTable('vendas_itens')
          .set({
            quantidade_devolvida: (mil(i.venda_item.quantidade_devolvida) + i.quantidadeMil) / 1000,
            valor_devolvido: i.venda_item.valor_devolvido + i.valor,
          })
          .where('id', '=', i.venda_item.id)
          .execute();
      }

      const voltam = c.itens.filter((i) => i.volta_estoque);
      const produtos = new Map((await bloquearProdutos(tx, voltam.map((i) => i.venda_item.produto_id))).map((p) => [p.id, p]));
      for (const i of voltam) {
        if (!produtos.get(i.venda_item.produto_id)!.controla_estoque) continue;
        await movimentarEstoque(tx, {
          produtoId: i.venda_item.produto_id,
          tipo: 'devolucao',
          variacaoMil: i.quantidadeMil,
          usuarioId: quem.id,
          origemTipo: 'devolucao',
          origemId: dev.id,
        });
      }

      let vale: { id: string; codigo: string; validade: string } | null = null;
      if (p.destino === 'vale_troca') {
        const codigo = await gerarCodigoVale(tx);
        const validade = somarDias(hojeNoFuso(c.fuso), c.cfg.validade_vale_troca_dias);
        vale = await tx
          .insertInto('vales_troca')
          .values({
            codigo,
            cliente_id: c.venda.cliente_id,
            valor_original: c.valor,
            saldo: c.valor,
            validade,
            devolucao_id: dev.id,
            criado_por: quem.id,
            atualizado_por: quem.id,
          })
          .returning(['id', 'codigo', 'validade'])
          .executeTakeFirstOrThrow();
        await tx.updateTable('devolucoes').set({ vale_troca_id: vale!.id }).where('id', '=', dev.id).execute();
      } else if (sessaoId) {
        await tx
          .insertInto('movimentos_caixa')
          .values({
            sessao_caixa_id: sessaoId,
            tipo: 'estorno_dinheiro',
            valor: c.valor,
            motivo: `Devolução nº ${dev.numero} (venda nº ${c.venda.numero})`,
            usuario_id: quem.id,
            autorizador_id: autorizadorId,
            devolucao_id: dev.id,
          })
          .execute();
      }

      await auditar(tx, { usuarioId: quem.id, ip }, {
        entidade: 'devolucao',
        entidadeId: dev.id,
        acao: 'criar',
        autorizadorId,
        depois: { numero: dev.numero, venda: c.venda.numero, valor: c.valor, destino: p.destino, forma_estorno: p.forma_estorno ?? null, vale: vale?.codigo ?? null },
        soDiferencas: false,
      });
      return dev.id as string;
    });
}

export async function obterDevolucao(id: string) {
  const db = banco();
  const d = await db
    .selectFrom('devolucoes as d')
    .innerJoin('vendas as v', 'v.id', 'd.venda_id')
    .innerJoin('usuarios as u', 'u.id', 'd.usuario_id')
    .leftJoin('usuarios as a', 'a.id', 'd.autorizador_id')
    .leftJoin('clientes as c', 'c.id', 'd.cliente_id')
    .leftJoin('vales_troca as vt', 'vt.id', 'd.vale_troca_id')
    .selectAll('d')
    .select([
      'v.numero as venda_numero', 'v.finalizada_em as venda_data', 'u.nome as usuario_nome', 'a.nome as autorizador_nome', 'c.nome as cliente_nome',
      'vt.codigo as vale_codigo', 'vt.validade as vale_validade', 'vt.saldo as vale_saldo',
    ])
    .where('d.id', '=', id)
    .executeTakeFirst();
  if (!d) throw naoEncontrado('Devolução não encontrada.');
  const itens = await db
    .selectFrom('devolucoes_itens as i')
    .innerJoin('vendas_itens as vi', 'vi.id', 'i.venda_item_id')
    .select(['i.id', 'i.venda_item_id', 'i.produto_id', 'vi.descricao', 'vi.unidade', 'i.quantidade', 'i.valor', 'i.volta_estoque'])
    .where('i.devolucao_id', '=', id)
    .execute();
  return { ...d, itens: itens.map((i) => ({ ...i, quantidade: Number(i.quantidade) })) };
}

export async function listarDevolucoes(f: { inicio?: string | null; fim?: string | null; destino?: string; motivo?: string; venda_id?: string; pagina: number; por_pagina: number }) {
  const db = banco();
  const fuso = await fusoDaLoja(db);
  let q = db
    .selectFrom('devolucoes as d')
    .innerJoin('vendas as v', 'v.id', 'd.venda_id')
    .innerJoin('usuarios as u', 'u.id', 'd.usuario_id')
    .leftJoin('clientes as c', 'c.id', 'd.cliente_id')
    .leftJoin('vales_troca as vt', 'vt.id', 'd.vale_troca_id');
  if (f.inicio) q = q.where('d.criado_em', '>=', inicioDoDia(f.inicio, fuso));
  if (f.fim) q = q.where('d.criado_em', '<', fimDoDia(f.fim, fuso));
  if (f.destino) q = q.where('d.destino', '=', f.destino);
  if (f.motivo) q = q.where('d.motivo', '=', f.motivo);
  if (f.venda_id) q = q.where('d.venda_id', '=', f.venda_id);
  const total = await q.select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
  const itens = await q
    .select([
      'd.id', 'd.numero', 'd.criado_em', 'd.venda_id', 'v.numero as venda_numero', 'd.cliente_id', 'c.nome as cliente_nome', 'd.valor', 'd.destino',
      'd.forma_estorno', 'd.motivo', 'd.motivo_texto', 'u.nome as usuario_nome', 'vt.codigo as vale_codigo',
    ])
    .orderBy('d.numero', 'desc')
    .limit(f.por_pagina)
    .offset((f.pagina - 1) * f.por_pagina)
    .execute();
  return { itens, total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
}
