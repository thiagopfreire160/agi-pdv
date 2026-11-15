import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { conflito, erroValidacao, naoEncontrado, semPermissao, ErroApp } from '../../lib/erros.js';
import { formatarReais, FORMAS_PAGAMENTO } from '../../lib/dinheiro.js';
import { dataNoFuso, fusoDaLoja, hojeNoFuso } from '../../lib/datas.js';
import { ehSupervisor, type UsuarioLogado } from '../../lib/contexto.js';
import { obterConfiguracoes } from '../configuracoes/servico.js';

export interface ResumoSessao {
  fundo_troco: number;
  vendas_por_forma: Record<string, number>;
  dinheiro_recebido: number;
  troco: number;
  suprimentos: number;
  sangrias: number;
  estornos_dinheiro: number;
  quantidade_vendas: number;
  total_vendido: number;
  canceladas: { quantidade: number; valor: number };
  /** Dinheiro que deveria haver na gaveta (seção 5.9). */
  esperado_dinheiro: number;
}

/** Resumo da sessão de caixa. Vendas canceladas não entram nos totais. */
export async function resumoSessao(db: Tx, sessaoId: string): Promise<ResumoSessao> {
  const r = await sql<Record<string, number>>`
    SELECT s.fundo_troco,
      (SELECT coalesce(sum(p.valor), 0) FROM vendas_pagamentos p JOIN vendas v ON v.id = p.venda_id
        WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada' AND p.forma = 'dinheiro') AS dinheiro,
      (SELECT coalesce(sum(p.valor), 0) FROM vendas_pagamentos p JOIN vendas v ON v.id = p.venda_id
        WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada' AND p.forma = 'debito') AS debito,
      (SELECT coalesce(sum(p.valor), 0) FROM vendas_pagamentos p JOIN vendas v ON v.id = p.venda_id
        WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada' AND p.forma = 'credito') AS credito,
      (SELECT coalesce(sum(p.valor), 0) FROM vendas_pagamentos p JOIN vendas v ON v.id = p.venda_id
        WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada' AND p.forma = 'pix') AS pix,
      (SELECT coalesce(sum(p.valor), 0) FROM vendas_pagamentos p JOIN vendas v ON v.id = p.venda_id
        WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada' AND p.forma = 'vale_troca') AS vale_troca,
      (SELECT coalesce(sum(v.troco), 0) FROM vendas v WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada') AS troco,
      (SELECT count(*) FROM vendas v WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada') AS qtd,
      (SELECT coalesce(sum(v.total), 0) FROM vendas v WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada') AS total,
      (SELECT count(*) FROM vendas v WHERE v.sessao_caixa_id = s.id AND v.situacao = 'cancelada') AS qtd_canc,
      (SELECT coalesce(sum(v.total), 0) FROM vendas v WHERE v.sessao_caixa_id = s.id AND v.situacao = 'cancelada') AS valor_canc,
      (SELECT coalesce(sum(m.valor), 0) FROM movimentos_caixa m WHERE m.sessao_caixa_id = s.id AND m.tipo = 'suprimento') AS suprimentos,
      (SELECT coalesce(sum(m.valor), 0) FROM movimentos_caixa m WHERE m.sessao_caixa_id = s.id AND m.tipo = 'sangria') AS sangrias,
      (SELECT coalesce(sum(m.valor), 0) FROM movimentos_caixa m WHERE m.sessao_caixa_id = s.id AND m.tipo = 'estorno_dinheiro') AS estornos
    FROM sessoes_caixa s WHERE s.id = ${sessaoId}`.execute(db);
  const x = r.rows[0];
  if (!x) throw naoEncontrado('Caixa não encontrado.');
  const n = (k: string) => Number(x[k]);
  return {
    fundo_troco: n('fundo_troco'),
    vendas_por_forma: Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f, n(f)])),
    dinheiro_recebido: n('dinheiro'),
    troco: n('troco'),
    suprimentos: n('suprimentos'),
    sangrias: n('sangrias'),
    estornos_dinheiro: n('estornos'),
    quantidade_vendas: n('qtd'),
    total_vendido: n('total'),
    canceladas: { quantidade: n('qtd_canc'), valor: n('valor_canc') },
    esperado_dinheiro: n('fundo_troco') + n('dinheiro') - n('troco') + n('suprimentos') - n('sangrias') - n('estornos'),
  };
}

