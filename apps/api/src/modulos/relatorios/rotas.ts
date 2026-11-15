import type { FastifyInstance } from 'fastify';
import { SUPERVISORES } from '../../lib/contexto.js';
import { banco } from '../../db/conexao.js';
import { naoEncontrado, erroValidacao } from '../../lib/erros.js';
import { fusoDaLoja, resolverPeriodo, formatarDataBr, formatarDataHoraBr } from '../../lib/datas.js';
import { gerarCsv, moedaCsv, numeroCsv, type ValorCsv } from '../../lib/csv.js';
import { RELATORIOS, type Coluna, type Filtros } from './definicoes.js';

function valorCsv(c: Coluna, v: unknown, fuso: string): ValorCsv {
  if (v === null || v === undefined || v === '') return '';
  switch (c.tipo) {
    case 'moeda':
      return moedaCsv(Number(v));
    case 'quantidade':
      return numeroCsv(Number(v));
    case 'percentual':
      return numeroCsv(Number(v), 2);
    case 'data':
      return formatarDataBr(v instanceof Date ? v : String(v), fuso);
    case 'data_hora':
      return formatarDataHoraBr(v instanceof Date ? v : new Date(String(v)), fuso);
    case 'booleano':
      return v ? 'Sim' : 'Não';
    default:
      return v as ValorCsv;
  }
}

const UUID = /^[0-9a-f-]{36}$/i;
const FILTROS_UUID = ['operador_id', 'cliente_id', 'produto_id', 'usuario_id', 'fornecedor_id'];

export default async function rotas(app: FastifyInstance) {
  app.get('/relatorios', { config: { perfis: SUPERVISORES } }, async () => ({
    itens: RELATORIOS.map((r) => ({ codigo: r.codigo, slug: r.slug, titulo: r.titulo, usa_periodo: r.usaPeriodo, filtros: r.filtros })),
  }));

  app.get<{ Params: { codigo: string }; Querystring: Record<string, string> }>(
    '/relatorios/:codigo',
    { config: { perfis: SUPERVISORES } },
    async (req, reply) => {
      const def = RELATORIOS.find((r) => r.codigo.toLowerCase() === req.params.codigo.toLowerCase() || r.slug === req.params.codigo);
      if (!def) throw naoEncontrado('Relatório não encontrado. Use um código de R1 a R13.');
      const q = req.query;
      const fuso = await fusoDaLoja(banco());
      const periodo = resolverPeriodo(fuso, q.inicio || undefined, q.fim || undefined);
      const f: Filtros = {};
      for (const nome of def.filtros) {
        const v = q[nome];
        if (v === undefined || v === '') continue;
        if (FILTROS_UUID.includes(nome) && !UUID.test(v)) throw erroValidacao(`Filtro "${nome}" inválido.`, { [nome]: 'Identificador inválido.' });
        f[nome] = v;
      }
      if (f.agrupar && !['dia', 'semana', 'mes'].includes(f.agrupar)) throw erroValidacao('Agrupe por dia, semana ou mes.', { agrupar: 'Valor inválido.' });
      const resultado = await def.gerar({ periodo, fuso, f });
      if (q.formato === 'csv') {
        const csv = gerarCsv(
          resultado.colunas.map((c) => c.titulo),
          resultado.linhas.map((l) => resultado.colunas.map((c) => valorCsv(c, l[c.chave], fuso))),
        );
        const nome = `${def.slug}_${periodo.inicio}_a_${periodo.fim}.csv`;
        return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${nome}"`).send(csv);
      }
      return { codigo: def.codigo, titulo: def.titulo, periodo: def.usaPeriodo ? periodo : null, filtros: f, ...resultado };
    },
  );
}
