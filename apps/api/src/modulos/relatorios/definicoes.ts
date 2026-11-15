import { banco, sql } from '../../db/conexao.js';
import type { Periodo } from '../../lib/datas.js';
import { NOMES_FORMAS, FORMAS_PAGAMENTO } from '../../lib/dinheiro.js';
import { posicaoEstoque, estoqueBaixo, quantidadeComSinal } from '../estoque/servico.js';

export type TipoColuna = 'texto' | 'inteiro' | 'moeda' | 'quantidade' | 'percentual' | 'data' | 'data_hora' | 'booleano';
export interface Coluna {
  chave: string;
  titulo: string;
  tipo: TipoColuna;
}
export interface Resultado {
  colunas: Coluna[];
  linhas: Record<string, unknown>[];
  totais: Record<string, unknown>;
}
export type Filtros = Record<string, string | undefined>;

interface Contexto {
  periodo: Periodo;
  fuso: string;
  f: Filtros;
}

const col = (chave: string, titulo: string, tipo: TipoColuna = 'texto'): Coluna => ({ chave, titulo, tipo });
const n = (v: unknown) => Number(v ?? 0);
const pct = (parte: number, todo: number) => (todo === 0 ? null : Math.round((parte / todo) * 10000) / 100);
const div = (a: number, b: number) => (b === 0 ? 0 : Math.round(a / b));

/** Limites do período em timestamptz (fuso da loja). */
const ini = (c: Contexto) => sql`(${c.periodo.inicio}::date::timestamp AT TIME ZONE ${c.fuso})`;
const fim = (c: Contexto) => sql`((${c.periodo.fim}::date + 1)::timestamp AT TIME ZONE ${c.fuso})`;
const opcional = (valor: string | undefined, fragmento: ReturnType<typeof sql>) => (valor ? fragmento : sql``);

async function linhas<T = Record<string, unknown>>(consulta: ReturnType<typeof sql>) {
  return (await consulta.execute(banco())).rows as T[];
}

// R1 — Vendas por período
async function r1(c: Contexto): Promise<Resultado> {
  const agrupar = (c.f.agrupar ?? 'dia') as 'dia' | 'semana' | 'mes';
  const unidade = { dia: 'day', semana: 'week', mes: 'month' }[agrupar];
  const op = c.f.operador_id;
  const r = await linhas<Record<string, number | string>>(sql`
    WITH v AS (
      SELECT date_trunc(${unidade}, finalizada_em AT TIME ZONE ${c.fuso})::date AS periodo,
             count(*) AS numero_vendas, sum(soma_bruto) AS valor_bruto, sum(desconto_itens + desconto_venda) AS descontos, sum(total) AS total
        FROM vendas WHERE situacao = 'finalizada' AND finalizada_em >= ${ini(c)} AND finalizada_em < ${fim(c)}
        ${opcional(op, sql`AND operador_id = ${op}`)}
       GROUP BY 1),
    d AS (
      SELECT date_trunc(${unidade}, d.criado_em AT TIME ZONE ${c.fuso})::date AS periodo, sum(d.valor) AS devolucoes
        FROM devolucoes d JOIN vendas vv ON vv.id = d.venda_id
       WHERE d.criado_em >= ${ini(c)} AND d.criado_em < ${fim(c)} ${opcional(op, sql`AND vv.operador_id = ${op}`)}
       GROUP BY 1),
    p AS (SELECT generate_series(date_trunc(${unidade}, ${c.periodo.inicio}::date), ${c.periodo.fim}::date, ('1 ' || ${unidade})::interval)::date AS periodo)
    SELECT to_char(p.periodo, 'YYYY-MM-DD') AS periodo, coalesce(v.numero_vendas, 0) AS numero_vendas, coalesce(v.valor_bruto, 0) AS valor_bruto,
           coalesce(v.descontos, 0) AS descontos, coalesce(d.devolucoes, 0) AS devolucoes, coalesce(v.total, 0) AS total
      FROM p LEFT JOIN v ON v.periodo = p.periodo LEFT JOIN d ON d.periodo = p.periodo ORDER BY p.periodo`);
  const ls = r.map((x) => {
    const liquido = n(x.total) - n(x.devolucoes);
    return {
      periodo: x.periodo,
      numero_vendas: n(x.numero_vendas),
      valor_bruto: n(x.valor_bruto),
      descontos: n(x.descontos),
      devolucoes: n(x.devolucoes),
      total_liquido: liquido,
      ticket_medio: div(liquido, n(x.numero_vendas)),
    };
  });
  const soma = (k: keyof (typeof ls)[number]) => ls.reduce((s, l) => s + n(l[k]), 0);
  return {
    colunas: [
      col('periodo', agrupar === 'dia' ? 'Dia' : agrupar === 'semana' ? 'Semana (início)' : 'Mês', 'data'),
      col('numero_vendas', 'Nº de vendas', 'inteiro'), col('valor_bruto', 'Valor bruto', 'moeda'), col('descontos', 'Descontos', 'moeda'),
      col('devolucoes', 'Devoluções', 'moeda'), col('total_liquido', 'Total líquido', 'moeda'), col('ticket_medio', 'Ticket médio', 'moeda'),
    ],
    linhas: ls,
    totais: {
      numero_vendas: soma('numero_vendas'), valor_bruto: soma('valor_bruto'), descontos: soma('descontos'), devolucoes: soma('devolucoes'),
      total_liquido: soma('total_liquido'), ticket_medio: div(soma('total_liquido'), soma('numero_vendas')),
    },
  };
}

