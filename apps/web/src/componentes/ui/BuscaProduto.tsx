import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api } from '../../api/cliente'
import type { Produto } from '../../api/tipos'
import { useAtraso } from '../../ganchos/useAtraso'
import { dinheiro, quantidade } from '../../utils/formatos'
import { Campo, classeEntrada } from './Campo'

interface Props {
  rotulo?: string
  aoEscolher: (p: Produto) => void
  placeholder?: string
  filtrar?: (p: Produto) => boolean
  limparAoEscolher?: boolean
  valorInicial?: string
  erro?: string | null
  autoFocus?: boolean
  className?: string
  /** Mostrado quando nada é encontrado (ex.: cadastro rápido). */
  semResultado?: (texto: string) => React.ReactNode
}

/** Campo de busca de produto com lista suspensa (nome, código ou leitor). */
export function BuscaProduto({ rotulo, aoEscolher, placeholder, filtrar, limparAoEscolher = true, valorInicial = '', erro, autoFocus, className, semResultado }: Props) {
  const [texto, setTexto] = useState(valorInicial)
  const [aberto, setAberto] = useState(false)
  const [sel, setSel] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const atraso = useAtraso(texto.trim(), 200)
  const q = useQuery({
    queryKey: ['busca-produto', atraso],
    queryFn: () => api.get<{ itens: Produto[] }>('/produtos/busca', { q: atraso }).then((r) => r.itens),
    enabled: atraso.length > 0 && aberto,
  })
  const itens = (q.data ?? []).filter((p) => (filtrar ? filtrar(p) : true))

  useEffect(() => setSel(0), [atraso])
  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [])

  function escolher(p: Produto) {
    aoEscolher(p)
    setTexto(limparAoEscolher ? '' : p.nome)
    setAberto(false)
  }

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <Campo rotulo={rotulo} erro={erro}>
        {(id, extra) => (
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-3" />
            <input
              id={id}
              {...extra}
              autoFocus={autoFocus}
              autoComplete="off"
              value={texto}
              placeholder={placeholder ?? 'Nome, código ou código de barras'}
              onChange={(e) => { setTexto(e.target.value); setAberto(true) }}
              onFocus={() => texto && setAberto(true)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(itens.length - 1, s + 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (itens[sel]) escolher(itens[sel])
                }
                if (e.key === 'Escape' && aberto) { e.stopPropagation(); setAberto(false) }
              }}
              className={`${classeEntrada} pl-10`}
            />
          </div>
        )}
      </Campo>
      {aberto && atraso && (
        <div className="absolute right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-2xl bg-superficie p-1.5 shadow-[var(--shadow-flutuante)] ring-1 ring-borda">
          {q.isLoading ? (
            <p className="p-3 text-sm text-texto-3">Buscando...</p>
          ) : itens.length === 0 ? (
            <div className="p-3 text-sm text-texto-3">
              Nenhum produto encontrado.
              {semResultado?.(texto)}
            </div>
          ) : (
            itens.map((p, i) => (
              <button
                type="button"
                key={p.id}
                onMouseEnter={() => setSel(i)}
                onClick={() => escolher(p)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${i === sel ? 'bg-floresta-50 dark:bg-superficie-2' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-texto">{p.nome}</span>
                  <span className="tabular text-xs text-texto-3">{p.codigo}{p.codigo_barras ? ` · ${p.codigo_barras}` : ''}</span>
                </span>
                <span className="tabular text-xs text-texto-3">{p.controla_estoque ? `${quantidade(p.estoque_atual, p.unidade)} ${p.unidade}` : ''}</span>
                <span className="tabular text-sm font-semibold text-texto">{dinheiro(p.preco_venda)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
