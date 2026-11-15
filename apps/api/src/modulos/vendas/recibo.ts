import { banco } from '../../db/conexao.js';
import { auditar } from '../../lib/auditoria.js';
import type { UsuarioLogado } from '../../lib/contexto.js';
import { obterConfiguracoes } from '../configuracoes/servico.js';
import { nomeCurto } from '../usuarios/formato.js';
import { obterVenda } from './servico.js';

/** Cabeçalho do recibo: sempre os dados atuais da empresa (decisão 13). */
export async function cabecalhoRecibo() {
  const e = await banco()
    .selectFrom('empresa')
    .select(['nome_fantasia', 'razao_social', 'cnpj', 'telefone', 'whatsapp', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'cep', 'mensagem_rodape', 'logo_tipo', 'fuso_horario'])
    .executeTakeFirst();
  const cfg = await obterConfiguracoes();
  const { logo_tipo, ...empresa } = e ?? ({} as Record<string, unknown>);
  return {
    empresa: { ...empresa, tem_logo: !!logo_tipo, logo_url: logo_tipo ? '/api/empresa/logo' : null },
    configuracao: {
      papel_recibo: cfg.papel_recibo,
      mostrar_logo_recibo: cfg.mostrar_logo_recibo,
      imprimir_automaticamente: cfg.imprimir_automaticamente,
      vias_recibo: cfg.vias_recibo,
    },
    aviso_nao_fiscal: 'NÃO É DOCUMENTO FISCAL',
  };
}

/** Dados para montar o recibo de uma venda (ou de uma venda de exemplo). */
export async function dadosRecibo(
  venda: { id: string; quem: UsuarioLogado; segundaVia: boolean; ip: string } | null,
  opcoes: { exemplo?: boolean } = {},
) {
  const cab = await cabecalhoRecibo();
  if (!venda || opcoes.exemplo) {
    return {
      ...cab,
      exemplo: true,
      segunda_via: false,
      cancelada: false,
      venda: {
        numero: 123,
        finalizada_em: new Date().toISOString(),
        operador_nome_curto: 'Maria S.',
        terminal: 'Caixa 1',
        cliente_nome: null,
        documento_recibo: null,
        codigo_barras_venda: '123',
        itens: [
          { descricao: 'Arroz Tipo 1 5kg', unidade: 'UN', quantidade: 2, preco_unitario: 2490, total_bruto: 4980, desconto: 0, total_liquido: 4980 },
          { descricao: 'Queijo Mussarela', unidade: 'KG', quantidade: 0.35, preco_unitario: 4990, total_bruto: 1747, desconto: 147, total_liquido: 1600 },
        ],
        soma_bruto: 6727,
        desconto_itens: 147,
        subtotal: 6580,
        desconto_venda: 80,
        desconto_total: 227,
        total: 6500,
        pagamentos: [
          { forma: 'debito', valor: 3000, parcelas: 1 },
          { forma: 'dinheiro', valor: 4000, parcelas: 1 },
        ],
        troco: 500,
      },
    };
  }
  const v = await obterVenda(venda.id, venda.quem);
  if (venda.segundaVia) {
    await auditar(banco(), { usuarioId: venda.quem.id, ip: venda.ip }, { entidade: 'venda', entidadeId: v.id, acao: 'reimprimir', depois: { numero: v.numero }, soDiferencas: false });
  }
  return {
    ...cab,
    exemplo: false,
    segunda_via: venda.segundaVia,
    cancelada: v.situacao === 'cancelada',
    venda: {
      ...v,
      operador_nome_curto: nomeCurto(v.operador_nome),
      codigo_barras_venda: String(v.numero),
      itens: (v.itens as Record<string, any>[]).map((i) => {
        const { custo_unitario: _c, ...resto } = i as typeof i & { custo_unitario?: number };
        return resto;
      }),
    },
  };
}
