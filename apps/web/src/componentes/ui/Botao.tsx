import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

type Variante = 'primario' | 'contorno' | 'fantasma' | 'perigo' | 'suave'
type Tamanho = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  tamanho?: Tamanho
  carregando?: boolean
  icone?: ReactNode
  larguraTotal?: boolean
}

const variantes: Record<Variante, string> = {
  primario: 'bg-primaria text-sobre-primaria hover:bg-primaria-hover shadow-sm disabled:bg-borda disabled:text-texto-3 disabled:shadow-none disabled:opacity-100',
  contorno: 'border-[1.5px] border-primaria/70 text-primaria hover:bg-floresta-50 dark:hover:bg-superficie-2 bg-transparent',
  fantasma: 'text-texto-2 hover:bg-superficie-2 hover:text-texto bg-transparent',
  perigo: 'bg-erro text-white hover:brightness-95 shadow-sm',
  suave: 'bg-superficie-2 text-texto hover:bg-floresta-50 dark:hover:bg-floresta-900/60',
}

const tamanhos: Record<Tamanho, string> = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-[10px]',
  md: 'h-11 px-4 text-sm gap-2 rounded-[var(--radius-campo)]',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-[var(--radius-campo)]',
}

export const Botao = forwardRef<HTMLButtonElement, Props>(function Botao(
  { variante = 'primario', tamanho = 'md', carregando, icone, larguraTotal, className = '', children, disabled, type = 'button', ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors select-none disabled:opacity-55 ${variantes[variante]} ${tamanhos[tamanho]} ${larguraTotal ? 'w-full' : ''} ${className}`}
      {...resto}
    >
      {carregando ? <LoaderCircle size={18} strokeWidth={2} className="animate-spin" /> : icone}
      {children}
    </button>
  )
})

/** Botão quadrado só com ícone (sempre com rótulo acessível). */
export function BotaoIcone({
  rotulo, children, className = '', ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { rotulo: string }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-borda bg-superficie text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto ${className}`}
      {...resto}
    >
      {children}
    </button>
  )
}
