import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
import { erroValidacao } from './erros.js';

// Argon2id (algoritmo padrão do @node-rs/argon2) com sal aleatório por senha.
export const gerarHash = (senha: string) => hash(senha);

export async function conferirSenha(hashSalvo: string, senha: string): Promise<boolean> {
  try {
    return await verify(hashSalvo, senha);
  } catch {
    return false;
  }
}

// Hash fixo usado para gastar o mesmo tempo quando o usuário não existe.
let hashFicticio: string | null = null;
export async function gastarTempoDeVerificacao(senha: string) {
  hashFicticio ??= await gerarHash('senha-ficticia-123');
  await conferirSenha(hashFicticio, senha);
}

export function validarPoliticaSenha(senha: string, campo = 'nova_senha') {
  if (typeof senha !== 'string' || senha.length < 8 || senha.length > 72 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
    throw erroValidacao('A senha precisa ter de 8 a 72 caracteres, com pelo menos uma letra e um número.', {
      [campo]: 'Use de 8 a 72 caracteres, com pelo menos uma letra e um número.',
    });
  }
}

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const NUMEROS = '23456789';

/** Senha temporária de 8 caracteres sem caracteres ambíguos (0/O, 1/l/I). */
export function gerarSenhaTemporaria(): string {
  const todos = LETRAS + NUMEROS;
  const chars = [LETRAS[randomInt(LETRAS.length)], NUMEROS[randomInt(NUMEROS.length)]];
  while (chars.length < 8) chars.push(todos[randomInt(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