// R2 — Vendas por forma de pagamento (dinheiro líquido de troco)
async function r2(c: Contexto): Promise<Resultado> {
  const op = c.f.operador_id;
  const filtro = sql`v.situacao = 'finalizada' AND v.finalizada_em >= ${ini(c)} AND v.finalizada_em < ${fim(c)} ${opcional(op, sql`AND v.operador_id = ${op}`)}`;
  const formas = await linhas<{ forma: string; numero_vendas: number; valor: number }>(sql`
    SELECT p.forma, count(DISTINCT p.venda_id) AS numero_vendas, sum(p.valor) AS valor
      FROM vendas_pagamentos p JOIN vendas v ON v.id = p.venda_id WHERE ${filtro} GROUP BY p.forma`);
  const troco = n((await linhas<{ t: number }>(sql`SELECT coalesce(sum(v.troco), 0) AS t FROM vendas v WHERE ${filtro}`))[0].t);
  const parcelas = await linhas<{ parcelas: number; numero_vendas: number; valor: number }>(sql`
    SELECT p.parcelas, count(DISTINCT p.venda_id) AS numero_vendas, sum(p.valor) AS valor
      FROM vendas_pagamentos p JOIN vendas v ON v.id = p.venda_id WHERE ${filtro} AND p.forma = 'credito' GROUP BY p.parcelas ORDER BY p.parcelas`);
  const porForma = new Map(formas.map((f) => [f.forma, f]));
  const base = FORMAS_PAGAMENTO.map((forma) => {
    const f = porForma.get(forma);
    const valor = n(f?.valor) - (forma === 'dinheiro' ? troco : 0);
    return { forma, forma_nome: NOMES_FORMAS[forma], parcelas: null as number | null, numero_vendas: n(f?.numero_vendas), valor_recebido: valor };
  });
  const total = base.reduce((s, l) => s + l.valor_recebido, 0);
  const ls: Record<string, unknown>[] = [];
  for (const l of base) {
    ls.push({ ...l, percentual: pct(l.valor_recebido, total) });
    if (l.forma === 'credito') {
      for (const p of parcelas) {
        ls.push({ forma: 'credito', forma_nome: `Crédito em ${p.parcelas}x`, parcelas: n(p.parcelas), numero_vendas: n(p.numero_vendas), valor_recebido: n(p.valor), percentual: pct(n(p.valor), total), detalhe: true });
      }
    }
  }
  return {
    colunas: [col('forma_nome', 'Forma'), col('numero_vendas', 'Nº de vendas', 'inteiro'), col('valor_recebido', 'Valor recebido', 'moeda'), col('percentual', '% do total', 'percentual')],
    linhas: ls,
    totais: { valor_recebido: total, numero_vendas: n((await linhas<{ q: number }>(sql`SELECT count(*) AS q FROM vendas v WHERE ${filtro}`))[0].q) },
  };
}

