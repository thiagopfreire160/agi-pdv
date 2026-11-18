/**
 * Semente de demonstração: "Mercadinho Bom Preço", 3 usuários, ~45 produtos, clientes,
 * fornecedores e cerca de 60 dias de vendas, entradas, devoluções e fechamentos de caixa.
 *
 * Uso: npm run db:semente -- --limpar   (apaga todos os dados antes de semear)
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { criarBanco, type Banco } from '../db/conexao.js';
import { limparBanco } from '../db/limpar.js';
import { migrarBanco } from '../db/migrar.js';
import { gerarHash } from '../lib/senhas.js';
import { calcularTroco, calcularVenda, totalBruto } from '../lib/dinheiro.js';
import { dataNoFuso, somarDias } from '../lib/datas.js';
import { valorDevolucaoItem } from '../modulos/devolucoes/servico.js';
import { resumoSessao } from '../modulos/caixa/servico.js';

const FUSO = 'America/Sao_Paulo';

// ---------- gerador pseudoaleatório reproduzível ----------
let estado = 20261115;
function aleatorio() {
  estado = (estado * 1664525 + 1013904223) % 4294967296;
  return estado / 4294967296;
}
const entre = (min: number, max: number) => Math.floor(aleatorio() * (max - min + 1)) + min;
const chance = (p: number) => aleatorio() < p;
function sortear<T>(lista: T[], pesos?: number[]): T {
  if (!pesos) return lista[Math.floor(aleatorio() * lista.length)];
  const total = pesos.reduce((s, p) => s + p, 0);
  let r = aleatorio() * total;
  for (let i = 0; i < lista.length; i++) {
    r -= pesos[i];
    if (r <= 0) return lista[i];
  }
  return lista[lista.length - 1];
}

// ---------- documentos válidos ----------
function dvMod11(base: string, pesos: number[]) {
  const s = base.split('').reduce((t, d, i) => t + Number(d) * pesos[i], 0);
  const r = s % 11;
  return r < 2 ? 0 : 11 - r;
}
function gerarCnpj(raiz: string) {
  const base = raiz.padStart(8, '0') + '0001';
  const d1 = dvMod11(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dvMod11(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}
function gerarCpf(base9: string) {
  const dv = (b: string, peso: number) => {
    const s = b.split('').reduce((t, d, i) => t + Number(d) * (peso - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base9, 10);
  const d2 = dv(base9 + d1, 11);
  return `${base9}${d1}${d2}`;
}
function gerarEan13(base12: string) {
  const s = base12.split('').reduce((t, d, i) => t + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return base12 + ((10 - (s % 10)) % 10);
}

/** Instante para uma data local (fuso de São Paulo, UTC−3) e hora/minuto. */
const instante = (data: string, h: number, m: number) => new Date(`${data}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(entre(0, 59)).padStart(2, '0')}-03:00`);

