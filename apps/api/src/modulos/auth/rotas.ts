import type { FastifyInstance } from 'fastify';
import { validar, z, textoObrig, telefoneOpc } from '../../lib/esquemas.js';
import { usuario } from '../../lib/contexto.js';
import { banco } from '../../db/conexao.js';
import { atualizarPerfilProprio, entrar, sair, trocarPropriaSenha } from './servico.js';
import { formatarUsuario } from '../usuarios/formato.js';
import { caixaAbertoDoOperador } from '../caixa/servico.js';

const esquemaLogin = z.object({
  identificador: z.string({ error: 'Informe o e-mail ou CPF.' }).trim().min(1, 'Informe o e-mail ou CPF.'),
  senha: z.string({ error: 'Informe a senha.' }).min(1, 'Informe a senha.'),
});

const esquemaSenha = z.object({
  senha_atual: z.string().nullable().optional(),
  nova_senha: z.string({ error: 'Informe a nova senha.' }),
  confirmacao_senha: z.string({ error: 'Confirme a nova senha.' }),
});

const esquemaPerfil = z.object({
  nome: textoObrig(80, 2).optional(),
  telefone: telefoneOpc,
  tema: z.enum(['claro', 'escuro', 'sistema']).optional(),
});

export default async function rotas(app: FastifyInstance) {
  app.post('/auth/entrar', { config: { publica: true } }, async (req, reply) => {
    const { identificador, senha } = validar(esquemaLogin, req.body);
    return entrar(req, reply, identificador, senha);
  });

  app.post('/auth/sair', { config: { permitirTrocaPendente: true } }, async (req, reply) => {
    await sair(req, reply);
    return { ok: true };
  });

  app.get('/auth/eu', { config: { permitirTrocaPendente: true } }, async (req) => {
    const u = usuario(req);
    const completo = await banco().selectFrom('usuarios').selectAll().where('id', '=', u.id).executeTakeFirstOrThrow();
    const empresa = await banco().selectFrom('empresa').select(['nome_fantasia', 'fuso_horario', 'logo_tipo']).executeTakeFirst();
    const caixa = await caixaAbertoDoOperador(banco(), u.id);
    return {
      usuario: formatarUsuario(completo),
      empresa: empresa ? { nome_fantasia: empresa.nome_fantasia, fuso_horario: empresa.fuso_horario, tem_logo: !!empresa.logo_tipo } : null,
      caixa_aberto: caixa ? { id: caixa.id, numero: caixa.numero, aberto_em: caixa.aberto_em, vencido: caixa.vencido } : null,
      tela_inicial: completo.deve_trocar_senha ? 'trocar_senha' : u.perfil === 'caixa' ? 'caixa' : 'dashboard',
    };
  });

  app.put('/auth/perfil', async (req) => atualizarPerfilProprio(req, usuario(req), validar(esquemaPerfil, req.body)));

  app.post('/auth/senha', { config: { permitirTrocaPendente: true } }, async (req) =>
    trocarPropriaSenha(req, usuario(req), validar(esquemaSenha, req.body)),
  );
}
