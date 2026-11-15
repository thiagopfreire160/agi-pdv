import { describe, it, expect } from 'vitest';
import { calcularTroco, calcularVenda, descontoPercentual, paraMilesimos, ratearDesconto, totalBruto } from '../src/lib/dinheiro.js';
import { cnpjValido, codigoBarrasValido, cpfValido, documentoValido } from '../src/lib/documentos.js';
import { valorDevolucaoItem } from '../src/modulos/devolucoes/servico.js';

describe('cálculos do caixa (seção 5.5 / 5.6)', () => {
  it('0,350 kg × R$ 29,90 = R$ 10,47 (arredonda metade para cima)', () => {
    expect(totalBruto(paraMilesimos('0,350')!, 2990)).toBe(1047);
  });

  it('exemplo da especificação: 3 × 1,99 + 0,350 × 29,90 = subtotal 16,44', () => {
    const r = calcularVenda(
      [
        { quantidade: 3000, preco_unitario: 199, desconto: 0 },
        { quantidade: 350, preco_unitario: 2990, desconto: 0 },
      ],
      0,
    );
    expect(r.itens.map((i) => i.bruto)).toEqual([597, 1047]);
    expect(r.subtotal).toBe(1644);
  });

  it('desconto de 10% sobre R$ 33,33 = R$ 3,33 e total R$ 30,00', () => {
    const desconto = descontoPercentual(3333, 10);
    expect(desconto).toBe(333);
    expect(calcularVenda([{ quantidade: 1000, preco_unitario: 3333, desconto: 0 }], desconto).total).toBe(3000);
  });

  it('rateio de R$ 1,00 em 3 itens de R$ 10,00 = 0,34 / 0,33 / 0,33 e Σ líquidos = total', () => {
    expect(ratearDesconto([1000, 1000, 1000], 100)).toEqual([34, 33, 33]);
    const r = calcularVenda(
      [1, 2, 3].map(() => ({ quantidade: 1000, preco_unitario: 1000, desconto: 0 })),
      100,
    );
    expect(r.itens.map((i) => i.liquido).reduce((a, b) => a + b, 0)).toBe(r.total);
    expect(r.total).toBe(2900);
  });

  it('rateio: centavos restantes vão para os maiores itens', () => {
    expect(ratearDesconto([500, 1500, 1000], 7)).toEqual([1, 4, 2]);
    expect(ratearDesconto([500, 1500, 1000], 7).reduce((a, b) => a + b)).toBe(7);
  });

  it('percentual de desconto total considera item + venda sobre o bruto', () => {
    const r = calcularVenda([{ quantidade: 1000, preco_unitario: 10000, desconto: 300 }], 300);
    expect(r.desconto_total).toBe(600);
    expect(r.percentual_desconto).toBeCloseTo(6);
  });

  it('desconto do item não pode igualar o bruto', () => {
    expect(() => calcularVenda([{ quantidade: 1000, preco_unitario: 100, desconto: 100 }], 0)).toThrow();
  });

  it('troco: total 50, débito 20 + dinheiro 50 → troco 20', () => {
    expect(calcularTroco(5000, [{ forma: 'debito', valor: 2000 }, { forma: 'dinheiro', valor: 5000 }])).toBe(2000);
  });

  it('troco sem dinheiro é impossível / débito maior que o restante é recusado', () => {
    expect(() => calcularTroco(5000, [{ forma: 'debito', valor: 6000 }])).toThrow(/restante/);
    expect(() => calcularTroco(5000, [{ forma: 'pix', valor: 3000 }, { forma: 'credito', valor: 3000 }])).toThrow();
    expect(() => calcularTroco(5000, [{ forma: 'pix', valor: 1000 }])).toThrow(/falta/i);
  });

  it('quantidade: até 3 casas', () => {
    expect(paraMilesimos('1,535')).toBe(1535);
    expect(paraMilesimos('1,5355')).toBeNull();
    expect(paraMilesimos(2)).toBe(2000);
  });
});

describe('devolução proporcional', () => {
  it('devoluções sucessivas somam exatamente o líquido do item', () => {
    const item = { quantidade: 3, quantidade_devolvida: 0, total_liquido: 1000, valor_devolvido: 0 };
    const v1 = valorDevolucaoItem(item, 1000);
    const v2 = valorDevolucaoItem({ ...item, quantidade_devolvida: 1, valor_devolvido: v1 }, 1000);
    const v3 = valorDevolucaoItem({ ...item, quantidade_devolvida: 2, valor_devolvido: v1 + v2 }, 1000);
    expect([v1, v2, v3]).toEqual([333, 333, 334]);
  });
});

describe('documentos', () => {
  it('CPF/CNPJ/GTIN', () => {
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(documentoValido('11222333000181')).toBe(true);
    expect(codigoBarrasValido('7891000315507')).toBe(true);
    expect(codigoBarrasValido('7891000315508')).toBe(false);
  });
});
