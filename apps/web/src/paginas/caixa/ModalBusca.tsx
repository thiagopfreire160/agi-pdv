import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Modal } from '../../componentes/ui/Modal'
import { api } from '../../api/cliente'
import type { Produto } from '../../api/tipos'
import { useAtraso } from '../../ganchos/useAtraso'
import { dinheiro, quantidade } from '../../utils/formatos'
import { EstadoVazio, EsqueletoLinhas } from '../../componentes/ui/Estados'
import { Pilula } from '../../componentes/ui/Pilula'

/** Busca de produto (F2): nome, código ou código de barras; setas e Enter. */
export function ModalBusca({ aberto, textoInicial, aoFechar, aoEscolher }: { aberto: boolean; textoInicial: string; aoFechar: () => void; aoEscolher: (p: Produto) => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const lista = useRef<HTMLUListElement>(null)
  const atraso = useAtraso(q.trim(), 200)

  useEffect(() => {
    if (aberto) {
      setQ(textoInicial)
      setSel(0)
    }
  }, [aberto, textoInicial])

  const r = useQuery({
    queryKey: ['busca-caixa', atraso],
    queryFn: () => api.get<{ itens: Produto[] }>('/produtos/busca', { q: atraso }).then((x) => x.itens),
    enabled: aberto && atraso.length > 0,
    staleTime: 10_000,
  })
  const itens = r.data ?? []

  useEffect(() => setSel(0), [atraso])
  useEffect(() => {
    lista.current?.children[sel]?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  function tecla(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(itens.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (itens[sel]) aoEscolher(itens[sel])
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Buscar produto" descricao="Digite parte do nome ou do código. Use as setas e Enter para escolher." largura="lg">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-texto-3" />
        <input
          data-autofoco
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={tecla}
          placeholder="Ex.: arroz, 000012 ou 7891000..."
          aria-label="Buscar produto"
          className="h-12 w-full rounded-[var(--radius-campo)] border border-borda bg-superficie-2 pr-4 pl-11 text-[15px] text-texto outline-none focus:border-primaria focus:bg-superficie"
        />
      </div>
      <div className="mt-4 min-h-[280px]">
        {!atraso ? (
          <EstadoVazio compacto titulo="Comece a digitar" descricao="Aparecem até 20 produtos ativos." icone={<Search size={22} />} />
        ) : r.isLoading ? (
          <EsqueletoLinhas linhas={5} colunas={3} />
        ) : itens.length === 0 ? (
          <EstadoVazio compacto titulo="Nenhum produto encontrado" descricao="Confira a escrita ou procure pelo código." />
        ) : (
          <ul ref={lista} role="listbox" className="flex max-h-[360px] flex-col gap-1 overflow-y-auto">
            {itens.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === sel}
                onMouseEnter={() => setSel(i)}
                onClick={() => aoEscolher(p)}
                className={`flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3 ${i === sel ? 'bg-selecao ring-1 ring-primaria/30' : 'hover:bg-superficie-2'}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-texto">{p.nome}</p>
                  <p className="tabular text-xs text-texto-3">
                    {p.codigo}
                    {p.codigo_barras ? ` · ${p.codigo_barras}` : ''} · {p.unidade}
                  </p>
                </div>
                {p.controla_estoque &&
                  (p.estoque_atual <= 0 ? <Pilula tom="erro">Sem estoque</Pilula> : p.estoque_baixo ? <Pilula tom="aviso">Estoque baixo</Pilula> : null)}
                <span className="tabular w-20 text-right text-xs text-texto-3">{p.controla_estoque ? `${quantidade(p.estoque_atual, p.unidade)} ${p.unidade}` : '—'}</span>
                <span className="tabular w-24 text-right text-sm font-bold text-texto">{dinheiro(p.preco_venda)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