export async function estaVencido(db: Tx, abertoEm: Date) {
  const fuso = await fusoDaLoja(db);
  return dataNoFuso(abertoEm, fuso) < hojeNoFuso(fuso);
}

export async function caixaAbertoDoOperador(db: Tx, operadorId: string, bloquear = false): Promise<Record<string, any> | null> {
  let q = db.selectFrom('sessoes_caixa').selectAll().where('operador_id', '=', operadorId).where('situacao', '=', 'aberto');
  if (bloquear) q = q.forUpdate();
  const s = (await q.executeTakeFirst()) as Record<string, any> | undefined;
  if (!s) return null;
  return { ...s, vencido: await estaVencido(db, s.aberto_em) };
}

/** Sessão aberta e do dia, exigida para vender, sangria/suprimento e estorno em dinheiro. */
export async function exigirCaixaOperante(db: Tx, operadorId: string): Promise<Record<string, any>> {
  const s = await caixaAbertoDoOperador(db, operadorId, true);
  if (!s) throw new ErroApp(409, 'Caixa fechado. Abra o caixa para começar a vender.', { codigo: 'CAIXA_FECHADO' });
  if (s.vencido) {
    throw new ErroApp(409, 'Este caixa foi aberto em um dia anterior. Feche o caixa do dia anterior antes de abrir o de hoje.', {
      codigo: 'CAIXA_VENCIDO',
      sessao_caixa_id: s.id,
    });
  }
  return s;
}

export async function abrirCaixa(ator: Ator, d: { fundo_troco: number; terminal?: string | null }) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const existente = await caixaAbertoDoOperador(tx, ator.usuarioId!);
      if (existente) {
        throw conflito(
          existente.vencido
            ? 'Você tem um caixa aberto em um dia anterior. Feche-o antes de abrir o de hoje.'
            : `Você já tem o caixa nº ${existente.numero} aberto. Continue nele ou feche-o antes de abrir outro.`,
          { codigo: existente.vencido ? 'CAIXA_VENCIDO' : 'CAIXA_JA_ABERTO', sessao_caixa_id: existente.id },
        );
      }
      const s = await tx
        .insertInto('sessoes_caixa')
        .values({ operador_id: ator.usuarioId, terminal: d.terminal ?? null, fundo_troco: d.fundo_troco, criado_por: ator.usuarioId, atualizado_por: ator.usuarioId })
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'sessao_caixa', entidadeId: s.id, acao: 'abrir', depois: { numero: s.numero, fundo_troco: s.fundo_troco, terminal: s.terminal }, soDiferencas: false });
      return s.id as string;
    });
}

export async function listarMovimentos(db: Tx, sessaoId: string) {
  return db
    .selectFrom('movimentos_caixa as m')
    .innerJoin('usuarios as u', 'u.id', 'm.usuario_id')
    .leftJoin('usuarios as a', 'a.id', 'm.autorizador_id')
    .leftJoin('devolucoes as d', 'd.id', 'm.devolucao_id')
    .select(['m.id', 'm.tipo', 'm.valor', 'm.motivo', 'm.data_hora', 'm.usuario_id', 'u.nome as usuario_nome', 'm.autorizador_id', 'a.nome as autorizador_nome', 'm.devolucao_id', 'd.numero as devolucao_numero'])
    .where('m.sessao_caixa_id', '=', sessaoId)
    .orderBy('m.data_hora')
    .execute();
}

/**
 * Dados da sessão. O esperado em dinheiro só é revelado a gerente/administrador
 * (o operador faz a contagem cega no fechamento).
 */
