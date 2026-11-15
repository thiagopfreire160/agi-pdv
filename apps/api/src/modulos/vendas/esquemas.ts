import { z, uuid, uuidOpc, documentoOpc, textoOpc, quantidade, centavos, centavosPositivo, paginacao, dataIsoOpc } from '../../lib/esquemas.js';

export const esquemaFinalizarVenda = z.object({
  /** Identificador gerado no terminal (UUID) — garante que reenvios não dupliquem a venda. */
  id: uuid,
  terminal: textoOpc(30),
  cliente_id: uuidOpc,
  documento_recibo: documentoOpc,
  itens: z
    .array(
      z.object({
        produto_id: uuid,
        quantidade,
        /** Preço que o terminal exibiu; se diferente do atual, a venda é recusada (PRECOS_ALTERADOS). */
        preco_unitario: centavosPositivo,
        desconto: centavos.default(0),
      }),
      { error: 'Informe os itens da venda.' },
    )
    .min(1, 'A venda precisa de pelo menos um item.'),
  desconto_venda: centavos.default(0),
  pagamentos: z
    .array(
      z.object({
        forma: z.enum(['dinheiro', 'debito', 'credito', 'pix', 'vale_troca'], { error: 'Forma de pagamento inválida.' }),
        valor: centavosPositivo,
        parcelas: z.number().int().optional(),
        codigo_vale: z.string().trim().toUpperCase().optional(),
        observacao: textoOpc(60),
      }),
      { error: 'Informe os pagamentos.' },
    )
    .min(1, 'Adicione pelo menos um pagamento.'),
  /** Tokens obtidos em POST /api/autorizacoes (desconto acima do limite, remoção de item). */
  autorizacoes: z.array(z.string()).default([]),
});

export const esquemaListarVendas = z.object({
  inicio: dataIsoOpc,
  fim: dataIsoOpc,
  operador_id: z.string().uuid().optional(),
  forma: z.enum(['dinheiro', 'debito', 'credito', 'pix', 'vale_troca']).optional(),
  situacao: z.enum(['finalizada', 'cancelada']).optional(),
  cliente_id: z.string().uuid().optional(),
  numero: z.coerce.number().int().optional(),
  ...paginacao,
});

export const esquemaCancelarVenda = z.object({
  motivo: z.string({ error: 'Informe o motivo do cancelamento.' }).trim().min(3, 'Informe o motivo (mínimo 3 caracteres).').max(200),
  token_autorizacao: z.string().optional(),
});

export const esquemaDescarte = z.object({
  itens: z.array(z.object({ produto_id: z.string().optional(), descricao: z.string(), quantidade, total: z.number().int() })).default([]),
  total: z.number().int().default(0),
  motivo: z.string().trim().max(200).nullable().optional(),
  token_autorizacao: z.string().optional(),
});
