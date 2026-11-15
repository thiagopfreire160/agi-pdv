import { sql, type Tx } from '../db/conexao.js';
import { erroValidacao } from './erros.js';

export const FUSO_PADRAO = 'America/Sao_Paulo';

export async function fusoDaLoja(db: Tx): Promise<string> {
  const r = await db.selectFrom('empresa').select('fuso_horario').executeTakeFirst();
  return (r?.fuso_horario as string) ?? FUSO_PADRAO;
}

/** Data 'aaaa-mm-dd' de um instante no fuso informado. */
export function dataNoFuso(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

export const hojeNoFuso = (fuso: string) => dataNoFuso(new Date(), fuso);

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000);
}

/** Expressão SQL: início do dia (timestamptz) de uma data no fuso. */
export const inicioDoDia = (data: string, fuso: string) => sql`(${data}::date::timestamp AT TIME ZONE ${fuso})`;
/** Expressão SQL: início do dia seguinte. */
export const fimDoDia = (data: string, fuso: string) => sql`((${data}::date + 1)::timestamp AT TIME ZONE ${fuso})`;

export interface Periodo {
  inicio: string;
  fim: string;
}

/** Período padrão: mês atual. Máximo de 366 dias. */
export function resolverPeriodo(fuso: string, inicio?: string, fim?: string): Periodo {
  const hoje = hojeNoFuso(fuso);
  const p = { inicio: inicio ?? `${hoje.slice(0, 7)}-01`, fim: fim ?? hoje };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(p.fim)) {
    throw erroValidacao('Datas do período devem estar no formato aaaa-mm-dd.');
  }
  if (p.fim < p.inicio) throw erroValidacao('A data final deve ser igual ou posterior à data inicial.', { fim: 'Anterior à data inicial.' });
  if (diasEntre(p.inicio, p.fim) + 1 > 366) {
    throw erroValidacao('O período máximo é de 366 dias. Diminua o intervalo de datas.', { fim: 'Período acima de 366 dias.' });
  }
  return p;
}

export function formatarDataBr(data: string | Date, fuso: string): string {
  const iso = typeof data === 'string' ? data : dataNoFuso(data, fuso);
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function formatarDataHoraBr(instante: Date, fuso: string): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: fuso,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instante);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return `${p('day')}/${p('month')}/${p('year')} ${p('hour')}:${p('minute')}`;
}