export async function detalharSessao(db: Tx, sessaoId: string, quem: UsuarioLogado) {
  const s = await db
    .selectFrom('sessoes_caixa as s')
    .innerJoin('usuarios as u', 'u.id', 's.operador_id')
    .leftJoin('usuarios as f', 'f.id', 's.fechado_por')
    .selectAll('s')
    .select(['u.nome as operador_nome', 'f.nome as fechado_por_nome'])
    .where('s.id', '=', sessaoId)
    .executeTakeFirst();
  if (!s) throw naoEncontrado('Caixa não encontrado.');
  if (!ehSupervisor(quem.perfil) && s.operador_id !== quem.id) throw semPermissao('Você só pode ver o seu próprio caixa.');
  const cfg = await obterConfiguracoes(db);
  const fechado = s.situacao === 'fechado';
  const resumo: Partial<ResumoSessao> = fechado && s.resumo ? (s.resumo as ResumoSessao) : await resumoSessao(db, s.id);
  const revelar = fechado || ehSupervisor(quem.perfil);
  const esperado = resumo.esperado_dinheiro!;
  const alerta = cfg.alerta_sangria_valor > 0 && esperado > cfg.alerta_sangria_valor;
  if (!revelar) {
    // Contagem cega: nada que permita deduzir o esperado em dinheiro antes da conferência.
    delete resumo.esperado_dinheiro;
    delete resumo.dinheiro_recebido;
    delete resumo.troco;
    resumo.vendas_por_forma = { ...resumo.vendas_por_forma };
    delete resumo.vendas_por_forma.dinheiro;
  }
  const { resumo: _r, valor_esperado, ...sessao } = s;
  return {
    ...sessao,
    valor_esperado: fechado ? valor_esperado : undefined,
    vencido: !fechado && (await estaVencido(db, s.aberto_em)),
    resumo,
    alerta_sangria: !fechado && alerta,
    movimentos: await listarMovimentos(db, s.id),
  };
}

export async function registrarMovimento(ator: Ator, d: { tipo: 'sangria' | 'suprimento'; valor: number; motivo?: string | null }) {
  if (d.tipo === 'sangria' && (!d.motivo || d.motivo.trim().length < 3)) {
    throw erroValidacao('Informe o motivo da sangria (ex.: "depósito no cofre").', { motivo: 'Obrigatório na sangria.' });
  }
  return banco()
    .transaction()
    .execute(async (tx) => {
      const s = await exigirCaixaOperante(tx, ator.usuarioId!);
      if (d.tipo === 'sangria') {
        const r = await resumoSessao(tx, s.id);
        if (d.valor > r.esperado_dinheiro) {
          throw erroValidacao(`A sangria de ${formatarReais(d.valor)} é maior que o dinheiro disponível no caixa. Confira o valor.`, {
            valor: 'Maior que o dinheiro em caixa.',
          });
        }
      }
      const m = await tx
        .insertInto('movimentos_caixa')
        .values({ sessao_caixa_id: s.id, tipo: d.tipo, valor: d.valor, motivo: d.motivo ?? null, usuario_id: ator.usuarioId })
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'sessao_caixa', entidadeId: s.id, acao: d.tipo, depois: { valor: d.valor, motivo: d.motivo ?? null }, soDiferencas: false });
      return { ...m, sessao_numero: s.numero };
    });
}

/** Conferência (sem fechar): recebe o contado e só então devolve esperado e diferença. */
export async function conferir(sessaoId: string, valorContado: number) {
  const r = await resumoSessao(banco(), sessaoId);
  return { resumo: r, valor_contado: valorContado, valor_esperado: r.esperado_dinheiro, diferenca: valorContado - r.esperado_dinheiro };
}

