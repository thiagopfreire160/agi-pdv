import type { FastifyInstance } from 'fastify';
import { validar, z, textoObrig, cnpjObrig } from '../../lib/esquemas.js';
import { naoEncontrado, erroValidacao } from '../../lib/erros.js';
import { somenteDigitos } from '../../lib/documentos.js';
import { banco, sql } from '../../db/conexao.js';
import { concluirPrimeiroAcesso, consultarCep, primeiroAcessoPendente } from './servico.js';

const esquemaPrimeiroAcesso = z.object({
  empresa: z.object({ nome_fantasia: textoObrig(80), cnpj: cnpjObrig }),
  administrador: z.object({
    nome: textoObrig(80, 2),
    email: z.string({ error: 'Informe o e-mail.' }).trim().toLowerCase().max(120).email('E-mail inválido.'),
    senha: z.string({ error: 'Informe a senha.' }),
    confirmacao_senha: z.string({ error: 'Confirme a senha.' }),
  }),
});

export default async function rotas(app: FastifyInstance) {
  app.get('/saude', { config: { publica: true, antesDoPrimeiroAcesso: true } }, async () => {
    let bancoOk = true;
    try {
      await sql`SELECT 1`.execute(banco());
    } catch {
      bancoOk = false;
    }
    return { status: bancoOk ? 'ok' : 'erro', banco: bancoOk ? 'ok' : 'indisponivel', versao: '1.0.0', data_hora: new Date().toISOString() };
  });

  app.get('/primeiro-acesso', { config: { publica: true, antesDoPrimeiroAcesso: true } }, async () => ({
    necessario: await primeiroAcessoPendente(),
  }));

  app.post('/primeiro-acesso', { config: { publica: true, antesDoPrimeiroAcesso: true } }, async (req, reply) => {
    const dados = validar(esquemaPrimeiroAcesso, req.body);
    const r = await concluirPrimeiroAcesso(req, reply, dados);
    return reply.status(201).send(r);
  });

  app.get('/cep/:cep', async (req) => {
    const cep = somenteDigitos((req.params as { cep: string }).cep);
    if (cep.length !== 8) throw erroValidacao('CEP deve ter 8 dígitos.', { cep: 'CEP deve ter 8 dígitos.' });
    const r = await consultarCep(cep);
    if (!r) throw naoEncontrado('Não foi possível consultar este CEP agora. Preencha o endereço manualmente.');
    return r;
  });
}
