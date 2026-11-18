import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Pilha de janelas abertas: Esc fecha só a do topo.
const pilha: string[] = []
export const haJanelaAberta = () => pilha.length > 0

function useJanela(aberto: boolean, aoFechar: () => void, fecharComEsc = true) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar

  useEffect(() => {
    if (!aberto) return
    pilha.push(id)
    const anterior = document.activeElement as HTMLElement | null
    const t = setTimeout(() => {
      const alvo = ref.current?.querySelector<HTMLElement>('[data-autofoco], input:not([type=hidden]):not([disabled]), select, textarea, button[data-primario]')
      ;(alvo ?? ref.current)?.focus()
    }, 30)
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pilha[pilha.length - 1] === id) {
        e.preventDefault()
        e.stopPropagation()
        if (fecharComEsc) fechar.current()
      }
    }
    window.addEventListener('keydown', tecla, true)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      const i = pilha.indexOf(id)
      if (i >= 0) pilha.splice(i, 1)
      window.removeEventListener('keydown', tecla, true)
      if (pilha.length === 0) document.body.style.overflow = ''
      anterior?.focus?.()
    }
  }, [aberto, id, fecharComEsc])
  return ref
}

interface PropsModal {
  aberto: boolean
  aoFechar: () => void
  titulo: ReactNode
  descricao?: ReactNode
  children: ReactNode
  rodape?: ReactNode
  largura?: 'sm' | 'md' | 'lg' | 'xl'
  fecharComEsc?: boolean
}

const larguras = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export function Modal({ aberto, aoFechar, titulo, descricao, children, rodape, largura = 'md', fecharComEsc = true }: PropsModal) {
  const ref = useJanela(aberto, aoFechar, fecharComEsc)
  const idTitulo = useId()
  if (!aberto) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <div className="absolute inset-0 bg-veu backdrop-blur-[2px]" onClick={aoFechar} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={`animate-entrar relative flex max-h-[92vh] w-full ${larguras[largura]} flex-col rounded-t-[var(--radius-card)] bg-superficie shadow-[var(--shadow-flutuante)] outline-none sm:rounded-[var(--radius-card)]`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            <h2 id={idTitulo} className="text-lg font-bold text-texto">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-texto-3">{descricao}</p>}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="-mr-2 flex size-9 items-center justify-center rounded-full text-texto-3 hover:bg-superficie-2 hover:text-texto">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-5">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2.5 border-t border-borda px-6 py-4">{rodape}</div>}
      </div>
    </div>,
    document.body,
  )
}

interface PropsGaveta {
  aberto: boolean
  aoFechar: () => void
  titulo: ReactNode
  descricao?: ReactNode
  children: ReactNode
  rodape?: ReactNode
  largura?: string
}

/** Formulário lateral de cadastro. */
export function Gaveta({ aberto, aoFechar, titulo, descricao, children, rodape, largura = 'max-w-xl' }: PropsGaveta) {
  const ref = useJanela(aberto, aoFechar)
  const idTitulo = useId()
  if (!aberto) return null
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <div className="absolute inset-0 bg-veu backdrop-blur-[1px]" onClick={aoFechar} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={`animate-gaveta relative m-0 flex h-full w-full ${largura} flex-col bg-superficie shadow-[var(--shadow-flutuante)] outline-none sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-[var(--radius-card)]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-borda px-6 py-5">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-lg font-bold text-texto">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-sm text-texto-3">{descricao}</p>}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="-mr-2 flex size-9 items-center justify-center rounded-full text-texto-3 hover:bg-superficie-2 hover:text-texto">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {rodape && <div className="flex flex-wrap justify-end gap-2.5 border-t border-borda px-6 py-4">{rodape}</div>}
      </div>
    </div>,
    document.body,
  )
}
