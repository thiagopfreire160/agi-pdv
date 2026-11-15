import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import estaticos from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config, emTeste } from './config.js';
import { banco } from './db/conexao.js';
import { ErroApp, semPermissao } from './lib/erros.js';
import { carregarSessao } from './lib/sessao.js';
import './lib/contexto.js';

import rotasSistema from './modulos/sistema/rotas.js';
import rotasAuth from './modulos/auth/rotas.js';
import rotasUsuarios from './modulos/usuarios/rotas.js';
import rotasEmpresa from './modulos/empresa/rotas.js';
import rotasConfiguracoes from './modulos/configuracoes/rotas.js';
import rotasAuditoria from './modulos/auditoria/rotas.js';
import rotasCategorias from './modulos/categorias/rotas.js';
import rotasProdutos from './modulos/produtos/rotas.js';
import rotasClientes from './modulos/clientes/rotas.js';
import rotasFornecedores from './modulos/fornecedores/rotas.js';
import rotasEstoque from './modulos/estoque/rotas.js';
import rotasEntradas from './modulos/entradas/rotas.js';
import rotasInventarios from './modulos/inventarios/rotas.js';
import rotasCaixa from './modulos/caixa/rotas.js';
import rotasAutorizacoes from './modulos/autorizacoes/rotas.js';
import rotasVendas from './modulos/vendas/rotas.js';
import rotasDevolucoes from './modulos/devolucoes/rotas.js';
import rotasVales from './modulos/vales/rotas.js';
import rotasDashboard from './modulos/dashboard/rotas.js';
import rotasRelatorios from './modulos/relatorios/rotas.js';

const METODOS_QUE_ALTERAM = ['POST', 'PUT', 'PATCH', 'DELETE'];
export const CABECALHO_CSRF = 'x-nexo-csrf';

export async function construirApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: emTeste ? false : { level: config.nivelLog, redact: ['req.headers.cookie', 'body.senha'] },
    bodyLimit: 3 * 1024 * 1024,
    trustProxy: true,
  });

  // Aceita corpo vazio em JSON (ex.: POST /api/auth/sair sem corpo) como {}.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, corpo, pronto) => {
    const texto = String(corpo ?? '').trim();
    if (!texto) return pronto(null, {});
    try {
      pronto(null, JSON.parse(texto));
    } catch {
      pronto(new ErroApp(400, 'Os dados enviados estão em formato inválido. Envie um JSON válido.'), undefined);
    }
  });

  await app.register(cookie);
  await app.register(cors, { origin: config.origensWeb, credentials: true });

  // Proteção CSRF: cookie SameSite=Lax + cabeçalho próprio obrigatório + checagem de origem.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api') || !METODOS_QUE_ALTERAM.includes(req.method)) return;
    if (req.headers[CABECALHO_CSRF] !== '1') {
      throw new ErroApp(403, `Requisição recusada por segurança: envie o cabeçalho "${CABECALHO_CSRF}: 1".`, { codigo: 'CSRF' });
    }
    const origem = req.headers.origin;
    if (origem) {
      const host = req.headers.host;
      const mesmaOrigem = host && (origem === `http://${host}` || origem === `https://${host}`);
      if (!mesmaOrigem && !config.origensWeb.includes(origem)) {
        throw new ErroApp(403, 'Requisição recusada por segurança: origem não permitida.', { codigo: 'CSRF' });
      }
    }
  });

  // Autenticação e perfis, declarados no "config" de cada rota.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api')) return;
    const cfg = req.routeOptions.config ?? {};
    if (!cfg.antesDoPrimeiroAcesso) {
      const existe = await banco().selectFrom('empresa').select('id').executeTakeFirst();
      if (!existe) {
        throw new ErroApp(409, 'O sistema ainda não foi configurado. Conclua o primeiro acesso.', { codigo: 'PRIMEIRO_ACESSO_PENDENTE' });
      }
    }
    if (cfg.publica) return;
    await carregarSessao(req);
    if (req.usuario!.deve_trocar_senha && !cfg.permitirTrocaPendente) {
      throw new ErroApp(403, 'Troque sua senha antes de continuar.', { codigo: 'TROCA_SENHA_OBRIGATORIA' });
    }
    if (cfg.perfis && !cfg.perfis.includes(req.usuario!.perfil)) throw semPermissao();
  });

  app.setErrorHandler((erro: FastifyError | ErroApp | Error, req, reply) => {
    if (erro instanceof ErroApp) {
      return reply.status(erro.status).send({ erro: erro.message, ...erro.extras });
    }
    const e = erro as FastifyError & { code?: string; constraint?: string };
    if (e.code === '23505') {
      return reply.status(409).send({ erro: 'Já existe um cadastro com estes dados. Confira código, documento e e-mail.' });
    }
    if (e.code === '22P02') {
      return reply.status(400).send({ erro: 'Algum valor está em formato inválido. Confira os dados e tente de novo.' });
    }
    if (e.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || e.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || e.statusCode === 400) {
      return reply.status(400).send({ erro: 'Os dados enviados estão em formato inválido. Envie um JSON válido.' });
    }
    if (e.statusCode === 413) return reply.status(413).send({ erro: 'Os dados enviados são grandes demais.' });
    if (e.statusCode === 415) return reply.status(415).send({ erro: 'Envie os dados em JSON (Content-Type: application/json).' });
    req.log.error(erro);
    return reply.status(500).send({ erro: 'Erro inesperado no servidor. Tente de novo; se continuar, avise o suporte.' });
  });

  // Modo loja: se o front já foi compilado (npm run build), a API também serve as telas.
  // Assim a loja usa um único endereço: http://IP-DO-SERVIDOR:3333
  const pastaWeb = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  const servirTelas = !emTeste && existsSync(resolve(pastaWeb, 'index.html'));
  if (servirTelas) await app.register(estaticos, { root: pastaWeb, wildcard: false });

  app.setNotFoundHandler((req, reply) => {
    if (servirTelas && req.method === 'GET' && !req.url.startsWith('/api')) return reply.sendFile('index.html');
    if (!servirTelas && req.method === 'GET' && !req.url.startsWith('/api')) {
      return reply.status(200).type('text/html; charset=utf-8').send(
        '<!doctype html><meta charset="utf-8"><title>NEXO PDV</title>' +
          '<body style="font-family:system-ui;max-width:560px;margin:15vh auto;padding:0 24px;line-height:1.6">' +
          '<h1>NEXO PDV</h1><p>Este endereço é o da API. As telas ainda não foram geradas.</p>' +
          '<p>Durante o desenvolvimento (<code>npm run dev</code>), abra <a href="http://localhost:5173">http://localhost:5173</a>.</p>' +
          '<p>Para usar na loja, rode <code>npm run loja</code> (ou o <code>ferramentas\\iniciar-nexo.bat</code>) e este endereço passa a abrir o sistema.</p></body>',
      );
    }
    return reply.status(404).send({ erro: 'Rota não encontrada. Confira o endereço da API.' });
  });

  const modulos = [
    rotasSistema, rotasAuth, rotasUsuarios, rotasEmpresa, rotasConfiguracoes, rotasAuditoria,
    rotasCategorias, rotasProdutos, rotasClientes, rotasFornecedores, rotasEstoque, rotasEntradas,
    rotasInventarios, rotasCaixa, rotasAutorizacoes, rotasVendas, rotasDevolucoes, rotasVales,
    rotasDashboard, rotasRelatorios,
  ];
  for (const m of modulos) await app.register(m, { prefix: '/api' });

  return app;
}
