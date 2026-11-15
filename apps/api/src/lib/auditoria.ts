import type { Tx } from '../db/conexao.js';

const CAMPOS_SENSIVEIS = ['senha', 'senha_hash', 'token', 'token_hash', 'logo'];

export interface Ator {
  usuarioId: string | null;
  ip?: string | null;
  autorizadorId?: string | null;
}

/** Mantém só os campos que mudaram, sem dados sensíveis. */
export function diferencas(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
  if (!antes || !depois) return { antes: limpar(antes), depois: limpar(depois) };
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  for (const chave of new Set([...Object.keys(antes), ...Object.keys(depois)])) {
    if (CAMPOS_SENSIVEIS.includes(chave) || ['versao', 'atualizado_em', 'atualizado_por'].includes(chave)) continue;
    if (!(chave in depois)) continue;
    if (JSON.stringify(normalizar(antes[chave])) !== JSON.stringify(normalizar(depois[chave]))) {
      a[chave] = normalizar(antes[chave]);
      d[chave] = normalizar(depois[chave]);
    }
  }
  return { antes: a, depois: d };
}

function normalizar(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  return v === undefined ? null : v;
}

function limpar(obj: Record<string, unknown> | null) {
  if (!obj) return null;
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!CAMPOS_SENSIVEIS.includes(k)) r[k] = normalizar(v);
  return r;
}

export async function auditar(
  db: Tx,
  ator: Ator,
  dados: {
    entidade: string;
    entidadeId?: string | null;
    acao: string;
    antes?: Record<string, unknown> | null;
    depois?: Record<string, unknown> | null;
    autorizadorId?: string | null;
    soDiferencas?: boolean;
  },
) {
  const { antes, depois } =
    dados.soDiferencas === false
      ? { antes: limpar(dados.antes ?? null), depois: limpar(dados.depois ?? null) }
      : diferencas(dados.antes ?? null, dados.depois ?? null);
  await db
    .insertInto('auditoria')
    .values({
      usuario_id: ator.usuarioId,
      autorizador_id: dados.autorizadorId ?? ator.autorizadorId ?? null,
      entidade: dados.entidade,
      entidade_id: dados.entidadeId ?? null,
      acao: dados.acao,
      antes: antes ? JSON.stringify(antes) : null,
      depois: depois ? JSON.stringify(depois) : null,
      ip: ator.ip ?? null,
    })
    .execute();
}