// R3 — Vendas por operador
async function r3(c: Contexto): Promise<Resultado> {
  const r = await linhas<Record<string, number | string>>(sql`
    SELECT u.id AS operador_id, u.nome AS operador,
      (SELECT count(*) FROM vendas v WHERE v.operador_id = u.id AND v.situacao = 'finalizada' AND v.finalizada_em >= ${ini(c)} AND v.finalizada_em < ${fim(c)}) AS numero_vendas,
      (SELECT coalesce(sum(v.total), 0) FROM vendas v WHERE v.operador_id = u.id AND v.situacao = 'finalizada' AND v.finalizada_em >= ${ini(c)} AND v.finalizada_em < ${fim(c)}) AS total,
      (SELECT coalesce(sum(d.valor), 0) FROM devolucoes d JOIN vendas v ON v.id = d.venda_id WHERE v.operador_id = u.id AND d.criado_em >= ${ini(c)} AND d.criado_em < ${fim(c)}) AS devolucoes,
      (SELECT coalesce(sum(v.desconto_itens + v.desconto_venda), 0) FROM vendas v WHERE v.operador_id = u.id AND v.situacao = 'finalizada' AND v.finalizada_em >= ${ini(c)} AND v.finalizada_em < ${fim(c)}) AS descontos,
      (SELECT count(*) FROM autorizacoes a WHERE a.operador_id = u.id AND a.acao = 'remover_item' AND a.criada_em >= ${ini(c)} AND a.criada_em < ${fim(c)}) AS itens_removidos,
      (SELECT count(*) FROM vendas v WHERE v.operador_id = u.id AND v.situacao = 'cancelada' AND v.cancelada_em >= ${ini(c)} AND v.cancelada_em < ${fim(c)}) AS canceladas_qtd,
      (SELECT coalesce(sum(v.total), 0) FROM vendas v WHERE v.operador_id = u.id AND v.situacao = 'cancelada' AND v.cancelada_em >= ${ini(c)} AND v.cancelada_em < ${fim(c)}) AS canceladas_valor
    FROM usuarios u ORDER BY u.nome`);
  const ls = r
    .map((x) => {
      const liquido = n(x.total) - n(x.devolucoes);
      return {
        operador_id: x.operador_id, operador: x.operador, numero_vendas: n(x.numero_vendas), total_liquido: liquido, ticket_medio: div(liquido, n(x.numero_vendas)),
        descontos: n(x.descontos), itens_removidos: n(x.itens_removidos), canceladas_quantidade: n(x.canceladas_qtd), canceladas_valor: n(x.canceladas_valor),
      };
    })
    .filter((l) => l.numero_vendas || l.canceladas_quantidade || l.itens_removidos || l.total_liquido);
  const soma = (k: string) => ls.reduce((s, l) => s + n((l as Record<string, unknown>)[k]), 0);
  return {
    colunas: [
      col('operador', 'Operador'), col('numero_vendas', 'Nº de vendas', 'inteiro'), col('total_liquido', 'Total líquido', 'moeda'), col('ticket_medio', 'Ticket médio', 'moeda'),
      col('descontos', 'Descontos concedidos', 'moeda'), col('itens_removidos', 'Itens removidos com autorização', 'inteiro'),
      col('canceladas_quantidade', 'Vendas canceladas (qtd)', 'inteiro'), col('canceladas_valor', 'Vendas canceladas (valor)', 'moeda'),
    ],
    linhas: ls,
    totais: {
      numero_vendas: soma('numero_vendas'), total_liquido: soma('total_liquido'), ticket_medio: div(soma('total_liquido'), soma('numero_vendas')), descontos: soma('descontos'),
      itens_removidos: soma('itens_removidos'), canceladas_quantidade: soma('canceladas_quantidade'), canceladas_valor: soma('canceladas_valor'),
    },
  };
}

// R4 — Lista de vendas
async function r4(c: Contexto): Promise<Resultado> {
  const { operador_id: op, forma, situacao, cliente_id: cli } = c.f;
  const r = await linhas<Record<string, unknown>>(sql`
    SELECT v.id, v.numero, v.finalizada_em AS data_hora, u.nome AS operador, cl.nome AS cliente,
           (SELECT string_agg(DISTINCT p.forma, ',') FROM vendas_pagamentos p WHERE p.venda_id = v.id) AS formas,
           v.desconto_itens + v.desconto_venda AS desconto, v.total, v.situacao
      FROM vendas v JOIN usuarios u ON u.id = v.operador_id LEFT JOIN clientes cl ON cl.id = v.cliente_id
     WHERE v.finalizada_em >= ${ini(c)} AND v.finalizada_em < ${fim(c)}
       ${opcional(op, sql`AND v.operador_id = ${op}`)} ${opcional(situacao, sql`AND v.situacao = ${situacao}`)}
       ${opcional(cli, sql`AND v.cliente_id = ${cli}`)}
       ${opcional(forma, sql`AND EXISTS (SELECT 1 FROM vendas_pagamentos p WHERE p.venda_id = v.id AND p.forma = ${forma})`)}
     ORDER BY v.numero`);
  const ls = r.map((x): Record<string, any> => ({
    ...x,
    desconto: n(x.desconto),
    formas: String(x.formas ?? '').split(',').filter(Boolean).map((f) => NOMES_FORMAS[f as keyof typeof NOMES_FORMAS]).join(' + '),
  }));
  const fin = ls.filter((l) => l.situacao === 'finalizada');
  return {
    colunas: [
      col('numero', 'Nº', 'inteiro'), col('data_hora', 'Data/hora', 'data_hora'), col('operador', 'Operador'), col('cliente', 'Cliente'), col('formas', 'Formas'),
      col('desconto', 'Desconto', 'moeda'), col('total', 'Total', 'moeda'), col('situacao', 'Situação'),
    ],
    linhas: ls,
    totais: { quantidade: ls.length, quantidade_finalizadas: fin.length, total: fin.reduce((s, l) => s + n(l.total), 0), desconto: fin.reduce((s, l) => s + n(l.desconto), 0) },
  };
}

