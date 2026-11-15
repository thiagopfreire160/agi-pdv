/**
 * Cálculos monetários da frente de caixa. Tudo em centavos inteiros;
 * quantidades em milésimos inteiros (1,535 kg = 1535).
 */
import { erroValidacao } from './erros.js';

export const UNIDADES = ['UN', 'KG', 'G', 'L', 'ML', 'M', 'CX', 'PCT'] as const;
export type Unidade = (typeof UNIDADES)[number];
export const UNIDADES_FRACIONAVEIS: Unidade[] = ['KG', 'L', 'M'];
export const fracionavel = (u: string) => UNIDADES_FRACIONAVEIS.includes(u as Unidade);

/** Converte quantidade (número ou texto com vírgula/ponto) para milésimos inteiros. */
export function paraMilesimos(valor: number | string): number | null {
  const texto = String(valor).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(texto)) return null;
  const [inteira, decimal = ''] = texto.split('.');
  if (decimal.length > 3) return null;
  return Number(inteira) * 1000 + Number(decimal.padEnd(3, '0'));
}

export const deMilesimos = (m: number) => m / 1000;

/** Valida quantidade conforme a unidade e devolve milésimos. */
export function quantidadeValida(valor: number | string, unidade: string, campo = 'quantidade', permitirZero = false): number {
  const m = paraMilesimos(valor);
  if (m === null) {
    throw erroValidacao('Quantidade inválida. Use até 3 casas decimais.', { [campo]: 'Use até 3 casas decimais.' });
  }
  if (!permitirZero && m <= 0) throw erroValidacao('A quantidade deve ser maior que zero.', { [campo]: 'Informe uma quantidade maior que zero.' });
  if (!fracionavel(unidade) && m % 1000 !== 0) {
    throw erroValidacao(`A unidade ${unidade} não aceita quantidade fracionada. Informe um número inteiro.`, {
      [campo]: `A unidade ${unidade} só aceita quantidade inteira.`,
    });
  }
  return m;
}

/** arred(): inteiro mais próximo, metade para cima (valores não negativos). */
export function arredDivisao(numerador: bigint, denominador: bigint): number {
  return Number((numerador * 2n + denominador) / (denominador * 2n));
}

/** bruto = arred(quantidade × preço). */
export function totalBruto(qtdMilesimos: number, precoCentavos: number): number {
  return arredDivisao(BigInt(qtdMilesimos) * BigInt(precoCentavos), 1000n);
}

/** Desconto percentual: arred(base × % / 100). Percentual com até 2 casas. */
export function descontoPercentual(baseCentavos: number, percentual: number): number {
  const centesimos = Math.round(percentual * 100);
  return arredDivisao(BigInt(baseCentavos) * BigInt(centesimos), 10000n);
}

/**
 * Rateio do desconto da venda pelos itens (maiores restos vão para os maiores itens;
 * empate pela ordem de inclusão). Garante Σ rateio = desconto.
 */
export function ratearDesconto(valoresItens: number[], desconto: number): number[] {
  const subtotal = valoresItens.reduce((s, v) => s + v, 0);
  if (desconto === 0 || subtotal === 0) return valoresItens.map(() => 0);
  const rateio = valoresItens.map((v) => Number((BigInt(desconto) * BigInt(v)) / BigInt(subtotal)));
  let resto = desconto - rateio.reduce((s, v) => s + v, 0);
  const ordem = valoresItens
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map((x) => x.i);
  for (let k = 0; resto > 0; k = (k + 1) % ordem.length) {
    rateio[ordem[k]] += 1;
    resto -= 1;
  }
  return rateio;
}

export interface ItemCalculo {
  quantidade: number; // milésimos
  preco_unitario: number;
  desconto: number;
}

export interface ResultadoItem {
  bruto: number;
  desconto: number;
  apos_item: number;
  rateio: number;
  liquido: number;
}

export interface ResultadoVenda {
  itens: ResultadoItem[];
  soma_bruto: number;
  subtotal: number;
  desconto_venda: number;
  total: number;
  desconto_total: number;
  /** percentual de desconto total, como número (ex.: 6.25) */
  percentual_desconto: number;
}

export function calcularVenda(itens: ItemCalculo[], descontoVenda: number): ResultadoVenda {
  const parciais = itens.map((it, idx) => {
    const bruto = totalBruto(it.quantidade, it.preco_unitario);
    if (!Number.isInteger(it.desconto) || it.desconto < 0 || (it.desconto > 0 && it.desconto >= bruto)) {
      throw erroValidacao(`O desconto do item ${idx + 1} deve ser menor que o valor do item.`, {
        [`itens.${idx}.desconto`]: 'O desconto deve ser menor que o valor do item.',
      });
    }
    return { bruto, desconto: it.desconto, apos_item: bruto - it.desconto };
  });
  const subtotal = parciais.reduce((s, p) => s + p.apos_item, 0);
  if (!Number.isInteger(descontoVenda) || descontoVenda < 0 || (descontoVenda > 0 && descontoVenda >= subtotal)) {
    throw erroValidacao('O desconto na venda deve ser menor que o subtotal.', { desconto_venda: 'Deve ser menor que o subtotal.' });
  }
  const rateios = ratearDesconto(
    parciais.map((p) => p.apos_item),
    descontoVenda,
  );
  const resultado = parciais.map((p, i) => ({ ...p, rateio: rateios[i], liquido: p.apos_item - rateios[i] }));
  const somaBruto = parciais.reduce((s, p) => s + p.bruto, 0);
  const total = subtotal - descontoVenda;
  const descontoTotal = parciais.reduce((s, p) => s + p.desconto, 0) + descontoVenda;
  return {
    itens: resultado,
    soma_bruto: somaBruto,
    subtotal,
    desconto_venda: descontoVenda,
    total,
    desconto_total: descontoTotal,
    percentual_desconto: somaBruto > 0 ? (descontoTotal * 100) / somaBruto : 0,
  };
}

export type FormaPagamento = 'dinheiro' | 'debito' | 'credito' | 'pix' | 'vale_troca';
export const FORMAS_PAGAMENTO: FormaPagamento[] = ['dinheiro', 'debito', 'credito', 'pix', 'vale_troca'];
export const NOMES_FORMAS: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito: 'Crédito',
  pix: 'PIX',
  vale_troca: 'Vale-troca',
};

/**
 * Regra do troco: pagamentos que não são dinheiro não podem passar do total;
 * o troco sai apenas do dinheiro. Devolve o troco.
 */
export function calcularTroco(total: number, pagamentos: { forma: string; valor: number }[]): number {
  const soma = pagamentos.reduce((s, p) => s + p.valor, 0);
  const somaNaoDinheiro = pagamentos.filter((p) => p.forma !== 'dinheiro').reduce((s, p) => s + p.valor, 0);
  const somaDinheiro = soma - somaNaoDinheiro;
  if (somaNaoDinheiro > total) {
    throw erroValidacao(
      'Pagamentos em débito, crédito, PIX ou vale-troca não podem passar do valor restante. Só pagamento em dinheiro gera troco.',
      { pagamentos: 'Valor acima do restante.' },
    );
  }
  if (soma < total) {
    throw erroValidacao(`Ainda falta receber ${formatarReais(total - soma)}. Adicione outro pagamento.`, {
      pagamentos: 'Pagamento insuficiente.',
    });
  }
  const troco = soma - total;
  if (troco > somaDinheiro) throw erroValidacao('Troco só pode ser dado de pagamento em dinheiro.');
  return troco;
}

export function formatarReais(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}
