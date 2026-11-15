import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

/** Estado vazio: explica o próximo passo. */
export function EstadoVazio({ titulo, descricao, icone, acao, compacto }: { titulo: string; descricao?: ReactNode; icone?: ReactNode; acao?: ReactNode; compacto?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compacto ? 'py-8' : 'py-14'}`}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-floresta-50 text-primaria dark:bg-superficie-2">
        {icone ?? <Inbox size={22} strokeWidth={1.75} />}
      </div>
      <p className="text-[15px] font-semibold text-texto">{titulo}</p>
      {descricao && <p className="mt-1 max-w-sm text-sm text-texto-3">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}

/** Bloco de carregamento. */
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`animate-pulsar rounded-xl bg-superficie-2 ${className}`} aria-hidden="true" />
}

export function EsqueletoLinhas({ linhas = 6, colunas = 5 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="flex flex-col gap-3 py-2" aria-label="Carregando" role="status">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: colunas }).map((__, j) => (
            <Esqueleto key={j} className={`h-5 ${j === 1 ? 'flex-[2]' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Chip de tecla de atalho. */
export function Atalho({ tecla, rotulo, escuro, aoClicar }: { tecla: string; rotulo?: string; escuro?: boolean; aoClicar?: () => void }) {
  const Tag = aoClicar ? 'button' : 'span'
  return (
    <Tag
      type={aoClicar ? 'button' : undefined}
      onClick={aoClicar}
      className={`inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs font-semibold whitespace-nowrap transition-colors ${
        escuro ? 'bg-white/8 text-white/80 hover:bg-white/14' : 'bg-superficie text-texto-2 shadow-[var(--shadow-card)] hover:text-texto'
      } ${rotulo ? '' : 'pr-1'}`}
    >
      <kbd
        className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-sans text-[11px] font-bold ${
          escuro ? 'bg-white/15 text-white' : 'bg-primaria text-sobre-primaria'
        }`}
      >
        {tecla}
      </kbd>
      {rotulo}
    </Tag>
  )
}
