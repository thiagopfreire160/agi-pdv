/** CSV para Excel em português: UTF-8 com BOM, ";" como separador, vírgula decimal. */

export type ValorCsv = string | number | null | undefined | boolean;

function escapar(v: ValorCsv): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCsv(cabecalho: string[], linhas: ValorCsv[][]): string {
  const corpo = [cabecalho, ...linhas].map((l) => l.map(escapar).join(';')).join('\r\n');
  return `﻿${corpo}\r\n`;
}

/** 123456 → "1234,56" */
export function moedaCsv(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return '';
  const neg = centavos < 0;
  const abs = Math.abs(Math.round(centavos));
  return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** 1.5 → "1,5" ; 12.345 → "12,345" */
export function numeroCsv(n: number | null | undefined, casas?: number): string {
  if (n === null || n === undefined) return '';
  const texto = casas === undefined ? String(Number(n.toFixed(3))) : n.toFixed(casas);
  return texto.replace('.', ',');
}
