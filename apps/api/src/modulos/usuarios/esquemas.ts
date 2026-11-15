import { z, textoObrig, cpfOpc, telefoneOpc, versao, situacaoFiltro, paginacao } from '../../lib/esquemas.js';

const perfil = z.enum(['administrador', 'gerente', 'caixa'], { error: 'Perfil deve ser administrador, gerente ou caixa.' });
const email = z.string({ error: 'Informe o e-mail.' }).trim().toLowerCase().max(120).email('E-mail inválido.');

export const esquemaCriarUsuario = z.object({
  nome: textoObrig(80, 2),
  email,
  cpf: cpfOpc,
  telefone: telefoneOpc,
  perfil,
  senha: z.string().nullable().optional(),
  gerar_senha: z.boolean().optional(),
});

export const esquemaEditarUsuario = z.object({
  versao,
  nome: textoObrig(80, 2).optional(),
  email: email.optional(),
  cpf: cpfOpc,
  telefone: telefoneOpc,
  perfil: perfil.optional(),
});

export const esquemaListarUsuarios = z.object({
  busca: z.string().optional(),
  perfil: perfil.optional(),
  situacao: situacaoFiltro,
  ...paginacao,
});
