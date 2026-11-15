import { banco, sql } from '../../db/conexao.js';
import { fusoDaLoja, hojeNoFuso, somarDias } from '../../lib/datas.js';
import { FORMAS_PAGAMENTO } from '../../lib/dinheiro.js';
import { estoqueBaixo } from '../estoque/servico.js';
import { listarSessoes } from '../caixa/servico.js';

/** Vendas finalizadas, devoluções e itens num intervalo de datas (fuso da loja). */
async function totaisDoIntervalo(inicio: string, fim: string, fuso: string) {
  const r = await sql<{ vendido: number; quantidade: number; devolvido: number; itens: number }>`
    WITH lim AS (SELECT (${inicio}::date::timestamp AT TIME ZONE ${fuso}) AS ini, ((${fim}::date + 1)::timestamp AT TIME ZONE ${fuso}) AS fim)
    SELECT
      (SELECT coalesce(sum(total), 0) FROM vendas, lim WHERE situacao = 'finalizada' AND finalizada_em >= lim.ini AND finalizada_em < lim.fim) AS vendido,
      (SELECT count(*) FROM vendas, lim WHERE situacao = 'finalizada' AND finalizada_em >= lim.ini AND finalizada_em < lim.fim) AS quantidade,
      (SELECT coalesce(sum(valor), 0) FROM devolucoes, lim WHERE criado_em >= lim.ini AND criado_em < lim.fim) AS devolvido,
      (SELECT coalesce(sum(i.quantidade), 0) FROM vendas_itens i JOIN vendas v ON v.id = i.venda_id, lim
        WHERE v.situacao = 'finalizada' AND v.finalizada_em >= lim.ini AND v.finalizada_em < lim.fim) AS itens`.execute(banco());
  const x = r.rows[0];
  const total = Number(x.vendido) - Number(x.devolvido);
  const n = Number(x.quantidade);
  return {
    total_vendido: total,
    vendas_brutas: Number(x.vendido),
    devolucoes: Number(x.devolvido),
    numero_vendas: n,
    ticket_medio: n > 0 ? Math.round(total / n) : 0,
    itens_vendidos: Number(x.itens),
  };
}

async function porFormaDePagamento(inicio: string, fim: string, fuso: string) {
  const r = await sql<{ forma: string; valor: number }>`
    SELECT p.forma, sum(p.valor) AS valor
      FROM vendas_pagamentos p JOIN vendas v ON v.id = p.venda_id
     WHERE v.situacao = 'finalizada'
       AND v.finalizada_em >= (${inicio}::date::timestamp AT TIME ZONE ${fuso})
       AND v.finalizada_em < ((${fim}::date + 1)::timestamp AT TIME ZONE ${fuso})
     GROUP BY p.forma`.execute(banco());
  const troco = await sql<{ troco: number }>`
    SELECT coalesce(sum(troco), 0) AS troco FROM vendas
     WHERE situacao = 'finalizada'
       AND finalizada_em >= (${inicio}::date::timestamp AT TIME ZONE ${fuso})
       AND finalizada_em < ((${fim}::date + 1)::timestamp AT TIME ZONE ${fuso})`.execute(banco());
  const valores = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f, 0])) as Record<string, number>;
  for (const l of r.rows) valores[l.forma] = Number(l.valor);
  valores.dinheiro -= Number(troco.rows[0].troco); // dinheiro líquido de troco
  const soma = Object.values(valores).reduce((s, v) => s + v, 0);
  return FORMAS_PAGAMENTO.map((forma) => ({
    forma,
    valor: valores[forma],
    percentual: soma > 0 ? Math.round((valores[forma] / soma) * 1000) / 10 : 0,
  }));
}

async function grafico(periodo: '7d' | '30d' | '12m', hoje: string, fuso: string) {
  if (periodo === '12m') {
    const inicio = `${somarMeses(hoje.slice(0, 7), -11)}-01`;
    const r = await sql<{ rotulo: string; total: number; quantidade: number }>`
      WITH meses AS (SELECT to_char(generate_series(${inicio}::date, ${hoje}::date, interval '1 month'), 'YYYY-MM') AS rotulo)
      SELECT m.rotulo,
        coalesce((SELECT sum(total) FROM vendas WHERE situacao = 'finalizada' AND to_char(finalizada_em AT TIME ZONE ${fuso}, 'YYYY-MM') = m.rotulo), 0)
        - coalesce((SELECT sum(valor) FROM devolucoes WHERE to_char(criado_em AT TIME ZONE ${fuso}, 'YYYY-MM') = m.rotulo), 0) AS total,
        (SELECT count(*) FROM vendas WHERE situacao = 'finalizada' AND to_char(finalizada_em AT TIME ZONE ${fuso}, 'YYYY-MM') = m.rotulo) AS quantidade
      FROM meses m ORDER BY m.rotulo`.execute(banco());
    return { agrupamento: 'mes', pontos: r.rows.map((p) => ({ data: p.rotulo, total: Number(p.total), numero_vendas: Number(p.quantidade) })) };
  }
  const dias = periodo === '7d' ? 7 : 30;
  const inicio = somarDias(hoje, -(dias - 1));
  const r = await sql<{ dia: string; total: number; quantidade: number }>`
    WITH dias AS (SELECT generate_series(${inicio}::date, ${hoje}::date, interval '1 day')::date AS dia),
    v AS (SELECT (finalizada_em AT TIME ZONE ${fuso})::date AS dia, sum(total) AS total, count(*) AS quantidade FROM vendas
           WHERE situacao = 'finalizada' AND finalizada_em >= (${inicio}::date::timestamp AT TIME ZONE ${fuso}) GROUP BY 1),
    d AS (SELECT (criado_em AT TIME ZONE ${fuso})::date AS dia, sum(valor) AS total FROM devolucoes
           WHERE criado_em >= (${inicio}::date::timestamp AT TIME ZONE ${fuso}) GROUP BY 1)
    SELECT to_char(dias.dia, 'YYYY-MM-DD') AS dia, coalesce(v.total, 0) - coalesce(d.total, 0) AS total, coalesce(v.quantidade, 0) AS quantidade
      FROM dias LEFT JOIN v ON v.dia = dias.dia LEFT JOIN d ON d.dia = dias.dia ORDER BY dias.dia`.execute(banco());
  return { agrupamento: 'dia', pontos: r.rows.map((p) => ({ data: p.dia, total: Number(p.total), numero_vendas: Number(p.quantidade) })) };
}

