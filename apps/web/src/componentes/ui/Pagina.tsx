import type { ReactNode } from 'react'

/** Cabeçalho da página: título e frase curta à esquerda, ações à direita. */
export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-titulo text-2xl font-extrabold tracking-[-0.035em] text-texto lg:text-[28px]">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-texto-3">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2.5">{acoes}</div>}
    </div>
  )
}

export function Abas<T extends string>({
  abas, ativa, aoMudar,
}: { abas: { valor: T; rotulo: string; contagem?: number }[]; ativa: T; aoMudar: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-superficie p-1.5 shadow-[var(--shadow-card)] sm:inline-flex">
      {abas.map((a) => (
        <button
          key={a.valor}
          role="tab"
          type="button"
          aria-selected={ativa === a.valor}
          onClick={() => aoMudar(a.valor)}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
            ativa === a.valor ? 'bg-selecao text-primaria' : 'text-texto-2 hover:text-texto'
          }`}
        >
          {a.rotulo}
          {a.contagem !== undefined && a.contagem > 0 && (
            <span className="tabular rounded-full bg-aviso-bg px-1.5 text-[11px] font-bold text-aviso-fg">{a.contagem}</span>
          )}
        </button>
      ))}
    </div>
  )
}

/** Barra de filtros acima de tabelas. */
export function BarraFiltros({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>
}
