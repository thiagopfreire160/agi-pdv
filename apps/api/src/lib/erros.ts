export class ErroApp extends Error {
  constructor(
    public status: number,
    mensagem: string,
    public extras: Record<string, unknown> = {},
  ) {
    super(mensagem);
  }
}

export const erroValidacao = (mensagem: string, campos?: Record<string, string>, extras: Record<string, unknown> = {}) =>
  new ErroApp(422, mensagem, { ...(campos ? { campos } : {}), ...extras });

export const erroCampo = (campo: string, mensagem: string) => erroValidacao(mensagem, { [campo]: mensagem });

export const naoEncontrado = (mensagem: string) => new ErroApp(404, mensagem);

export const conflito = (mensagem: string, extras: Record<string, unknown> = {}) => new ErroApp(409, mensagem, extras);

export const semPermissao = (mensagem = 'Você não tem permissão para esta ação. Peça a um gerente ou administrador.') =>
  new ErroApp(403, mensagem, { codigo: 'SEM_PERMISSAO' });

export const erroConflitoVersao = () =>
  conflito('Outra pessoa salvou este registro depois que você abriu a tela. Recarregue para ver a versão atual e refaça a alteração.', {
    codigo: 'CONFLITO_VERSAO',
  });
