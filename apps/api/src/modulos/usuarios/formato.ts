/** Formato público do usuário (nunca inclui senha). */
export function formatarUsuario(u: Record<string, any>) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    cpf: u.cpf ?? null,
    telefone: u.telefone ?? null,
    perfil: u.perfil,
    deve_trocar_senha: u.deve_trocar_senha,
    ativo: u.ativo ?? true,
    ultimo_acesso: u.ultimo_acesso ?? null,
    tema: u.tema,
    versao: u.versao,
    criado_em: u.criado_em,
  };
}

/** "Maria Souza Lima" → "Maria L." (nome curto do operador no recibo). */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}