/** Base comum de R5 e R6: faturamento líquido, custo e devoluções por produto. */
async function produtosVendidos(c: Contexto) {
  const { categoria_id: cat, operador_id: op } = c.f;
  return linhas<Record<string, number | string | boolean>>(sql`
    WITH vend AS (
      SELECT i.produto_id, sum(i.quantidade) AS qtd, sum(i.total_liquido) AS liquido, sum(round(i.quantidade * i.custo_unitario)) AS custo,
             bool_or(i.custo_unitario = 0) AS sem_custo
        FROM vendas_itens i JOIN vendas v ON v.id = i.venda_id
       WHERE v.situacao = 'finalizada' AND v.finalizada_em >= ${ini(c)} AND v.finalizada_em < ${fim(c)} ${opcional(op, sql`AND v.operador_id = ${op}`)}
       GROUP BY i.produto_id),
    dev AS (
      SELECT di.produto_id, sum(di.quantidade) AS qtd, sum(di.valor) AS valor, sum(round(di.quantidade * vi.custo_unitario)) AS custo
        FROM devolucoes_itens di JOIN devolucoes d ON d.id = di.devolucao_id JOIN vendas_itens vi ON vi.id = di.venda_item_id JOIN vendas v ON v.id = d.venda_id
       WHERE d.criado_em >= ${ini(c)} AND d.criado_em < ${fim(c)} ${opcional(op, sql`AND v.operador_id = ${op}`)}
       GROUP BY di.produto_id)
    SELECT p.id AS produto_id, p.codigo, p.nome AS produto, coalesce(cat.nome, 'Sem categoria') AS categoria, p.unidade,
           coalesce(vend.qtd, 0) AS qtd_vendida, coalesce(dev.qtd, 0) AS qtd_devolvida,
           coalesce(vend.liquido, 0) - coalesce(dev.valor, 0) AS faturamento,
           coalesce(vend.custo, 0) - coalesce(dev.custo, 0) AS custo, coalesce(vend.sem_custo, false) AS sem_custo
      FROM produtos p LEFT JOIN categorias cat ON cat.id = p.categoria_id
      LEFT JOIN vend ON vend.produto_id = p.id LEFT JOIN dev ON dev.produto_id = p.id
     WHERE (vend.produto_id IS NOT NULL OR dev.produto_id IS NOT NULL)
       ${cat === 'sem' ? sql`AND p.categoria_id IS NULL` : opcional(cat, sql`AND p.categoria_id = ${cat ?? null}`)}
     ORDER BY faturamento DESC, p.nome`);
}

// R5 — Produtos vendidos
async function r5(c: Contexto): Promise<Resultado> {
  const ls = (await produtosVendidos(c)).map((x) => {
    const faturamento = n(x.faturamento);
    const custo = n(x.custo);
    const lucro = faturamento - custo;
    return {
      produto_id: x.produto_id, codigo: x.codigo, produto: x.produto, categoria: x.categoria, unidade: x.unidade,
      quantidade_vendida: n(x.qtd_vendida), quantidade_devolvida: n(x.qtd_devolvida), faturamento_liquido: faturamento, custo, lucro_bruto: lucro,
      margem: x.sem_custo || faturamento === 0 ? null : pct(lucro, faturamento), sem_custo: !!x.sem_custo,
    };
  });
  const fat = ls.reduce((s, l) => s + l.faturamento_liquido, 0);
  const custo = ls.reduce((s, l) => s + l.custo, 0);
  return {
    colunas: [
      col('codigo', 'Código'), col('produto', 'Produto'), col('categoria', 'Categoria'), col('quantidade_vendida', 'Qtd vendida', 'quantidade'),
      col('quantidade_devolvida', 'Qtd devolvida', 'quantidade'), col('faturamento_liquido', 'Faturamento líquido', 'moeda'), col('custo', 'Custo', 'moeda'),
      col('lucro_bruto', 'Lucro bruto', 'moeda'), col('margem', 'Margem %', 'percentual'),
    ],
    linhas: ls,
    totais: {
      quantidade_vendida: ls.reduce((s, l) => s + l.quantidade_vendida, 0), quantidade_devolvida: ls.reduce((s, l) => s + l.quantidade_devolvida, 0),
      faturamento_liquido: fat, custo, lucro_bruto: fat - custo, margem: fat === 0 ? null : pct(fat - custo, fat),
    },
  };
}

