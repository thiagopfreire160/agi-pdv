import type { FastifyReply, FastifyRequest } from 'fastify';
import { banco, sql } from '../../db/conexao.js';
import { auditar } from '../../lib/auditoria.js';
import { conflito, erroValidacao } from '../../lib/erros.js';
import { gerarHash, validarPoliticaSenha } from '../../lib/senhas.js';
import { criarSessao } from '../../lib/sessao.js';
import { garantirConfiguracoes, obterConfiguracoes } from '../configuracoes/servico.js';
import { formatarUsuario } from '../usuarios/formato.js';

export async function primeiroAcessoPendente(): Promise<boolean> {
  const r = await banco().selectFrom('empresa').select('id').executeTakeFirst();
  return !r;
}

export async function concluirPrimeiroAcesso(
  req: FastifyRequest,
  reply: FastifyReply,
  dados: {
    empresa: { nome_fantasia: string; cnpj: string };
    administrador: { nome: string; email: string; senha: string; confirmacao_senha: string };
  },
) {
  validarPoliticaSenha(dados.administrador.senha, 'administrador.senha');
  if (dados.administrador.senha !== dados.administrador.confirmacao_senha) {
    throw erroValidacao('A confirmação não confere com a senha.', { 'administrador.confirmacao_senha': 'Digite a mesma senha.' });
  }
  const senhaHash = await gerarHash(dados.administrador.senha);
  const usuario = await banco()
    .transaction()
    .execute(async (tx) => {
      await sql`SELECT pg_advisory_xact_lock(4242)`.execute(tx);
      const existe = await tx.selectFrom('empresa').select('id').executeTakeFirst();
      if (existe) throw conflito('O primeiro acesso já foi concluído. Entre com seu e-mail e senha.', { codigo: 'PRIMEIRO_ACESSO_CONCLUIDO' });
      const u = await tx
        .insertInto('usuarios')
        .values({
          nome: dados.administrador.nome,
          email: dados.administrador.email,
          perfil: 'administrador',
          senha_hash: senhaHash,
          deve_trocar_senha: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await tx.updateTable('usuarios').set({ criado_por: u.id, atualizado_por: u.id }).where('id', '=', u.id).execute();
      const e = await tx
        .insertInto('empresa')
        .values({ nome_fantasia: dados.empresa.nome_fantasia, cnpj: dados.empresa.cnpj, criado_por: u.id, atualizado_por: u.id })
        .returning(['id', 'nome_fantasia', 'cnpj'])
        .executeTakeFirstOrThrow();
      await garantirConfiguracoes(tx);
      const ator = { usuarioId: u.id, ip: req.ip };
      await auditar(tx, ator, { entidade: 'empresa', entidadeId: e.id, acao: 'criar', depois: e });
      await auditar(tx, ator, { entidade: 'usuario', entidadeId: u.id, acao: 'criar', depois: formatarUsuario(u) });
      return u;
    });
  const cfg = await obterConfiguracoes();
  await criarSessao(req, reply, usuario.id, cfg.duracao_sessao_horas);
  await banco().updateTable('usuarios').set({ ultimo_acesso: sql`now()` }).where('id', '=', usuario.id).execute();
  return { usuario: formatarUsuario(usuario), tela_inicial: 'dashboard' };
}

/** Consulta de CEP em serviço público (ViaCEP). Falhas não bloqueiam o cadastro. */
export async function consultarCep(cep: string) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 4000);
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controle.signal });
    if (!r.ok) return null;
    const d = (await r.json()) as Record<string, string | boolean>;
    if (d.erro) return null;
    return { cep, logradouro: d.logradouro || null, bairro: d.bairro || null, cidade: d.localidade || null, uf: d.uf || null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
