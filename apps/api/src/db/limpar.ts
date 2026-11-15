import { sql } from 'kysely';
import type { Banco } from './conexao.js';

const TABELAS = [
  'auditoria', 'movimentacoes_estoque', 'inventarios_itens', 'inventarios', 'entradas_itens', 'entradas', 'movimentos_caixa',
  'devolucoes_itens', 'vendas_autorizacoes', 'vendas_pagamentos', 'vendas_itens', 'vales_troca', 'devolucoes', 'vendas',
  'autorizacoes', 'sessoes_caixa', 'clientes', 'produtos', 'fornecedores', 'categorias', 'sessoes_login', 'tentativas_login',
  'configuracoes', 'empresa', 'usuarios',
];

/** Apaga todos os dados (uso exclusivo de testes e da semente com --limpar). */
export async function limparBanco(db: Banco) {
  await sql.raw(`TRUNCATE ${TABELAS.join(', ')} RESTART IDENTITY CASCADE`).execute(db);
  for (const s of ['seq_venda', 'seq_entrada', 'seq_devolucao', 'seq_inventario', 'seq_caixa', 'seq_codigo_produto']) {
    await sql.raw(`ALTER SEQUENCE ${s} RESTART WITH 1`).execute(db);
  }
}