// R6 — Curva ABC
async function r6(c: Contexto): Promise<Resultado> {
  const base = (await produtosVendidos(c)).filter((x) => n(x.faturamento) > 0);
  const total = base.reduce((s, x) => s + n(x.faturamento), 0);
  let acumulado = 0;
  const ls = base.map((x, i) => {
    const anterior = total === 0 ? 0 : (acumulado / total) * 100;
    acumulado += n(x.faturamento);
    return {
      posicao: i + 1, produto_id: x.produto_id, codigo: x.codigo, produto: x.produto, faturamento: n(x.faturamento),
      percentual: pct(n(x.faturamento), total), percentual_acumulado: pct(acumulado, total),
      classe: anterior < 80 ? 'A' : anterior < 95 ? 'B' : 'C',
    };
  });
  return {
    colunas: [
      col('posicao', 'Posição', 'inteiro'), col('produto', 'Produto'), col('faturamento', 'Faturamento', 'moeda'), col('percentual', '% do total', 'percentual'),
      col('percentual_acumulado', '% acumulado', 'percentual'), col('classe', 'Classe'),
    ],
    linhas: ls,
    totais: { faturamento: total, produtos_a: ls.filter((l) => l.classe === 'A').length, produtos_b: ls.filter((l) => l.classe === 'B').length, produtos_c: ls.filter((l) => l.classe === 'C').length },
  };
}

// R7 — Posição de estoque
async function r7(c: Contexto): Promise<Resultado> {
  const r = await posicaoEstoque({
    categoria_id: c.f.categoria_id,
    somente_baixo: c.f.somente_baixo === 'true',
    somente_com_saldo: c.f.somente_com_saldo === 'true',
  });
  return {
    colunas: [
      col('codigo', 'Código'), col('nome', 'Produto'), col('unidade', 'Unidade'), col('estoque_atual', 'Estoque', 'quantidade'), col('estoque_minimo', 'Mínimo', 'quantidade'),
      col('preco_custo', 'Custo', 'moeda'), col('valor_custo', 'Valor de custo', 'moeda'), col('preco_venda', 'Preço de venda', 'moeda'), col('valor_venda', 'Valor de venda', 'moeda'),
    ],
    linhas: r.itens,
    totais: { itens: r.totais.itens, valor_custo: r.itens.reduce((s, i) => s + i.valor_custo, 0), valor_venda: r.itens.reduce((s, i) => s + i.valor_venda, 0) },
  };
}

const NOMES_MOVIMENTACAO: Record<string, string> = {
  estoque_inicial: 'Estoque inicial', entrada: 'Entrada', ajuste_mais: 'Ajuste (+)', ajuste_menos: 'Ajuste (−)', inventario: 'Inventário',
  venda: 'Venda', cancelamento_venda: 'Cancelamento de venda', devolucao: 'Devolução',
};

// R8 — Movimentações de estoque
async function r8(c: Contexto): Promise<Resultado> {
  const { produto_id: prod, tipo, usuario_id: usu } = c.f;
  const r = await linhas<Record<string, unknown>>(sql`
    SELECT m.data_hora, p.codigo, p.nome AS produto, m.tipo, m.quantidade, m.saldo_anterior, m.saldo_posterior, u.nome AS usuario, m.origem_tipo,
      CASE m.origem_tipo WHEN 'venda' THEN (SELECT 'Venda nº ' || numero FROM vendas WHERE id = m.origem_id)
        WHEN 'devolucao' THEN (SELECT 'Devolução nº ' || numero FROM devolucoes WHERE id = m.origem_id)
        WHEN 'entrada' THEN (SELECT 'Entrada nº ' || numero FROM entradas WHERE id = m.origem_id)
        WHEN 'inventario' THEN (SELECT 'Inventário nº ' || numero FROM inventarios WHERE id = m.origem_id)
        WHEN 'ajuste' THEN 'Ajuste: ' || coalesce(m.motivo, '') ELSE 'Cadastro' END AS origem
      FROM movimentacoes_estoque m JOIN produtos p ON p.id = m.produto_id JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.data_hora >= ${ini(c)} AND m.data_hora < ${fim(c)}
       ${opcional(prod, sql`AND m.produto_id = ${prod}`)} ${opcional(tipo, sql`AND m.tipo = ${tipo}`)} ${opcional(usu, sql`AND m.usuario_id = ${usu}`)}
     ORDER BY m.sequencia`);
  const ls = r.map((x): Record<string, any> => ({
    ...x,
    tipo_nome: NOMES_MOVIMENTACAO[x.tipo as string],
    quantidade: quantidadeComSinal(x.tipo as string, n(x.quantidade)),
    saldo_anterior: n(x.saldo_anterior),
    saldo_posterior: n(x.saldo_posterior),
  }));
  const porTipo: Record<string, { entradas: number; saidas: number }> = {};
  for (const l of ls) {
    const t = (porTipo[l.tipo as string] ??= { entradas: 0, saidas: 0 });
    if (l.quantidade >= 0) t.entradas += l.quantidade;
    else t.saidas += -l.quantidade;
  }
  return {
    colunas: [
      col('data_hora', 'Data/hora', 'data_hora'), col('produto', 'Produto'), col('tipo_nome', 'Tipo'), col('quantidade', 'Quantidade', 'quantidade'),
      col('saldo_anterior', 'Saldo anterior', 'quantidade'), col('saldo_posterior', 'Saldo posterior', 'quantidade'), col('usuario', 'Usuário'), col('origem', 'Origem'),
    ],
    linhas: ls,
    totais: { por_tipo: porTipo, movimentacoes: ls.length },
  };
}

