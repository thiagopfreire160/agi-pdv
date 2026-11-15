import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { EstadoVazio, EsqueletoLinhas } from './Estados'

export interface Coluna<T> {
  chave: string
  titulo: ReactNode
  render: (linha: T, indice: number) => ReactNode
  alinhar?: 'esquerda' | 'direita' | 'centro'
  largura?: string
  /** Esconde em telas pequenas. */
  ocultarCelular?: boolean
}

interface Props<T> {
  colunas: Coluna<T>[]
  linhas: T[] | undefined
  chaveLinha: (l: T) => string
  carregando?: boolean
  vazio?: { titulo: string; descricao?: ReactNode; acao?: ReactNode }
  aoClicarLinha?: (l: T) => void
  rodape?: ReactNode
  alturaMax?: string
  classeLinha?: (l: T) => string
  linhaSelecionada?: string | null
}

const alin = { esquerda: 'text-left', direita: 'text-right', centro: 'text-center' }

/** Tabela com cabeçalho fixo, estado vazio e esqueleto de carregamento. */
export function Tabela<T>({ colunas, linhas, chaveLinha, carregando, vazio, aoClicarLinha, rodape, alturaMax, classeLinha, linhaSelecionada }: Props<T>) {
  if (carregando && !linhas) return <EsqueletoLinhas colunas={Math.min(colunas.length, 6)} />
  if (!linhas || linhas.length === 0)
    return <EstadoVazio titulo={vazio?.titulo ?? 'Nada para mostrar'} descricao={vazio?.descricao} acao={vazio?.acao} />

  return (
    <div className={`-mx-5 overflow-auto lg:-mx-6 ${alturaMax ?? ''}`}>
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="sticky top-0 z-[1] bg-superficie">
          <tr>
            {colunas.map((c) => (
              <th
                key={c.chave}
                style={c.largura ? { width: c.largura } : undefined}
                className={`border-b border-borda px-3 py-3 text-xs font-semibold tracking-wide text-texto-3 uppercase first:pl-5 last:pr-5 lg:first:pl-6 lg:last:pr-6 ${alin[c.alinhar ?? 'esquerda']} ${c.ocultarCelular ? 'hidden md:table-cell' : ''}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={carregando ? 'opacity-60' : ''}>
          {linhas.map((l, i) => {
            const chave = chaveLinha(l)
            return (
              <tr
                key={chave}
                onClick={aoClicarLinha ? () => aoClicarLinha(l) : undefined}
                className={`border-b border-borda/70 transition-colors last:border-0 ${aoClicarLinha ? 'cursor-pointer hover:bg-superficie-2' : ''} ${
                  linhaSelecionada === chave ? 'bg-floresta-50 dark:bg-superficie-2' : ''
                } ${classeLinha?.(l) ?? ''}`}
              >
                {colunas.map((c) => (
                  <td
                    key={c.chave}
                    className={`px-3 py-3 text-texto-2 first:pl-5 last:pr-5 lg:first:pl-6 lg:last:pr-6 ${alin[c.alinhar ?? 'esquerda']} ${c.ocultarCelular ? 'hidden md:table-cell' : ''}`}
                  >
                    {c.render(l, i)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {rodape && (
          <tfoot className="sticky bottom-0 bg-superficie">
            <tr>
              <td colSpan={colunas.length} className="border-t border-borda px-5 py-3 lg:px-6">
                {rodape}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export function Paginacao({ pagina, total, porPagina, aoMudar }: { pagina: number; total: number; porPagina: number; aoMudar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  if (total <= porPagina) return null
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm">
      <p className="text-xs text-texto-3">
        {(pagina - 1) * porPagina + 1}–{Math.min(pagina * porPagina, total)} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pagina <= 1}
          onClick={() => aoMudar(pagina - 1)}
          className="flex size-9 items-center justify-center rounded-full border border-borda text-texto-2 hover:bg-superficie-2 disabled:opacity-40"
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="tabular px-2 text-xs font-semibold text-texto-2">
          {pagina} / {paginas}
        </span>
        <button
          type="button"
          disabled={pagina >= paginas}
          onClick={() => aoMudar(pagina + 1)}
          className="flex size-9 items-center justify-center rounded-full border border-borda text-texto-2 hover:bg-superficie-2 disabled:opacity-40"
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