export async function fecharSessao(
  ator: Ator,
  sessaoId: string,
  d: { valor_contado: number; observacao?: string | null },
  forcado: boolean,
) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const s = await tx.selectFrom('sessoes_caixa').selectAll().where('id', '=', sessaoId).forUpdate().executeTakeFirst();
      if (!s) throw naoEncontrado('Caixa não encontrado.');
      if (s.situacao !== 'aberto') throw conflito('Este caixa já está fechado e não pode ser reaberto nem alterado.');
      const resumo = await resumoSessao(tx, s.id);
      const diferenca = d.valor_contado - resumo.esperado_dinheiro;
      if (diferenca !== 0 && (!d.observacao || d.observacao.trim().length < 3)) {
        throw erroValidacao(
          `Há ${diferenca > 0 ? 'sobra' : 'falta'} de ${formatarReais(Math.abs(diferenca))} no caixa. Escreva uma observação explicando a diferença.`,
          { observacao: 'Obrigatória quando há diferença.' },
          { codigo: 'OBSERVACAO_OBRIGATORIA', diferenca, valor_esperado: resumo.esperado_dinheiro },
        );
      }
      await tx
        .updateTable('sessoes_caixa')
        .set({
          situacao: 'fechado',
          fechado_em: sql`now()`,
          fechado_por: ator.usuarioId,
          valor_esperado: resumo.esperado_dinheiro,
          valor_contado: d.valor_contado,
          diferenca,
          resumo: JSON.stringify(resumo),
          observacao_fechamento: d.observacao ?? null,
          fechamento_forcado: forcado,
          atualizado_em: sql`now()`,
          atualizado_por: ator.usuarioId,
        })
        .where('id', '=', s.id)
        .execute();
      await auditar(tx, ator, {
        entidade: 'sessao_caixa',
        entidadeId: s.id,
        acao: forcado ? 'fechar_forcado' : 'fechar',
        depois: { numero: s.numero, esperado: resumo.esperado_dinheiro, contado: d.valor_contado, diferenca, observacao: d.observacao ?? null },
        soDiferencas: false,
      });
    });
}

export async function listarSessoes(f: { situacao?: string; operador_id?: string; inicio?: string | null; fim?: string | null; pagina: number; por_pagina: number }) {
  const db = banco();
  const fuso = await fusoDaLoja(db);
  let q = db.selectFrom('sessoes_caixa as s').innerJoin('usuarios as u', 'u.id', 's.operador_id');
  if (f.situacao) q = q.where('s.situacao', '=', f.situacao);
  if (f.operador_id) q = q.where('s.operador_id', '=', f.operador_id);
  if (f.inicio) q = q.where('s.aberto_em', '>=', sql<Date>`(${f.inicio}::date::timestamp AT TIME ZONE ${fuso})`);
  if (f.fim) q = q.where('s.aberto_em', '<', sql<Date>`((${f.fim}::date + 1)::timestamp AT TIME ZONE ${fuso})`);
  const total = await q.select(sql<number>`count(*)`.as('n')).executeTakeFirstOrThrow();
  const linhas = await q
    .select([
      's.id', 's.numero', 's.operador_id', 'u.nome as operador_nome', 's.terminal', 's.aberto_em', 's.fundo_troco', 's.situacao',
      's.fechado_em', 's.valor_esperado', 's.valor_contado', 's.diferenca', 's.fechamento_forcado',
    ])
    .select(sql<number>`(SELECT coalesce(sum(v.total), 0) FROM vendas v WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada')`.as('total_vendido'))
    .select(sql<number>`(SELECT count(*) FROM vendas v WHERE v.sessao_caixa_id = s.id AND v.situacao = 'finalizada')::int`.as('quantidade_vendas'))
    .orderBy('s.numero', 'desc')
    .limit(f.por_pagina)
    .offset((f.pagina - 1) * f.por_pagina)
    .execute();
  const hoje = hojeNoFuso(fuso);
  const itens = linhas.map((s) => ({
    ...s,
    vencido: s.situacao === 'aberto' && dataNoFuso(s.aberto_em, fuso) < hoje,
    minutos_aberto: s.situacao === 'aberto' ? Math.floor((Date.now() - s.aberto_em.getTime()) / 60000) : null,
  }));
  return { itens, total: Number(total.n), pagina: f.pagina, por_pagina: f.por_pagina };
}