function somarMeses(anoMes: string, meses: number) {
  const [a, m] = anoMes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + meses, 1));
  return d.toISOString().slice(0, 7);
}

async function maisVendidos(inicio: string, fim: string, fuso: string) {
  const r = await sql<{ produto_id: string; nome: string; unidade: string; quantidade: number; valor: number }>`
    SELECT i.produto_id, max(i.descricao) AS nome, max(i.unidade) AS unidade,
           sum(i.quantidade) AS quantidade, sum(i.total_liquido) AS valor
      FROM vendas_itens i JOIN vendas v ON v.id = i.venda_id
     WHERE v.situacao = 'finalizada'
       AND v.finalizada_em >= (${inicio}::date::timestamp AT TIME ZONE ${fuso})
       AND v.finalizada_em < ((${fim}::date + 1)::timestamp AT TIME ZONE ${fuso})
     GROUP BY i.produto_id`.execute(banco());
  const linhas = r.rows.map((x) => ({ ...x, quantidade: Number(x.quantidade), valor: Number(x.valor) }));
  return {
    por_quantidade: [...linhas].sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor).slice(0, 10),
    por_valor: [...linhas].sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade).slice(0, 10),
  };
}

const variacao = (atual: number, anterior: number) => (anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 1000) / 10);

export async function montarDashboard(periodo: '7d' | '30d' | '12m') {
  const fuso = await fusoDaLoja(banco());
  const hoje = hojeNoFuso(fuso);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const mesAnterior = somarMeses(hoje.slice(0, 7), -1);
  const [ano, mes] = mesAnterior.split('-').map(Number);
  const ultimoDiaAnterior = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const diaComparavel = Math.min(Number(hoje.slice(8, 10)), ultimoDiaAnterior);
  const fimAnterior = `${mesAnterior}-${String(diaComparavel).padStart(2, '0')}`;

  const inicioPeriodo = periodo === '12m' ? `${somarMeses(hoje.slice(0, 7), -11)}-01` : somarDias(hoje, periodo === '7d' ? -6 : -29);
  const [diaAtual, mesAtual, mesPassado, formasHoje, formasMes, graf, top, baixo, caixas] = await Promise.all([
    totaisDoIntervalo(hoje, hoje, fuso),
    totaisDoIntervalo(inicioMes, hoje, fuso),
    totaisDoIntervalo(`${mesAnterior}-01`, fimAnterior, fuso),
    porFormaDePagamento(hoje, hoje, fuso),
    porFormaDePagamento(inicioMes, hoje, fuso),
    grafico(periodo, hoje, fuso),
    maisVendidos(inicioPeriodo, hoje, fuso),
    estoqueBaixo({}),
    listarSessoes({ situacao: 'aberto', pagina: 1, por_pagina: 50 }),
  ]);
  return {
    data_referencia: hoje,
    hoje: diaAtual,
    mes: {
      ...mesAtual,
      mes_anterior_mesmo_periodo: { inicio: `${mesAnterior}-01`, fim: fimAnterior, total_vendido: mesPassado.total_vendido, numero_vendas: mesPassado.numero_vendas },
      variacao_percentual: variacao(mesAtual.total_vendido, mesPassado.total_vendido),
    },
    grafico: { periodo, ...graf },
    formas_pagamento: { hoje: formasHoje, mes: formasMes },
    mais_vendidos: { periodo, inicio: inicioPeriodo, fim: hoje, ...top },
    estoque_baixo: { itens: baixo.itens.slice(0, 10), total: baixo.itens.length },
    caixas_abertos: caixas.itens.map((c) => ({
      id: c.id, numero: c.numero, operador_id: c.operador_id, operador_nome: c.operador_nome, terminal: c.terminal,
      aberto_em: c.aberto_em, minutos_aberto: c.minutos_aberto, total_vendido: c.total_vendido, quantidade_vendas: c.quantidade_vendas, vencido: c.vencido,
    })),
  };
}
