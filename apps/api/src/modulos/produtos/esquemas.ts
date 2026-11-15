import { z, textoObrig, textoOpc, uuidOpc, quantidade, versao, situacaoFiltro, paginacao, booleanoQuery } from '../../lib/esquemas.js';
import { UNIDADES } from '../../lib/dinheiro.js';

const codigoBarras = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
  z
    .string()
    .regex(/^\d+$/, 'O código de barras deve ter só números.')
    .refine((c) => [8, 12, 13, 14].includes(c.length), 'Use 8, 12, 13 ou 14 dígitos.')
    .nullable()
    .optional(),
);

const precoVenda = z.number({ error: 'Informe o preço de venda em centavos.' }).int('Use centavos (inteiro).').min(1, 'Informe um preço de venda acima de R$ 0,00.');
const precoCusto = z.number().int('Use centavos (inteiro).').min(0, 'O custo não pode ser negativo.');

const base = {
  codigo: z.preprocess((v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v), z.string().max(20, 'Use no máximo 20 caracteres.').nullable().optional()),
  codigo_barras: codigoBarras,
  nome: textoObrig(80, 2),
  categoria_id: uuidOpc,
  unidade: z.enum(UNIDADES, { error: 'Unidade inválida. Use UN, KG, G, L, ML, M, CX ou PCT.' }).default('UN'),
  preco_venda: precoVenda,
  preco_custo: precoCusto.default(0),
  estoque_minimo: quantidade.optional(),
  controla_estoque: z.boolean().default(true),
  fornecedor_id: uuidOpc,
  observacoes: textoOpc(500),
  /** Confirma salvar código de barras com dígito verificador inválido. */
  confirmar_codigo_barras_invalido: z.boolean().optional(),
};

export const esquemaCriarProduto = z.object({ ...base, estoque_inicial: quantidade.optional() });

export const esquemaEditarProduto = z.object({
  versao,
  codigo: base.codigo,
  codigo_barras: base.codigo_barras,
  nome: base.nome.optional(),
  categoria_id: base.categoria_id,
  unidade: z.enum(UNIDADES).optional(),
  preco_venda: precoVenda.optional(),
  preco_custo: precoCusto.optional(),
  estoque_minimo: quantidade.optional(),
  controla_estoque: z.boolean().optional(),
  fornecedor_id: base.fornecedor_id,
  observacoes: base.observacoes,
  confirmar_codigo_barras_invalido: z.boolean().optional(),
});

export const esquemaListarProdutos = z.object({
  busca: z.string().optional(),
  categoria_id: z.string().optional(),
  situacao: situacaoFiltro,
  estoque_baixo: booleanoQuery.optional(),
  ordenar: z.enum(['nome', 'estoque', 'preco', 'codigo']).default('nome'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  ...paginacao,
});
