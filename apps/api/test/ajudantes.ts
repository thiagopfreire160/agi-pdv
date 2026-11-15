import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { construirApp } from '../src/app.js';
import { banco, sql } from '../src/db/conexao.js';
import { limparBanco } from '../src/db/limpar.js';
import { zerarLimitesIp } from '../src/lib/bloqueio.js';
import { gerarHash } from '../src/lib/senhas.js';

export const CNPJ_VALIDO = '11222333000181';
export const SENHA = 'Senha1234';

let app: FastifyInstance | null = null;
export async function obterApp() {
  app ??= await construirApp();
  return app;
}

export interface Resposta {
  status: number;
  corpo: any;
  texto: string;
  cabecalhos: Record<string, string | string[] | undefined>;
}

/** Cliente HTTP com cookie de sessão próprio (simula um navegador/terminal). */
export class Cliente {
  cookie: string | null = null;
  constructor(public ip = '10.0.0.1') {}

  async req(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, corpo?: unknown, extras: Record<string, string> = {}): Promise<Resposta> {
    const a = await obterApp();
    const headers: Record<string, string> = { ...extras };
    if (metodo !== 'GET' && !('x-nexo-csrf' in extras)) headers['x-nexo-csrf'] = '1';
    if (this.cookie) headers.cookie = this.cookie;
    const r = await a.inject({ method: metodo, url, payload: corpo as object | undefined, headers, remoteAddress: this.ip });
    const setCookie = r.headers['set-cookie'];
    if (setCookie) {
      const c = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((x) => x.startsWith('nexo_sessao='));
      if (c) this.cookie = c.split(';')[0].endsWith('=') ? null : c.split(';')[0];
    }
    let json: unknown = null;
    try {
      json = r.json();
    } catch {
      /* não-JSON (CSV, imagem) */
    }
    return { status: r.statusCode, corpo: json, texto: r.body, cabecalhos: r.headers };
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, corpo: unknown = {}) => this.req('POST', url, corpo);
  put = (url: string, corpo: unknown = {}) => this.req('PUT', url, corpo);
  del = (url: string) => this.req('DELETE', url);

  async entrar(identificador: string, senha = SENHA) {
    const r = await this.post('/api/auth/entrar', { identificador, senha });
    if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${r.texto}`);
    return r;
  }
}

/** Banco limpo + primeiro acesso concluído. Devolve o cliente do administrador. */
export async function prepararLoja() {
  await limparBanco(banco());
  zerarLimitesIp();
  const admin = new Cliente('10.0.0.100');
  const r = await admin.post('/api/primeiro-acesso', {
    empresa: { nome_fantasia: 'Mercadinho Teste', cnpj: CNPJ_VALIDO },
    administrador: { nome: 'Ana Admin', email: 'admin@teste.com', senha: SENHA, confirmacao_senha: SENHA },
  });
  if (r.status !== 201) throw new Error(`primeiro acesso falhou: ${r.texto}`);
  return admin;
}

/** Cria usuário direto no banco (já com senha definitiva) e devolve cliente logado. */
export async function criarUsuarioLogado(perfil: 'administrador' | 'gerente' | 'caixa', email: string, extras: { cpf?: string; nome?: string } = {}) {
  await banco()
    .insertInto('usuarios')
    .values({
      nome: extras.nome ?? `${perfil} ${email.split('@')[0]}`,
      email,
      cpf: extras.cpf ?? null,
      perfil,
      senha_hash: await gerarHash(SENHA),
      deve_trocar_senha: false,
    })
    .execute();
  const c = new Cliente(`10.0.1.${Math.floor(Math.random() * 200) + 1}`);
  await c.entrar(email);
  return c;
}

export async function criarProduto(admin: Cliente, dados: Record<string, unknown>) {
  const nome = String(dados.nome ?? 'Produto');
  const r = await admin.post('/api/produtos', { preco_venda: 1000, ...dados, nome: nome.length < 2 ? `Produto ${nome}` : nome });
  if (r.status !== 201) throw new Error(`criar produto falhou: ${r.texto}`);
  return r.corpo;
}

export async function abrirCaixa(c: Cliente, fundo = 10000) {
  const r = await c.post('/api/caixa/abrir', { fundo_troco: fundo, terminal: 'Caixa teste' });
  if (r.status !== 201) throw new Error(`abrir caixa falhou: ${r.texto}`);
  return r.corpo.sessao;
}

export function venda(itens: { produto: any; quantidade?: number | string; desconto?: number }[], pagamentos: any[], extras: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    itens: itens.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade ?? 1, preco_unitario: i.produto.preco_venda, desconto: i.desconto ?? 0 })),
    desconto_venda: 0,
    pagamentos,
    ...extras,
  };
}

export async function vender(c: Cliente, payload: Record<string, unknown>) {
  const r = await c.post('/api/vendas', payload);
  if (r.status !== 201) throw new Error(`venda falhou: ${r.status} ${r.texto}`);
  return r.corpo.venda;
}

export async function estoqueDe(produtoId: string) {
  const p = await banco().selectFrom('produtos').select('estoque_atual').where('id', '=', produtoId).executeTakeFirstOrThrow();
  return Number(p.estoque_atual);
}

export { banco, sql };