// R9 — Estoque baixo / sugestão de compra
async function r9(c: Contexto): Promise<Resultado> {
  const r = await estoqueBaixo({ fornecedor_id: c.f.fornecedor_id, categoria_id: c.f.categoria_id });
  return {
    colunas: [
      col('nome', 'Produto'), col('fornecedor_nome', 'Fornecedor'), col('estoque_atual', 'Estoque', 'quantidade'), col('estoque_minimo', 'Mínimo', 'quantidade'),
      col('sugestao_compra', 'Sugestão de compra', 'quantidade'), col('ultimo_custo', 'Último custo', 'moeda'), col('valor_estimado', 'Valor estimado', 'moeda'),
    ],
    linhas: r.itens,
    totais: r.totais,
  };
}

// R10 — Fechamentos de caixa
async function r10(c: Contexto): Promise<Resultado> {
  const op = c.f.operador_id;
  const r = await linhas<Record<string, any>>(sql`
    SELECT s.numero, u.nome AS operador, s.aberto_em, s.fechado_em, s.fundo_troco, s.resumo, s.valor_esperado, s.valor_contado, s.diferenca, s.fechamento_forcado
      FROM sessoes_caixa s JOIN usuarios u ON u.id = s.operador_id
     WHERE s.situacao = 'fechado' AND s.fechado_em >= ${ini(c)} AND s.fechado_em < ${fim(c)} ${opcional(op, sql`AND s.operador_id = ${op}`)}
     ORDER BY s.fechado_em`);
  const ls = r.map((x) => {
    const res = x.resumo ?? {};
    const vf = res.vendas_por_forma ?? {};
    return {
      numero: x.numero, operador: x.operador, abertura: x.aberto_em, fechamento: x.fechado_em, fundo_troco: x.fundo_troco,
      dinheiro: n(vf.dinheiro) - n(res.troco), debito: n(vf.debito), credito: n(vf.credito), pix: n(vf.pix), vale_troca: n(vf.vale_troca),
      suprimentos: n(res.suprimentos), sangrias: n(res.sangrias), estornos: n(res.estornos_dinheiro),
      esperado: n(x.valor_esperado), contado: n(x.valor_contado), diferenca: n(x.diferenca), forcado: !!x.fechamento_forcado,
    };
  });
  return {
    colunas: [
      col('numero', 'Nº do caixa', 'inteiro'), col('operador', 'Operador'), col('abertura', 'Abertura', 'data_hora'), col('fechamento', 'Fechamento', 'data_hora'),
      col('fundo_troco', 'Fundo', 'moeda'), col('dinheiro', 'Dinheiro (líq. troco)', 'moeda'), col('debito', 'Débito', 'moeda'), col('credito', 'Crédito', 'moeda'),
      col('pix', 'PIX', 'moeda'), col('vale_troca', 'Vale-troca', 'moeda'), col('suprimentos', 'Suprimentos', 'moeda'), col('sangrias', 'Sangrias', 'moeda'),
      col('estornos', 'Estornos', 'moeda'), col('esperado', 'Esperado', 'moeda'), col('contado', 'Contado', 'moeda'), col('diferenca', 'Diferença', 'moeda'),
      col('forcado', 'Forçado', 'booleano'),
    ],
    linhas: ls,
    totais: {
      sessoes: ls.length,
      sobras: ls.filter((l) => l.diferenca > 0).reduce((s, l) => s + l.diferenca, 0),
      faltas: ls.filter((l) => l.diferenca < 0).reduce((s, l) => s + l.diferenca, 0),
      diferenca: ls.reduce((s, l) => s + l.diferenca, 0),
    },
  };
}

// R11 — Movimentos de caixa
async function r11(c: Contexto): Promise<Resultado> {
  const { operador_id: op, tipo } = c.f;
  const r = await linhas<Record<string, any>>(sql`
    SELECT m.data_hora, s.numero AS sessao, u.nome AS operador, m.tipo, m.valor, m.motivo, a.nome AS autorizador
      FROM movimentos_caixa m JOIN sessoes_caixa s ON s.id = m.sessao_caixa_id JOIN usuarios u ON u.id = m.usuario_id LEFT JOIN usuarios a ON a.id = m.autorizador_id
     WHERE m.data_hora >= ${ini(c)} AND m.data_hora < ${fim(c)} ${opcional(op, sql`AND s.operador_id = ${op}`)} ${opcional(tipo, sql`AND m.tipo = ${tipo}`)}
     ORDER BY m.data_hora`);
  const nomes: Record<string, string> = { sangria: 'Sangria', suprimento: 'Suprimento', estorno_dinheiro: 'Estorno em dinheiro' };
  const ls = r.map((x): Record<string, any> => ({ ...x, tipo_nome: nomes[x.tipo] }));
  const porTipo = { sangria: 0, suprimento: 0, estorno_dinheiro: 0 } as Record<string, number>;
  for (const l of ls) porTipo[l.tipo] += l.valor;
  return {
    colunas: [
      col('data_hora', 'Data/hora', 'data_hora'), col('sessao', 'Caixa nº', 'inteiro'), col('operador', 'Operador'), col('tipo_nome', 'Tipo'), col('valor', 'Valor', 'moeda'),
      col('motivo', 'Motivo'), col('autorizador', 'Autorizador'),
    ],
    linhas: ls,
    totais: { por_tipo: porTipo },
  };
}