// ---------- catálogo ----------
interface ProdutoSemente {
  nome: string; categoria: string; unidade: string; venda: number; custo: number; minimo: number; inicial: number;
  peso: number; controla?: boolean; fornecedor: number;
}
const CATALOGO: ProdutoSemente[] = [
  { nome: 'Arroz Tipo 1 5kg', categoria: 'Mercearia', unidade: 'UN', venda: 2690, custo: 2050, minimo: 15, inicial: 80, peso: 6, fornecedor: 0 },
  { nome: 'Feijão Carioca 1kg', categoria: 'Mercearia', unidade: 'UN', venda: 849, custo: 620, minimo: 20, inicial: 90, peso: 6, fornecedor: 0 },
  { nome: 'Açúcar Refinado 1kg', categoria: 'Mercearia', unidade: 'UN', venda: 499, custo: 360, minimo: 15, inicial: 70, peso: 4, fornecedor: 0 },
  { nome: 'Café Torrado e Moído 500g', categoria: 'Mercearia', unidade: 'UN', venda: 1890, custo: 1390, minimo: 15, inicial: 60, peso: 5, fornecedor: 0 },
  { nome: 'Óleo de Soja 900ml', categoria: 'Mercearia', unidade: 'UN', venda: 799, custo: 590, minimo: 15, inicial: 70, peso: 4, fornecedor: 0 },
  { nome: 'Macarrão Espaguete 500g', categoria: 'Mercearia', unidade: 'UN', venda: 459, custo: 310, minimo: 20, inicial: 90, peso: 4, fornecedor: 0 },
  { nome: 'Farinha de Trigo 1kg', categoria: 'Mercearia', unidade: 'UN', venda: 549, custo: 390, minimo: 10, inicial: 50, peso: 2, fornecedor: 0 },
  { nome: 'Sal Refinado 1kg', categoria: 'Mercearia', unidade: 'UN', venda: 299, custo: 170, minimo: 10, inicial: 40, peso: 1, fornecedor: 0 },
  { nome: 'Molho de Tomate 340g', categoria: 'Mercearia', unidade: 'UN', venda: 329, custo: 210, minimo: 20, inicial: 80, peso: 3, fornecedor: 0 },
  { nome: 'Leite Condensado 395g', categoria: 'Mercearia', unidade: 'UN', venda: 649, custo: 450, minimo: 12, inicial: 50, peso: 2, fornecedor: 0 },
  { nome: 'Biscoito Cream Cracker 350g', categoria: 'Mercearia', unidade: 'UN', venda: 549, custo: 360, minimo: 15, inicial: 60, peso: 3, fornecedor: 0 },
  { nome: 'Refrigerante Cola 2L', categoria: 'Bebidas', unidade: 'UN', venda: 999, custo: 690, minimo: 24, inicial: 120, peso: 7, fornecedor: 1 },
  { nome: 'Refrigerante Guaraná 2L', categoria: 'Bebidas', unidade: 'UN', venda: 849, custo: 570, minimo: 24, inicial: 100, peso: 5, fornecedor: 1 },
  { nome: 'Água Mineral 500ml', categoria: 'Bebidas', unidade: 'UN', venda: 250, custo: 110, minimo: 48, inicial: 200, peso: 6, fornecedor: 1 },
  { nome: 'Suco de Uva Integral 1L', categoria: 'Bebidas', unidade: 'UN', venda: 1290, custo: 890, minimo: 8, inicial: 30, peso: 1, fornecedor: 1 },
  { nome: 'Cerveja Lata 350ml', categoria: 'Bebidas', unidade: 'UN', venda: 429, custo: 290, minimo: 48, inicial: 240, peso: 6, fornecedor: 1 },
  { nome: 'Água de Coco 1L', categoria: 'Bebidas', unidade: 'UN', venda: 999, custo: 650, minimo: 6, inicial: 24, peso: 1, fornecedor: 1 },
  { nome: 'Leite Integral 1L', categoria: 'Laticínios e Frios', unidade: 'UN', venda: 549, custo: 410, minimo: 36, inicial: 150, peso: 8, fornecedor: 2 },
  { nome: 'Iogurte Natural 170g', categoria: 'Laticínios e Frios', unidade: 'UN', venda: 349, custo: 220, minimo: 12, inicial: 40, peso: 2, fornecedor: 2 },
  { nome: 'Manteiga 200g', categoria: 'Laticínios e Frios', unidade: 'UN', venda: 1290, custo: 920, minimo: 10, inicial: 35, peso: 2, fornecedor: 2 },
  { nome: 'Queijo Mussarela', categoria: 'Laticínios e Frios', unidade: 'KG', venda: 4990, custo: 3500, minimo: 3, inicial: 15, peso: 4, fornecedor: 2 },
  { nome: 'Presunto Cozido', categoria: 'Laticínios e Frios', unidade: 'KG', venda: 3590, custo: 2400, minimo: 3, inicial: 12, peso: 3, fornecedor: 2 },
  { nome: 'Requeijão Cremoso 200g', categoria: 'Laticínios e Frios', unidade: 'UN', venda: 899, custo: 610, minimo: 10, inicial: 40, peso: 2, fornecedor: 2 },
  { nome: 'Pão Francês', categoria: 'Padaria', unidade: 'KG', venda: 1690, custo: 900, minimo: 5, inicial: 30, peso: 10, fornecedor: 3 },
  { nome: 'Pão de Forma 500g', categoria: 'Padaria', unidade: 'UN', venda: 899, custo: 600, minimo: 8, inicial: 30, peso: 3, fornecedor: 3 },
  { nome: 'Bolo de Fubá Caseiro', categoria: 'Padaria', unidade: 'UN', venda: 1500, custo: 0, minimo: 0, inicial: 12, peso: 1, fornecedor: 3 },
  { nome: 'Banana Prata', categoria: 'Hortifrúti', unidade: 'KG', venda: 699, custo: 400, minimo: 8, inicial: 40, peso: 6, fornecedor: 4 },
  { nome: 'Tomate', categoria: 'Hortifrúti', unidade: 'KG', venda: 899, custo: 550, minimo: 6, inicial: 30, peso: 4, fornecedor: 4 },
  { nome: 'Batata', categoria: 'Hortifrúti', unidade: 'KG', venda: 599, custo: 350, minimo: 8, inicial: 40, peso: 4, fornecedor: 4 },
  { nome: 'Cebola', categoria: 'Hortifrúti', unidade: 'KG', venda: 649, custo: 380, minimo: 6, inicial: 30, peso: 3, fornecedor: 4 },
  { nome: 'Ovos Brancos (dúzia)', categoria: 'Hortifrúti', unidade: 'UN', venda: 1290, custo: 900, minimo: 15, inicial: 60, peso: 5, fornecedor: 4 },
  { nome: 'Detergente Líquido 500ml', categoria: 'Limpeza', unidade: 'UN', venda: 299, custo: 180, minimo: 20, inicial: 80, peso: 3, fornecedor: 0 },
  { nome: 'Sabão em Pó 1kg', categoria: 'Limpeza', unidade: 'UN', venda: 1490, custo: 1050, minimo: 10, inicial: 40, peso: 2, fornecedor: 0 },
  { nome: 'Água Sanitária 1L', categoria: 'Limpeza', unidade: 'UN', venda: 499, custo: 300, minimo: 12, inicial: 50, peso: 2, fornecedor: 0 },
  { nome: 'Esponja Multiuso', categoria: 'Limpeza', unidade: 'UN', venda: 249, custo: 120, minimo: 15, inicial: 60, peso: 2, fornecedor: 0 },
  { nome: 'Papel Higiênico 12 rolos', categoria: 'Limpeza', unidade: 'PCT', venda: 2290, custo: 1650, minimo: 10, inicial: 40, peso: 3, fornecedor: 0 },
  { nome: 'Sabonete 90g', categoria: 'Higiene', unidade: 'UN', venda: 249, custo: 140, minimo: 20, inicial: 80, peso: 3, fornecedor: 0 },
  { nome: 'Creme Dental 90g', categoria: 'Higiene', unidade: 'UN', venda: 449, custo: 290, minimo: 15, inicial: 60, peso: 2, fornecedor: 0 },
  { nome: 'Shampoo 350ml', categoria: 'Higiene', unidade: 'UN', venda: 1690, custo: 1100, minimo: 6, inicial: 25, peso: 1, fornecedor: 0 },
  { nome: 'Carne Moída', categoria: 'Açougue', unidade: 'KG', venda: 3990, custo: 2800, minimo: 5, inicial: 25, peso: 4, fornecedor: 2 },
  { nome: 'Peito de Frango', categoria: 'Açougue', unidade: 'KG', venda: 2190, custo: 1500, minimo: 5, inicial: 25, peso: 4, fornecedor: 2 },
  { nome: 'Chocolate ao Leite 90g', categoria: 'Bomboniere', unidade: 'UN', venda: 699, custo: 450, minimo: 12, inicial: 50, peso: 3, fornecedor: 1 },
  { nome: 'Bala de Goma 100g', categoria: 'Bomboniere', unidade: 'UN', venda: 399, custo: 220, minimo: 10, inicial: 40, peso: 2, fornecedor: 1 },
  { nome: 'Sacola Plástica', categoria: '', unidade: 'UN', venda: 15, custo: 5, minimo: 0, inicial: 0, peso: 4, controla: false, fornecedor: 1 },
];
// Produtos que ficam sem reposição na reta final (para o alerta de estoque baixo).
const SEM_REPOSICAO_FINAL = ['Café Torrado e Moído 500g', 'Manteiga 200g', 'Detergente Líquido 500ml', 'Shampoo 350ml', 'Queijo Mussarela', 'Água de Coco 1L'];

