import { z } from 'zod';
import { erroValidacao } from './erros.js';
import { cpfValido, documentoValido, cnpjValido, somenteDigitos, codigoBarrasValido, UFS } from './documentos.js';

z.config(z.locales.ptBR());

/** Valida com Zod e transforma os problemas em {campos: {caminho: mensagem}}. */
export function validar<T extends z.ZodType>(esquema: T, dados: unknown): z.infer<T> {
  const r = esquema.safeParse(dados ?? {});
  if (r.success) return r.data;
  const campos: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const caminho = issue.path.join('.') || '_';
    if (!campos[caminho]) campos[caminho] = issue.message;
  }
  const primeiro = Object.entries(campos)[0];
  const mensagem =
    Object.keys(campos).length === 1 && primeiro[0] !== '_'
      ? `Verifique o campo "${primeiro[0]}": ${primeiro[1]}`
      : primeiro[0] === '_'
        ? primeiro[1]
        : 'Alguns campos precisam de correção. Confira e tente de novo.';
  throw erroValidacao(mensagem, campos);
}

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Texto obrigatório, sem espaços nas pontas. */
export const textoObrig = (max: number, min = 1) =>
  z
    .string({ error: 'Campo obrigatório.' })
    .trim()
    .min(min, min > 1 ? `Use pelo menos ${min} caracteres.` : 'Campo obrigatório.')
    .max(max, `Use no máximo ${max} caracteres.`);

/** Texto opcional: string vazia vira null. */
export const textoOpc = (max: number) =>
  z.preprocess(vazioParaNulo, z.string().trim().max(max, `Use no máximo ${max} caracteres.`).nullable().optional());

const digitosOpc = (validador: (d: string) => boolean, mensagem: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (somenteDigitos(v) === '' ? null : somenteDigitos(v)) : v),
    z.string().refine(validador, mensagem).nullable().optional(),
  );

export const cpfOpc = digitosOpc(cpfValido, 'CPF inválido. Confira os números.');
export const documentoOpc = digitosOpc(documentoValido, 'CPF ou CNPJ inválido. Confira os números.');
export const cnpjObrig = z
  .string({ error: 'Informe o CNPJ.' })
  .transform(somenteDigitos)
  .refine(cnpjValido, 'CNPJ inválido. Confira os números.');
export const telefoneOpc = digitosOpc((d) => d.length === 10 || d.length === 11, 'Telefone deve ter 10 ou 11 dígitos com DDD.');
export const celularOpc = digitosOpc((d) => d.length === 11, 'Celular deve ter 11 dígitos com DDD.');
export const cepOpc = digitosOpc((d) => d.length === 8, 'CEP deve ter 8 dígitos.');
export const emailOpc = z.preprocess(
  vazioParaNulo,
  z.string().trim().toLowerCase().max(120).email('E-mail inválido.').nullable().optional(),
);
export const ufOpc = z.preprocess(
  (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toUpperCase()) : v),
  z.enum(UFS, { error: 'UF inválida. Use a sigla do estado, como SP.' }).nullable().optional(),
);
export const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato aaaa-mm-dd.');
export const dataIsoOpc = z.preprocess(vazioParaNulo, dataIso.nullable().optional());
export const centavos = z.number({ error: 'Informe um valor em centavos.' }).int('Use valor em centavos (inteiro).').min(0, 'O valor não pode ser negativo.');
export const centavosPositivo = z.number({ error: 'Informe um valor em centavos.' }).int('Use valor em centavos (inteiro).').min(1, 'O valor deve ser maior que zero.');
export const quantidade = z.union([z.number(), z.string()], { error: 'Informe a quantidade.' });
export const uuid = z.string().uuid('Identificador inválido.');
export const uuidOpc = z.preprocess(vazioParaNulo, uuid.nullable().optional());
export const versao = z.number({ error: 'Informe a versão do registro (campo "versao").' }).int();
export const booleanoQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const enderecoCampos = {
  cep: cepOpc,
  logradouro: textoOpc(120),
  numero: textoOpc(10),
  complemento: textoOpc(60),
  bairro: textoOpc(60),
  cidade: textoOpc(60),
  uf: ufOpc,
};

/** UF obrigatória se cidade preenchida. */
export function conferirCidadeUf(d: { cidade?: string | null; uf?: string | null }) {
  if (d.cidade && !d.uf) throw erroValidacao('Informe a UF da cidade.', { uf: 'Obrigatória quando a cidade é preenchida.' });
}

export const paginacao = {
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(200).default(50),
};

export const situacaoFiltro = z.enum(['ativos', 'inativos', 'todos']).default('ativos');

export { codigoBarrasValido, z };