const NOMES_MOTIVO: Record<string, string> = { defeito: 'Defeito', arrependimento: 'Arrependimento', tamanho_modelo: 'Tamanho/modelo', outro: 'Outro' };

// R12 — Devoluções e vales-troca
async function r12(c: Contexto): Promise<Resultado> {
  const { destino, motivo } = c.f;
  const r = await linhas<Record<string, any>>(sql`
    SELECT d.numero, d.criado_em AS data, v.numero AS venda_origem, cl.nome AS cliente, d.valor, d.destino, d.forma_estorno, d.motivo, d.motivo_texto, u.nome AS usuario, vt.codigo AS vale_codigo
      FROM devolucoes d JOIN vendas v ON v.id = d.venda_id JOIN usuarios u ON u.id = d.usuario_id
      LEFT JOIN clientes cl ON cl.id = d.cliente_id LEFT JOIN vales_troca vt ON vt.id = d.vale_troca_id
     WHERE d.criado_em >= ${ini(c)} AND d.criado_em < ${fim(c)} ${opcional(destino, sql`AND d.destino = ${destino}`)} ${opcional(motivo, sql`AND d.motivo = ${motivo}`)}
     ORDER BY d.numero`);
  const ls = r.map((x): Record<string, any> => ({
    ...x,
    destino_nome: x.destino === 'vale_troca' ? 'Vale-troca' : 'Estorno',
    forma_estorno_nome: x.forma_estorno ? NOMES_FORMAS[x.forma_estorno as keyof typeof NOMES_FORMAS] : null,
    motivo_nome: x.motivo === 'outro' && x.motivo_texto ? `Outro: ${x.motivo_texto}` : NOMES_MOTIVO[x.motivo],
  }));
  const saldo = await linhas<{ s: number }>(sql`
    SELECT coalesce(sum(saldo), 0) AS s FROM vales_troca WHERE situacao = 'ativo' AND validade >= (now() AT TIME ZONE ${c.fuso})::date`);
  return {
    colunas: [
      col('numero', 'Nº', 'inteiro'), col('data', 'Data', 'data'), col('venda_origem', 'Venda de origem', 'inteiro'), col('cliente', 'Cliente'), col('valor', 'Valor', 'moeda'),
      col('destino_nome', 'Destino'), col('forma_estorno_nome', 'Forma do estorno'), col('motivo_nome', 'Motivo'), col('usuario', 'Usuário'),
    ],
    linhas: ls,
    totais: {
      vale_troca: ls.filter((l) => l.destino === 'vale_troca').reduce((s, l) => s + l.valor, 0),
      estorno: ls.filter((l) => l.destino === 'estorno').reduce((s, l) => s + l.valor, 0),
      saldo_vales_ativos: n(saldo[0].s),
    },
  };
}