const FORNECEDORES = [
  { nome_fantasia: 'Atacadão Paulista', razao_social: 'Atacadão Paulista Comércio de Alimentos Ltda', raiz: '23456781', contato: 'Marcos Lima', telefone: '1133224455', observacoes: 'Visita às segundas. Entrega em 2 dias úteis.' },
  { nome_fantasia: 'Distribuidora de Bebidas Rio Claro', razao_social: 'Rio Claro Bebidas Ltda', raiz: '34567812', contato: 'Fernanda Rocha', telefone: '1934567788', observacoes: 'Pedido mínimo R$ 500,00.' },
  { nome_fantasia: 'Laticínios Serra Verde', razao_social: 'Serra Verde Laticínios e Frios Ltda', raiz: '45678123', contato: 'José Antunes', telefone: '3532145566', observacoes: 'Entrega terça e sexta.' },
  { nome_fantasia: 'Padaria Pão Quente (fornecedor)', razao_social: 'Pão Quente Panificadora ME', raiz: '56781234', contato: 'Dona Cida', telefone: '1140028922', observacoes: 'Entrega diária às 6h.' },
  { nome_fantasia: 'Ceasa Hortifrúti Silva', razao_social: 'Silva & Filhos Hortifrutigranjeiros Ltda', raiz: '67812345', contato: 'Seu Silva', telefone: '11987001122', observacoes: 'Compra na Ceasa às quartas e sábados.' },
];

const CLIENTES = [
  ['Maria Aparecida dos Santos', '11987654301'], ['José Carlos Pereira', '11987654302'], ['Ana Beatriz Oliveira', '11987654303'],
  ['Francisco de Assis Lima', '11987654304'], ['Juliana Costa Ferreira', '11987654305'], ['Antônio Marcos Souza', '11987654306'],
  ['Luciana Rodrigues Alves', '11987654307'], ['Paulo Henrique Gomes', '11987654308'], ['Sandra Regina Martins', '11987654309'],
  ['Ricardo Almeida Barbosa', '11987654310'], ['Patrícia Nogueira Dias', '11987654311'], ['Restaurante Sabor Caseiro', '1133445566'],
  ['Cláudia Helena Ribeiro', '11987654313'], ['Marcelo Tavares Cunha', '11987654314'], ['Fernanda Lopes Moreira', '11987654315'],
];

// ---------- estado da simulação ----------
interface ProdutoLinha { id: string; nome: string; unidade: string; preco_venda: number; preco_custo: number; codigo_barras: string | null; controla: boolean; minimo: number; inicial: number; peso: number; fornecedorId: string }
const linhas: Record<string, Record<string, unknown>[]> = {
  movimentacoes_estoque: [], sessoes_caixa: [], vendas: [], vendas_itens: [], vendas_pagamentos: [], vendas_autorizacoes: [],
  movimentos_caixa: [], devolucoes: [], devolucoes_itens: [], vales_troca: [], entradas: [], entradas_itens: [], autorizacoes: [], auditoria: [],
};
const estoque = new Map<string, number>(); // milésimos
let numVenda = 0;
let numSessao = 0;
let numDevolucao = 0;
let numEntrada = 0;

function movimentar(p: ProdutoLinha, tipo: string, variacao: number, quando: Date, usuarioId: string, origem: { tipo?: string; id?: string; custo?: number; motivo?: string } = {}) {
  const anterior = estoque.get(p.id)!;
  const posterior = anterior + variacao;
  estoque.set(p.id, posterior);
  linhas.movimentacoes_estoque.push({
    produto_id: p.id, tipo, quantidade: (tipo === 'inventario' ? variacao : Math.abs(variacao)) / 1000,
    saldo_anterior: anterior / 1000, saldo_posterior: posterior / 1000, custo_unitario: origem.custo ?? null, motivo: origem.motivo ?? null,
    origem_tipo: origem.tipo ?? null, origem_id: origem.id ?? null, usuario_id: usuarioId, data_hora: quando,
  });
}

interface VendaSim { id: string; numero: number; sessaoId: string; operadorId: string; clienteId: string | null; quando: Date; itens: { id: string; produto: ProdutoLinha; qtd: number; liquido: number; devolvida: number; valorDevolvido: number }[]; cancelada: boolean }
interface ValeSim { id: string; codigo: string; saldo: number; validade: string; clienteId: string | null }

