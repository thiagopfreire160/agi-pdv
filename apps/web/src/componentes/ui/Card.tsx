import type { HTMLAttributes, ReactNode } from 'react'
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react'

export function Card({ className = '', compacto, children, ...resto }: HTMLAttributes<HTMLDivElement> & { compacto?: boolean }) {
  return (
    <div className={`rounded-[var(--radius-card)] bg-superficie p-5 shadow-[var(--shadow-card)] ${compacto ? '' : 'lg:p-6'} ${className}`} {...resto}>
      {children}
    </div>
  )
}

export function CabecalhoCard({ titulo, descricao, acoes, className = '' }: { titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode; className?: string }) {
  return (
    <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-texto">{titulo}</h2>
        {descricao && <p className="mt-0.5 text-xs font-medium text-texto-3">{descricao}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  )
}

interface PropsKpi {
  titulo: string
  valor: ReactNode
  rodape?: ReactNode
  destaque?: boolean
  variacao?: number | null
  icone?: ReactNode
  aoClicar?: () => void
}

/** KPI do dashboard. O primeiro usa `destaque` (card escuro com halo dourado e seta no círculo). */
export function CardKpi({ titulo, valor, rodape, destaque, variacao, icone, aoClicar }: PropsKpi) {
  const subiu = (variacao ?? 0) >= 0
  return (
    <div
      className={`relative flex min-h-[136px] flex-col justify-between overflow-hidden rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)] ${
        destaque ? 'card-destaque ondas' : 'bg-superficie'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`font-titulo text-[15px] font-semibold tracking-[-0.01em] ${destaque ? 'text-creme/90' : 'text-texto'}`}>{titulo}</p>
        <button
          type="button"
          onClick={aoClicar}
          tabIndex={aoClicar ? 0 : -1}
          aria-label={aoClicar ? `Abrir ${titulo}` : undefined}
          className={`flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
            destaque ? 'border-creme/40 bg-creme text-preto hover:bg-ouro-claro' : 'border-borda text-texto-2 hover:bg-superficie-2'
          } ${aoClicar ? '' : 'pointer-events-none'}`}
        >
          {icone ?? <ArrowUpRight size={18} strokeWidth={1.75} />}
        </button>
      </div>
      <p className={`tabular mt-3 text-[32px] leading-none font-bold tracking-tight whitespace-nowrap xl:text-[clamp(26px,2vw,36px)] ${destaque ? 'text-creme' : 'text-texto'}`}>{valor}</p>
      <div className={`mt-3 flex items-center gap-2 text-xs font-medium ${destaque ? 'text-creme-2' : 'text-texto-3'}`}>
        {variacao !== undefined && variacao !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
              destaque ? 'bg-creme/15 text-creme' : subiu ? 'bg-ok-bg text-ok-fg' : 'bg-erro-bg text-erro-fg'
            }`}
          >
            {subiu ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {variacao > 0 ? '+' : ''}
            {variacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
          </span>
        )}
        <span className="truncate">{rodape}</span>
      </div>
    </div>
  )
}
