import type { ReactNode } from 'react'

export type TomPilula = 'ok' | 'aviso' | 'erro' | 'info' | 'neutro'

const tons: Record<TomPilula, string> = {
  ok: 'bg-ok-bg text-ok-fg border-ok-fg/20',
  aviso: 'bg-aviso-bg text-aviso-fg border-aviso-fg/20',
  erro: 'bg-erro-bg text-erro-fg border-erro-fg/20',
  info: 'bg-info-bg text-info-fg border-info-fg/20',
  neutro: 'bg-superficie-2 text-texto-2 border-borda',
}

/** Status sempre em pílula com fundo suave e texto escuro. */
export function Pilula({ tom = 'neutro', children, className = '' }: { tom?: TomPilula; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tons[tom]} ${className}`}>
      {children}
    </span>
  )
}

/** Badge numérico (ex.: contagem no menu). */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="tabular inline-flex min-w-6 items-center justify-center rounded-full bg-primaria px-1.5 py-0.5 text-[11px] font-bold text-sobre-primaria">
      {children}
    </span>
  )
}