// R13 — Descontos e cancelamentos
async function r13(c: Contexto): Promise<Resultado> {
  const op = c.f.operador_id;
  const r = await linhas<Record<string, any>>(sql`
    SELECT * FROM (
      SELECT va.data_hora, v.numero AS venda, u.nome AS operador, va.operador_id, 'desconto_acima_limite' AS tipo, v.desconto_itens + v.desconto_venda AS valor,
             z.nome AS autorizador, coalesce(va.motivo, 'Desconto de ' || va.percentual || '%') AS motivo
        FROM vendas_autorizacoes va JOIN vendas v ON v.id = va.venda_id JOIN usuarios u ON u.id = va.operador_id JOIN usuarios z ON z.id = va.autorizador_id
       WHERE va.tipo = 'desconto_acima_limite' AND v.situacao = 'finalizada' AND va.data_hora >= ${ini(c)} AND va.data_hora < ${fim(c)}
      UNION ALL
      SELECT a.criada_em, (SELECT v.numero FROM vendas_autorizacoes va JOIN vendas v ON v.id = va.venda_id WHERE va.autorizacao_id = a.id),
             u.nome, a.operador_id, 'remocao_item', nullif(coalesce((a.detalhes->>'total')::int, 0), 0), z.nome, a.motivo
        FROM autorizacoes a JOIN usuarios u ON u.id = a.operador_id JOIN usuarios z ON z.id = a.autorizador_id
       WHERE a.acao = 'remover_item' AND a.criada_em >= ${ini(c)} AND a.criada_em < ${fim(c)}
      UNION ALL
      SELECT v.cancelada_em, v.numero, u.nome, v.operador_id, 'cancelamento_venda', v.total, coalesce(z.nome, cp.nome), v.motivo_cancelamento
        FROM vendas v JOIN usuarios u ON u.id = v.operador_id LEFT JOIN usuarios z ON z.id = v.cancelamento_autorizado_por LEFT JOIN usuarios cp ON cp.id = v.cancelada_por
       WHERE v.situacao = 'cancelada' AND v.cancelada_em >= ${ini(c)} AND v.cancelada_em < ${fim(c)}
    ) x WHERE true ${opcional(op, sql`AND x.operador_id = ${op}`)}
    ORDER BY x.data_hora`);
  const nomes: Record<string, string> = {
    desconto_acima_limite: 'Desconto acima do limite',
    remocao_item: 'Remoção de item',
    cancelamento_venda: 'Cancelamento de venda',
  };
  const ls = r.map((x): Record<string, any> => ({ ...x, valor: x.valor === null ? null : n(x.valor), tipo_nome: nomes[x.tipo] }));
  const porTipo: Record<string, { quantidade: number; valor: number }> = {};
  for (const l of ls) {
    const t = (porTipo[l.tipo] ??= { quantidade: 0, valor: 0 });
    t.quantidade += 1;
    t.valor += l.valor ?? 0;
  }
  return {
    colunas: [
      col('data_hora', 'Data/hora', 'data_hora'), col('venda', 'Venda', 'inteiro'), col('operador', 'Operador'), col('tipo_nome', 'Tipo'), col('valor', 'Valor', 'moeda'),
      col('autorizador', 'Autorizador'), col('motivo', 'Motivo'),
    ],
    linhas: ls,
    totais: { por_tipo: porTipo },
  };
}

export interface DefinicaoRelatorio {
  codigo: string;
  slug: string;
  titulo: string;
  usaPeriodo: boolean;
  filtros: string[];
  gerar: (c: Contexto) => Promise<Resultado>;
}

export const RELATORIOS: DefinicaoRelatorio[] = [
  { codigo: 'R1', slug: 'vendas_por_periodo', titulo: 'Vendas por período', usaPeriodo: true, filtros: ['agrupar', 'operador_id'], gerar: r1 },
  { codigo: 'R2', slug: 'vendas_por_forma_pagamento', titulo: 'Vendas por forma de pagamento', usaPeriodo: true, filtros: ['operador_id'], gerar: r2 },
  { codigo: 'R3', slug: 'vendas_por_operador', titulo: 'Vendas por operador', usaPeriodo: true, filtros: [], gerar: r3 },
  { codigo: 'R4', slug: 'lista_de_vendas', titulo: 'Lista de vendas', usaPeriodo: true, filtros: ['operador_id', 'forma', 'situacao', 'cliente_id'], gerar: r4 },
  { codigo: 'R5', slug: 'produtos_vendidos', titulo: 'Produtos vendidos', usaPeriodo: true, filtros: ['categoria_id', 'operador_id'], gerar: r5 },
  { codigo: 'R6', slug: 'curva_abc', titulo: 'Curva ABC de produtos', usaPeriodo: true, filtros: ['categoria_id'], gerar: r6 },
  { codigo: 'R7', slug: 'posicao_de_estoque', titulo: 'Posição de estoque', usaPeriodo: false, filtros: ['categoria_id', 'somente_baixo', 'somente_com_saldo'], gerar: r7 },
  { codigo: 'R8', slug: 'movimentacoes_de_estoque', titulo: 'Movimentações de estoque', usaPeriodo: true, filtros: ['produto_id', 'tipo', 'usuario_id'], gerar: r8 },
  { codigo: 'R9', slug: 'estoque_baixo', titulo: 'Estoque baixo / sugestão de compra', usaPeriodo: false, filtros: ['fornecedor_id', 'categoria_id'], gerar: r9 },
  { codigo: 'R10', slug: 'fechamentos_de_caixa', titulo: 'Fechamentos de caixa', usaPeriodo: true, filtros: ['operador_id'], gerar: r10 },
  { codigo: 'R11', slug: 'movimentos_de_caixa', titulo: 'Movimentos de caixa', usaPeriodo: true, filtros: ['operador_id', 'tipo'], gerar: r11 },
  { codigo: 'R12', slug: 'devolucoes_e_vales', titulo: 'Devoluções e vales-troca', usaPeriodo: true, filtros: ['destino', 'motivo'], gerar: r12 },
  { codigo: 'R13', slug: 'descontos_e_cancelamentos', titulo: 'Descontos e cancelamentos', usaPeriodo: true, filtros: ['operador_id'], gerar: r13 },
];
