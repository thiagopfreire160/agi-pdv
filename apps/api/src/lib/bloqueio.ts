import { sql, type Tx } from '../db/conexao.js';
import { ErroApp } from './erros.js';
import { somenteDigitos } from './documentos.js';

const JANELA_MINUTOS = 15;

/** Identificador de login normalizado: e-mail em minúsculas ou CPF só com dígitos. */
export function normalizarIdentificador(identificador: string): string {
  const t = identificador.trim().toLowerCase();
  if (t.includes('@')) return t;
  const d = somenteDigitos(t);
  return d.length === 11 ? d : t;
}

const chave = (identificador: string, ip: string) => `${normalizarIdentificador(identificador)}|${ip}`;

export async function verificarBloqueio(db: Tx, identificador: string, ip: string) {
  const r = await db
    .selectFrom('tentativas_login')
    .select(['bloqueado_ate'])
    .where('chave', '=', chave(identificador, ip))
    .executeTakeFirst();
  const ate = r?.bloqueado_ate as Date | null | undefined;
  if (ate && ate.getTime() > Date.now()) {
    const minutos = Math.max(1, Math.ceil((ate.getTime() - Date.now()) / 60000));
    throw new ErroApp(429, `Muitas tentativas sem sucesso. Aguarde ${minutos} minuto${minutos > 1 ? 's' : ''} e tente de novo.`, {
      codigo: 'BLOQUEADO',
      minutos_restantes: minutos,
    });
  }
}

/** Registra falha; devolve true se a combinação ficou bloqueada agora. */
export async function registrarFalha(db: Tx, identificador: string, ip: string, limite: number, bloqueioMinutos: number) {
  const r = await sql<{ falhas: number; bloqueado: boolean }>`
    INSERT INTO tentativas_login AS t (chave, falhas, janela_inicio)
    VALUES (${chave(identificador, ip)}, 1, now())
    ON CONFLICT (chave) DO UPDATE SET
      falhas = CASE WHEN t.janela_inicio < now() - make_interval(mins => ${JANELA_MINUTOS})
                      OR (t.bloqueado_ate IS NOT NULL AND t.bloqueado_ate <= now())
                    THEN 1 ELSE t.falhas + 1 END,
      janela_inicio = CASE WHEN t.janela_inicio < now() - make_interval(mins => ${JANELA_MINUTOS})
                             OR (t.bloqueado_ate IS NOT NULL AND t.bloqueado_ate <= now())
                           THEN now() ELSE t.janela_inicio END,
      bloqueado_ate = CASE WHEN t.bloqueado_ate IS NOT NULL AND t.bloqueado_ate <= now() THEN NULL ELSE t.bloqueado_ate END
    RETURNING falhas, false AS bloqueado
  `.execute(db);
  const falhas = r.rows[0].falhas;
  if (falhas >= limite) {
    await db
      .updateTable('tentativas_login')
      .set({ bloqueado_ate: sql`now() + make_interval(mins => ${bloqueioMinutos})` })
      .where('chave', '=', chave(identificador, ip))
      .execute();
    return true;
  }
  return false;
}

export async function limparFalhas(db: Tx, identificador: string, ip: string) {
  await db.deleteFrom('tentativas_login').where('chave', '=', chave(identificador, ip)).execute();
}

/** Limite geral de tentativas de login por IP (memória): 30 por minuto. */
const porIp = new Map<string, { inicio: number; total: number }>();
export function limitarPorIp(ip: string, limite = 30) {
  const agora = Date.now();
  const r = porIp.get(ip);
  if (!r || agora - r.inicio > 60000) {
    porIp.set(ip, { inicio: agora, total: 1 });
    return;
  }
  r.total += 1;
  if (r.total > limite) {
    throw new ErroApp(429, 'Muitas tentativas de entrada a partir deste computador. Aguarde 1 minuto e tente de novo.', {
      codigo: 'LIMITE_IP',
    });
  }
}
export const zerarLimitesIp = () => porIp.clear();
