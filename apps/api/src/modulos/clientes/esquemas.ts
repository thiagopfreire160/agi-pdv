import { z, textoObrig, textoOpc, documentoOpc, celularOpc, telefoneOpc, emailOpc, dataIsoOpc, enderecoCampos, versao, situacaoFiltro, paginacao } from '../../lib/esquemas.js';

const campos = {
  nome: textoObrig(120, 2),
  documento: documentoOpc,
  celular: celularOpc,
  telefone: telefoneOpc,
  email: emailOpc,
  data_nascimento: dataIsoOpc,
  ...enderecoCampos,
  observacoes: textoOpc(500),
};

export const esquemaCriarCliente = z.object(campos);
export const esquemaEditarCliente = z.object({ ...campos, nome: campos.nome.optional(), versao });
export const esquemaListarClientes = z.object({ busca: z.string().optional(), situacao: situacaoFiltro, ...paginacao });
