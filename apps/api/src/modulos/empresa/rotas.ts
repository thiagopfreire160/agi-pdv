import type { FastifyInstance } from 'fastify';
import { validar, z, textoObrig, textoOpc, cnpjObrig, telefoneOpc, celularOpc, emailOpc, enderecoCampos, conferirCidadeUf, versao } from '../../lib/esquemas.js';
import { ator, SO_ADMIN, SUPERVISORES } from '../../lib/contexto.js';
import { erroValidacao } from '../../lib/erros.js';
import * as s from './servico.js';

const esquemaEmpresa = z.object({
  versao,
  nome_fantasia: textoObrig(80).optional(),
  razao_social: textoOpc(120),
  cnpj: cnpjObrig.optional(),
  inscricao_estadual: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toUpperCase()) : v),
    z.string().max(20).refine((v) => v === 'ISENTO' || /^[\d.\-/]+$/.test(v), 'Use apenas números ou "ISENTO".').nullable().optional(),
  ),
  telefone: telefoneOpc,
  whatsapp: celularOpc,
  email: emailOpc,
  site: textoOpc(120),
  ...enderecoCampos,
  numero: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toUpperCase() === 'S/N' ? 'S/N' : v.trim()) : v),
    z.string().max(10).nullable().optional(),
  ),
  mensagem_rodape: textoOpc(200),
  fuso_horario: z
    .string()
    .refine((f) => {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: f });
        return true;
      } catch {
        return false;
      }
    }, 'Fuso horário inválido. Ex.: America/Sao_Paulo.')
    .optional(),
});

export default async function rotas(app: FastifyInstance) {
  app.get('/empresa', { config: { perfis: SUPERVISORES } }, async () => s.obterEmpresa());

  app.put('/empresa', { config: { perfis: SO_ADMIN } }, async (req) => {
    const dados = validar(esquemaEmpresa, req.body);
    const atual = await s.obterEmpresa();
    conferirCidadeUf({ cidade: dados.cidade !== undefined ? dados.cidade : atual.cidade, uf: dados.uf !== undefined ? dados.uf : atual.uf });
    return s.atualizarEmpresa(ator(req), dados);
  });

  app.put('/empresa/logo', { config: { perfis: SO_ADMIN } }, async (req) => {
    const { imagem } = validar(z.object({ imagem: z.string({ error: 'Envie a imagem em base64 no campo "imagem".' }) }), req.body);
    if (imagem.length > 1.5 * 1024 * 1024) throw erroValidacao('A logo deve ter no máximo 1 MB.', { imagem: 'Máximo 1 MB.' });
    return s.salvarLogo(ator(req), imagem);
  });

  app.delete('/empresa/logo', { config: { perfis: SO_ADMIN } }, async (req) => s.removerLogo(ator(req)));

  // Qualquer usuário logado (usado no recibo).
  app.get('/empresa/logo', async (_req, reply) => {
    const { bytes, tipo } = await s.lerLogo();
    return reply.header('Content-Type', tipo).header('Cache-Control', 'no-cache').send(bytes);
  });
}