async function main() {
  const limpar = process.argv.includes('--limpar');
  const db: Banco = criarBanco();
  try {
    await migrarBanco(db);
    const existe = await db.selectFrom('empresa').select('id').executeTakeFirst();
    if (existe && !limpar) {
      console.error('O banco já tem dados. Para apagar tudo e semear de novo: npm run db:semente -- --limpar');
      process.exitCode = 1;
      return;
    }
    if (limpar) await limparBanco(db);
    await semear(db);
  } finally {
    await db.destroy();
  }
}

async function semear(db: Banco) {
  const agora = new Date();
  const hoje = dataNoFuso(agora, FUSO);
  const inicio = somarDias(hoje, -60);

  // Usuários
  const usuarios = {
    admin: { id: randomUUID(), nome: 'Ana Paula Ribeiro', email: 'admin@agipdv.local', perfil: 'administrador', senha: 'Admin@123', cpf: gerarCpf('123456789') },
    gerente: { id: randomUUID(), nome: 'Bruno Carvalho', email: 'gerente@agipdv.local', perfil: 'gerente', senha: 'Gerente@123', cpf: gerarCpf('987654321') },
    caixa: { id: randomUUID(), nome: 'Carla Mendes', email: 'caixa@agipdv.local', perfil: 'caixa', senha: 'Caixa@123', cpf: gerarCpf('456789123') },
  };
  const criadoEm = instante(somarDias(inicio, -1), 8, 0);
  for (const u of Object.values(usuarios)) {
    await db
      .insertInto('usuarios')
      .values({ id: u.id, nome: u.nome, email: u.email, cpf: u.cpf, perfil: u.perfil, senha_hash: await gerarHash(u.senha), deve_trocar_senha: false, criado_em: criadoEm, telefone: '11999990000' })
      .execute();
  }
  const adm = usuarios.admin.id;

  await db
    .insertInto('empresa')
    .values({
      nome_fantasia: 'Mercadinho Bom Preço', razao_social: 'Bom Preço Comércio de Alimentos Ltda', cnpj: gerarCnpj('12345678'), inscricao_estadual: '123.456.789.110',
      telefone: '1132104567', whatsapp: '11987650000', email: 'contato@bompreco.com.br', site: '@mercadinhobompreco',
      cep: '01310100', logradouro: 'Avenida Paulista', numero: '1500', complemento: 'Loja 2', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP',
      mensagem_rodape: 'Trocas em até 30 dias com este recibo. Obrigado pela preferência!', criado_por: adm, atualizado_por: adm,
    })
    .execute();
  await db.insertInto('configuracoes').values({ atualizado_por: adm }).execute();

  // Categorias e fornecedores
  const categorias = new Map<string, string>();
  for (const nome of [...new Set(CATALOGO.map((p) => p.categoria).filter(Boolean))]) {
    const r = await db.insertInto('categorias').values({ nome, criado_por: adm, atualizado_por: adm, criado_em: criadoEm }).returning('id').executeTakeFirstOrThrow();
    categorias.set(nome, r.id);
  }
  const fornecedores: string[] = [];
  for (const f of FORNECEDORES) {
    const r = await db
      .insertInto('fornecedores')
      .values({ nome_fantasia: f.nome_fantasia, razao_social: f.razao_social, documento: gerarCnpj(f.raiz), contato: f.contato, telefone: f.telefone, observacoes: f.observacoes, cidade: 'São Paulo', uf: 'SP', criado_por: adm, atualizado_por: adm, criado_em: criadoEm })
      .returning('id')
      .executeTakeFirstOrThrow();
    fornecedores.push(r.id);
  }

  // Produtos
  const produtos: ProdutoLinha[] = [];
  let seqCodigo = 0;
  for (const [i, p] of CATALOGO.entries()) {
    seqCodigo++;
    const id = randomUUID();
    const codigoBarras = p.unidade === 'KG' || p.controla === false ? null : gerarEan13(`789${String(1000000 + i * 7919).slice(-7)}${String(i).padStart(2, '0')}`);
    await db
      .insertInto('produtos')
      .values({
        id, codigo: String(seqCodigo).padStart(6, '0'), codigo_barras: codigoBarras, nome: p.nome, categoria_id: categorias.get(p.categoria) ?? null,
        unidade: p.unidade, preco_venda: p.venda, preco_custo: p.custo, estoque_minimo: p.minimo, controla_estoque: p.controla !== false,
        fornecedor_id: fornecedores[p.fornecedor], criado_por: adm, atualizado_por: adm, criado_em: criadoEm,
      })
      .execute();
    const linha: ProdutoLinha = {
      id, nome: p.nome, unidade: p.unidade, preco_venda: p.venda, preco_custo: p.custo, codigo_barras: codigoBarras, controla: p.controla !== false,
      minimo: p.minimo * 1000, inicial: p.inicial * 1000, peso: p.peso, fornecedorId: fornecedores[p.fornecedor],
    };
    produtos.push(linha);
    estoque.set(id, 0);
    if (linha.controla && linha.inicial > 0) movimentar(linha, 'estoque_inicial', linha.inicial, criadoEm, adm, { tipo: 'produto', id, custo: p.custo });
  }

  // Clientes
  const clientes: string[] = [];
  for (const [i, [nome, fone]] of CLIENTES.entries()) {
    const juridica = nome.startsWith('Restaurante');
    const r = await db
      .insertInto('clientes')
      .values({
        nome, documento: juridica ? gerarCnpj('78123456') : gerarCpf(String(200000000 + i * 1234567).slice(0, 9)),
        celular: fone.length === 11 ? fone : null, telefone: fone.length === 10 ? fone : null, cidade: 'São Paulo', uf: 'SP',
        data_nascimento: juridica ? null : `19${60 + (i % 35)}-0${1 + (i % 9)}-1${i % 9}`, criado_por: adm, atualizado_por: adm, criado_em: criadoEm,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    clientes.push(r.id);
  }

  // ---------- simulação dia a dia ----------
  const vendasSim: VendaSim[] = [];
  const vales: ValeSim[] = [];
  const pesos = produtos.map((p) => p.peso);

  for (let d = 0; d <= 60; d++) {
    const dia = somarDias(inicio, d);
    const ehHoje = dia === hoje;
    const diaSemana = new Date(`${dia}T12:00:00Z`).getUTCDay();
    const reta_final = d >= 50;

    // Reposição de segunda a sábado, antes da abertura (itens abaixo de 2× o mínimo).
    if (diaSemana !== 0) {
      const porFornecedor = new Map<string, ProdutoLinha[]>();
      for (const p of produtos) {
        if (!p.controla || (reta_final && SEM_REPOSICAO_FINAL.includes(p.nome))) continue;
        if (estoque.get(p.id)! < Math.max(p.minimo * 2, p.inicial / 2)) porFornecedor.set(p.fornecedorId, [...(porFornecedor.get(p.fornecedorId) ?? []), p]);
      }
      for (const [fornecedorId, itens] of porFornecedor) {
        const id = randomUUID();
        const quando = instante(dia, 7, entre(0, 40));
        numEntrada++;
        linhas.entradas.push({
          id, numero: numEntrada, fornecedor_id: fornecedorId, numero_nota: String(entre(10000, 99999)), data_recebimento: dia, atualizar_custo: true,
          situacao: 'confirmada', confirmada_em: quando, confirmada_por: usuarios.gerente.id, criado_em: quando, criado_por: usuarios.gerente.id, atualizado_em: quando, atualizado_por: usuarios.gerente.id,
        });
        itens.forEach((p, ordem) => {
          const qtd = Math.max(p.inicial - estoque.get(p.id)!, p.minimo);
          const qtdArred = p.unidade === 'KG' ? qtd : Math.ceil(qtd / 1000) * 1000;
          linhas.entradas_itens.push({ entrada_id: id, ordem: ordem + 1, produto_id: p.id, quantidade: qtdArred / 1000, custo_unitario: p.preco_custo });
          movimentar(p, 'entrada', qtdArred, quando, usuarios.gerente.id, { tipo: 'entrada', id, custo: p.preco_custo });
        });
      }
    }

    // Operadores do dia: Carla todos os dias; Bruno também às sextas e aos sábados.
    const operadores = [usuarios.caixa];
    if (!ehHoje && (diaSemana === 5 || diaSemana === 6)) operadores.push(usuarios.gerente);
    const horaAgoraLocal = ehHoje ? Number(new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hour12: false }).format(agora)) : 24;

    interface SessaoDia { op: (typeof usuarios)['caixa']; id: string; dinheiro: number; devolucaoEm: number | null; linha: Record<string, unknown> }
    const eventos: { t: number; s: SessaoDia }[] = [];
    const sessoesDia: SessaoDia[] = [];
    for (const op of operadores) {
      numSessao++;
      // Hoje: abre às 8h, ou pouco antes de agora se ainda for madrugada.
      const abertura = ehHoje && horaAgoraLocal < 9 ? new Date(agora.getTime() - 90 * 60000) : instante(dia, 8, entre(0, 10));
      const limite = ehHoje ? agora.getTime() - 3 * 60000 : instante(dia, 19, 50).getTime();
      const linha = {
        id: randomUUID(), numero: numSessao, operador_id: op.id, terminal: op === usuarios.caixa ? 'Caixa 1' : 'Caixa 2', aberto_em: abertura, fundo_troco: 10000,
        situacao: 'aberto', criado_em: abertura, criado_por: op.id, atualizado_em: abertura, atualizado_por: op.id,
      };
      linhas.sessoes_caixa.push(linha);
      const sd: SessaoDia = { op, id: linha.id, dinheiro: 10000, devolucaoEm: null, linha };
      sessoesDia.push(sd);
      const base = diaSemana === 0 ? entre(8, 14) : diaSemana === 6 ? entre(28, 38) : entre(16, 28);
      const qtdVendas = op === usuarios.gerente ? Math.floor(base / 2) : ehHoje ? Math.max(4, Math.floor(base * Math.min(1, Math.max(0.25, (horaAgoraLocal - 8) / 12)))) : base;
      const tempos = Array.from({ length: qtdVendas }, () => abertura.getTime() + aleatorio() * (limite - abertura.getTime())).sort((a, b) => a - b);
      if (!ehHoje && op === usuarios.caixa && chance(0.3)) sd.devolucaoEm = tempos[Math.floor(tempos.length / 2)] ?? null;
      for (const t of tempos) eventos.push({ t, s: sd });
    }
    eventos.sort((a, b) => a.t - b.t);

    for (const { t, s: sd } of eventos) {
      const quando = new Date(t);
      const op = sd.op;
      const sessaoId = sd.id;

      // Devolução (em ~30% dos dias), de uma venda dos últimos 25 dias.
      if (sd.devolucaoEm !== null && t === sd.devolucaoEm) {
        const candidatas = vendasSim.filter((v) => !v.cancelada && v.quando.getTime() < t - 86400000 && v.quando.getTime() > t - 25 * 86400000 && v.itens.some((i) => i.devolvida < i.qtd));
        if (candidatas.length) {
          const v = sortear(candidatas);
          const item = sortear(v.itens.filter((i) => i.devolvida < i.qtd));
          const qtdDev = item.produto.unidade === 'KG' ? item.qtd - item.devolvida : 1000;
          const valor = valorDevolucaoItem({ quantidade: item.qtd / 1000, quantidade_devolvida: item.devolvida / 1000, total_liquido: item.liquido, valor_devolvido: item.valorDevolvido }, qtdDev);
          if (valor > 0) {
            const destino = chance(0.7) ? 'vale_troca' : 'estorno';
            const forma = destino === 'estorno' ? (valor <= sd.dinheiro - 2000 && chance(0.5) ? 'dinheiro' : 'pix') : null;
            const devId = randomUUID();
            numDevolucao++;
            const motivo = sortear(['defeito', 'arrependimento', 'tamanho_modelo', 'outro'], [5, 3, 1, 1]);
            let valeId: string | null = null;
            if (destino === 'vale_troca') {
              valeId = randomUUID();
              const codigo = Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[entre(0, 31)]).join('');
              vales.push({ id: valeId, codigo, saldo: valor, validade: somarDias(dia, 90), clienteId: v.clienteId });
              linhas.vales_troca.push({ id: valeId, codigo, cliente_id: v.clienteId, valor_original: valor, saldo: valor, validade: somarDias(dia, 90), situacao: 'ativo', devolucao_id: devId, criado_em: quando, criado_por: op.id, atualizado_em: quando, atualizado_por: op.id });
            }
            linhas.devolucoes.push({
              id: devId, numero: numDevolucao, venda_id: v.id, cliente_id: v.clienteId, valor, destino, forma_estorno: forma, motivo,
              motivo_texto: motivo === 'outro' ? 'Produto vencido na prateleira' : null, usuario_id: op.id, autorizador_id: usuarios.gerente.id,
              sessao_caixa_id: forma === 'dinheiro' ? sessaoId : null, vale_troca_id: valeId, criado_em: quando,
            });
            const voltaEstoque = motivo !== 'defeito';
            linhas.devolucoes_itens.push({ devolucao_id: devId, venda_item_id: item.id, produto_id: item.produto.id, quantidade: qtdDev / 1000, valor, volta_estoque: voltaEstoque });
            item.devolvida += qtdDev;
            item.valorDevolvido += valor;
            if (voltaEstoque && item.produto.controla) movimentar(item.produto, 'devolucao', qtdDev, quando, op.id, { tipo: 'devolucao', id: devId });
            if (forma === 'dinheiro') {
              sd.dinheiro -= valor;
              linhas.movimentos_caixa.push({ sessao_caixa_id: sessaoId, tipo: 'estorno_dinheiro', valor, motivo: `Devolução nº ${numDevolucao} (venda nº ${v.numero})`, usuario_id: op.id, autorizador_id: usuarios.gerente.id, devolucao_id: devId, data_hora: quando });
            }
          }
        }
      }

      // Monta a venda.
      const nItens = sortear([1, 2, 3, 4, 5, 6, 8], [20, 25, 22, 14, 9, 6, 4]);
      const escolhidos = new Map<string, { produto: ProdutoLinha; qtd: number }>();
      for (let k = 0; k < nItens; k++) {
        const p = sortear(produtos, pesos);
        const qtd = p.unidade === 'KG' ? entre(150, 1500) : sortear([1000, 2000, 3000, 6000], [70, 20, 7, 3]);
        const atual = escolhidos.get(p.id)?.qtd ?? 0;
        if (p.controla && estoque.get(p.id)! < atual + qtd) continue;
        escolhidos.set(p.id, { produto: p, qtd: atual + qtd });
      }
      if (chance(0.25)) {
        const sacola = produtos.find((p) => !p.controla)!;
        escolhidos.set(sacola.id, { produto: sacola, qtd: entre(1, 3) * 1000 });
      }
      const itens = [...escolhidos.values()];
      if (!itens.length) continue;
      const subtotalSemDesconto = calcularVenda(itens.map((i) => ({ quantidade: i.qtd, preco_unitario: i.produto.preco_venda, desconto: 0 })), 0).subtotal;
      const desconto = subtotalSemDesconto > 3000 && chance(0.06) ? Math.floor((subtotalSemDesconto * sortear([0.03, 0.05, 0.08], [3, 3, 1])) / 10) * 10 : 0;
      const calc = calcularVenda(itens.map((i) => ({ quantidade: i.qtd, preco_unitario: i.produto.preco_venda, desconto: 0 })), desconto);
      const total = calc.total;

      // Pagamentos (inclui pagamento dividido e uso de vale-troca).
      const pagamentos: { forma: string; valor: number; parcelas: number; vale?: ValeSim }[] = [];
      let restante = total;
      const valeDisponivel = vales.find((v) => v.saldo > 0 && v.validade >= dia && chance(0.25));
      if (valeDisponivel) {
        const usar = Math.min(valeDisponivel.saldo, restante);
        pagamentos.push({ forma: 'vale_troca', valor: usar, parcelas: 1, vale: valeDisponivel });
        restante -= usar;
      }
      if (restante > 2000 && chance(0.1)) {
        const parte = Math.floor(restante / 2 / 100) * 100;
        pagamentos.push({ forma: 'pix', valor: parte, parcelas: 1 });
        restante -= parte;
      }
      if (restante > 0) {
        const forma = sortear(['dinheiro', 'debito', 'credito', 'pix'], [33, 25, 14, 28]);
        if (forma === 'dinheiro') {
          // Cliente paga o valor exato ou com a menor cédula que cobre o restante.
          const cedula = [200, 500, 1000, 2000, 5000, 10000, 20000].find((n) => n >= restante) ?? Math.ceil(restante / 5000) * 5000;
          pagamentos.push({ forma, valor: chance(0.4) ? restante : cedula, parcelas: 1 });
        } else {
          pagamentos.push({ forma, valor: restante, parcelas: forma === 'credito' ? sortear([1, 2, 3, 6], [6, 2, 2, 1]) : 1 });
        }
      }
      const troco = calcularTroco(total, pagamentos);
      const clienteId = valeDisponivel?.clienteId ?? (chance(0.22) ? sortear(clientes) : null);
      const vendaId = randomUUID();
      numVenda++;
      const linhaVenda: Record<string, unknown> = {
        id: vendaId, numero: numVenda, sessao_caixa_id: sessaoId, operador_id: op.id, cliente_id: clienteId, terminal: sd.linha.terminal,
        soma_bruto: calc.soma_bruto, subtotal: calc.subtotal, desconto_itens: 0, desconto_venda: calc.desconto_venda, total, troco, situacao: 'finalizada',
        finalizada_em: quando, criado_em: quando, criado_por: op.id, atualizado_em: quando, atualizado_por: op.id,
      };
      linhas.vendas.push(linhaVenda);
      const sim: VendaSim = { id: vendaId, numero: numVenda, sessaoId, operadorId: op.id, clienteId, quando, itens: [], cancelada: false };
      itens.forEach((it, idx) => {
        const c = calc.itens[idx];
        const itemId = randomUUID();
        linhas.vendas_itens.push({
          id: itemId, venda_id: vendaId, ordem: idx + 1, produto_id: it.produto.id, descricao: it.produto.nome, codigo_barras: it.produto.codigo_barras,
          unidade: it.produto.unidade, quantidade: it.qtd / 1000, preco_unitario: it.produto.preco_venda, custo_unitario: it.produto.preco_custo,
          total_bruto: totalBruto(it.qtd, it.produto.preco_venda), desconto: 0, rateio_desconto: c.rateio, total_liquido: c.liquido,
        });
        sim.itens.push({ id: itemId, produto: it.produto, qtd: it.qtd, liquido: c.liquido, devolvida: 0, valorDevolvido: 0 });
        if (it.produto.controla) movimentar(it.produto, 'venda', -it.qtd, quando, op.id, { tipo: 'venda', id: vendaId });
      });
      pagamentos.forEach((p, idx) => {
        linhas.vendas_pagamentos.push({ venda_id: vendaId, ordem: idx + 1, forma: p.forma, valor: p.valor, parcelas: p.parcelas, vale_troca_id: p.vale?.id ?? null });
        if (p.vale) p.vale.saldo -= p.valor;
      });
      if (desconto > 0 && calc.percentual_desconto > 5 && op === usuarios.caixa) {
        const autId = randomUUID();
        const percentual = Math.ceil(calc.percentual_desconto * 100) / 100;
        linhas.autorizacoes.push({ id: autId, token_hash: randomUUID().replace(/-/g, '').padEnd(64, '0'), acao: 'desconto', operador_id: op.id, autorizador_id: usuarios.gerente.id, percentual, criada_em: quando, expira_em: quando, usada_em: quando });
        linhas.vendas_autorizacoes.push({ venda_id: vendaId, autorizacao_id: autId, tipo: 'desconto_acima_limite', operador_id: op.id, autorizador_id: usuarios.gerente.id, percentual, valor: calc.desconto_total, data_hora: quando });
      }
      const dinheiroDaVenda = pagamentos.filter((p) => p.forma === 'dinheiro').reduce((s, p) => s + p.valor, 0) - troco;
      sd.dinheiro += dinheiroDaVenda;

      // ~1,5% das vendas são canceladas logo em seguida (sem vale, para simplificar).
      if (!valeDisponivel && chance(0.015)) {
        const canceladaEm = new Date(t + 1);
        Object.assign(linhaVenda, { situacao: 'cancelada', cancelada_em: canceladaEm, cancelada_por: usuarios.gerente.id, cancelamento_autorizado_por: op === usuarios.caixa ? usuarios.gerente.id : null, motivo_cancelamento: 'Cliente desistiu da compra' });
        sim.cancelada = true;
        for (const it of sim.itens) if (it.produto.controla) movimentar(it.produto, 'cancelamento_venda', it.qtd, canceladaEm, usuarios.gerente.id, { tipo: 'venda', id: vendaId });
        sd.dinheiro -= dinheiroDaVenda;
      }
      vendasSim.push(sim);

      // Suprimento ocasional e sangria quando a gaveta passa de R$ 600.
      if (chance(0.02)) {
        linhas.movimentos_caixa.push({ sessao_caixa_id: sessaoId, tipo: 'suprimento', valor: 5000, motivo: 'Reforço de troco', usuario_id: op.id, data_hora: new Date(t + 30000) });
        sd.dinheiro += 5000;
      }
      if (sd.dinheiro > 60000) {
        const valor = Math.floor((sd.dinheiro - 15000) / 5000) * 5000;
        linhas.movimentos_caixa.push({ sessao_caixa_id: sessaoId, tipo: 'sangria', valor, motivo: 'Depósito no cofre', usuario_id: op.id, data_hora: new Date(t + 60000) });
        sd.dinheiro -= valor;
      }
    }

    if (!ehHoje) {
      for (const sd of sessoesDia) {
        const diferenca = chance(0.8) ? 0 : sortear([-500, -200, -100, -50, 50, 100, 300]);
        Object.assign(sd.linha, {
          situacao: 'fechado', fechado_em: instante(dia, 20, entre(0, 20)), fechado_por: sd.op.id, diferenca,
          observacao_fechamento: diferenca === 0 ? null : diferenca < 0 ? 'Falta no troco, conferido duas vezes' : 'Sobra, provável troco não retirado',
        });
      }
    }
  }

  // ---------- gravação ----------
  const inserirEmLotes = async (tabela: string, registros: Record<string, unknown>[]) => {
    for (let i = 0; i < registros.length; i += 400) await db.insertInto(tabela).values(registros.slice(i, i + 400)).execute();
  };
  // Ordem cronológica e cadeia de saldos (anterior de uma = posterior da anterior, por produto).
  linhas.movimentacoes_estoque.sort((a, b) => (a.data_hora as Date).getTime() - (b.data_hora as Date).getTime());
  const saldos = new Map<string, number>();
  for (const m of linhas.movimentacoes_estoque) {
    const anterior = saldos.get(m.produto_id as string) ?? 0;
    const variacao = Math.round(Number(m.quantidade) * 1000) * (['venda', 'ajuste_menos'].includes(m.tipo as string) ? -1 : 1);
    m.saldo_anterior = anterior / 1000;
    m.saldo_posterior = (anterior + variacao) / 1000;
    saldos.set(m.produto_id as string, anterior + variacao);
  }
  // Fechamentos ficam para depois do cálculo do resumo.
  const fechamentos = linhas.sessoes_caixa.filter((s) => s.situacao === 'fechado').map((s) => ({ ...s }));
  await inserirEmLotes('sessoes_caixa', linhas.sessoes_caixa.map((s) => ({ ...s, valor_contado: null, diferenca: null })));
  await inserirEmLotes('autorizacoes', linhas.autorizacoes);
  await inserirEmLotes('vendas', linhas.vendas);
  await inserirEmLotes('vendas_itens', linhas.vendas_itens);
  // Vales antes das devoluções (FK circular): grava vales sem devolução, depois vincula.
  await inserirEmLotes('vales_troca', linhas.vales_troca.map((v) => ({ ...v, devolucao_id: null })));
  await inserirEmLotes('vendas_pagamentos', linhas.vendas_pagamentos);
  await inserirEmLotes('vendas_autorizacoes', linhas.vendas_autorizacoes);
  await inserirEmLotes('devolucoes', linhas.devolucoes);
  for (const v of linhas.vales_troca) await db.updateTable('vales_troca').set({ devolucao_id: v.devolucao_id }).where('id', '=', v.id).execute();
  await inserirEmLotes('devolucoes_itens', linhas.devolucoes_itens);
  await inserirEmLotes('movimentos_caixa', linhas.movimentos_caixa);
  await inserirEmLotes('entradas', linhas.entradas);
  await inserirEmLotes('entradas_itens', linhas.entradas_itens);
  await inserirEmLotes('movimentacoes_estoque', linhas.movimentacoes_estoque);

  // Quantidades devolvidas por item e saldo dos vales.
  for (const v of vendasSim) {
    for (const i of v.itens) {
      if (i.devolvida > 0) await db.updateTable('vendas_itens').set({ quantidade_devolvida: i.devolvida / 1000, valor_devolvido: i.valorDevolvido }).where('id', '=', i.id).execute();
    }
  }
  for (const v of vales) await db.updateTable('vales_troca').set({ saldo: v.saldo, situacao: v.saldo === 0 ? 'usado' : 'ativo' }).where('id', '=', v.id).execute();

  // Estoque final de cada produto.
  for (const p of produtos) await db.updateTable('produtos').set({ estoque_atual: (saldos.get(p.id) ?? 0) / 1000 }).where('id', '=', p.id).execute();

  // Fecha as sessões com o resumo calculado pelo próprio serviço do caixa.
  for (const f of fechamentos) {
    const resumo = await resumoSessao(db, f.id as string);
    const diferenca = f.diferenca as number;
    await db
      .updateTable('sessoes_caixa')
      .set({
        situacao: 'fechado', fechado_em: f.fechado_em, fechado_por: f.fechado_por, valor_esperado: resumo.esperado_dinheiro,
        valor_contado: resumo.esperado_dinheiro + diferenca, diferenca, resumo: JSON.stringify(resumo), observacao_fechamento: f.observacao_fechamento,
      })
      .where('id', '=', f.id as string)
      .execute();
  }

  for (const [seq, valor] of [['seq_venda', numVenda], ['seq_caixa', numSessao], ['seq_devolucao', numDevolucao], ['seq_entrada', numEntrada], ['seq_codigo_produto', seqCodigo]] as const) {
    await sql`SELECT setval(${seq}::regclass, ${Math.max(valor, 1)}, ${valor > 0})`.execute(db);
  }

  await db.insertInto('auditoria').values({ usuario_id: adm, entidade: 'sistema', acao: 'semente', depois: JSON.stringify({ vendas: numVenda, sessoes: numSessao }) }).execute();

  const baixo = produtos.filter((p) => p.controla && p.minimo > 0 && estoque.get(p.id)! <= p.minimo).length;
  console.log('Semente concluída: Mercadinho Bom Preço');
  console.log(`  ${produtos.length} produtos, ${clientes.length} clientes, ${fornecedores.length} fornecedores`);
  console.log(`  ${numVenda} vendas em ${numSessao} sessões de caixa (${inicio} a ${hoje}), ${numDevolucao} devoluções, ${numEntrada} entradas`);
  console.log(`  ${baixo} produtos com estoque baixo; caixa de Carla Mendes aberto hoje`);
  console.log('Acessos (e-mail / senha):');
  for (const u of Object.values(usuarios)) console.log(`  ${u.perfil.padEnd(13)} ${u.email.padEnd(20)} ${u.senha}`);
}

await main();
