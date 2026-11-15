/** Política de senha (seção 6.3). Retorna a mensagem de erro ou null. */
export function erroSenha(s: string): string | null {
  if (s.length < 8) return 'Use pelo menos 8 caracteres.'
  if (s.length > 72) return 'Use no máximo 72 caracteres.'
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.'
  return null
}
