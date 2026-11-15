import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { dinheiroSemSimbolo, erroDocumento, mascararCep, mascararData, mascararDocumento, mascararTelefone, soDigitos } from '../../utils/formatos'

export const classeEntrada =
  'w-full h-11 rounded-[var(--radius-campo)] border border-borda bg-superficie-2 px-3.5 text-sm text-texto outline-none transition-colors focus:border-primaria focus:bg-superficie focus:ring-3 focus:ring-primaria/15 disabled:opacity-60 aria-[invalid=true]:border-erro-fg aria-[invalid=true]:ring-erro-fg/15'

interface PropsCampo {
  rotulo?: string
  ajuda?: ReactNode
  erro?: string | null
  obrigatorio?: boolean
  className?: string
  children: (id: string, extra: { 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode
}

/** Rótulo acima, ajuda e erro abaixo. */
export function Campo({ rotulo, ajuda, erro, obrigatorio, className = '', children }: PropsCampo) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {rotulo && (
        <label htmlFor={id} className="text-[13px] font-semibold text-texto-2">
          {rotulo}
          {obrigatorio && <span className="ml-0.5 text-erro-fg">*</span>}
        </label>
      )}
      {children(id, { 'aria-invalid': erro ? true : undefined, 'aria-describedby': erro || ajuda ? `${id}-d` : undefined })}
      {erro ? (
        <p id={`${id}-d`} className="text-xs font-medium text-erro-fg">{erro}</p>
      ) : ajuda ? (
        <p id={`${id}-d`} className="text-xs text-texto-3">{ajuda}</p>
      ) : null}
    </div>
  )
}

type Base = { rotulo?: string; ajuda?: ReactNode; erro?: string | null; obrigatorio?: boolean; className?: string; icone?: ReactNode; sufixo?: ReactNode }

export const CampoTexto = forwardRef<HTMLInputElement, Base & InputHTMLAttributes<HTMLInputElement>>(function CampoTexto(
  { rotulo, ajuda, erro, obrigatorio, className, icone, sufixo, ...resto },
  ref,
) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio} className={className}>
      {(id, extra) => (
        <div className="relative">
          {icone && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-texto-3">{icone}</span>}
          <input ref={ref} id={id} {...extra} {...resto} className={`${classeEntrada} ${icone ? 'pl-10' : ''} ${sufixo ? 'pr-12' : ''}`} />
          {sufixo && <span className="absolute top-1/2 right-2 -translate-y-1/2">{sufixo}</span>}
        </div>
      )}
    </Campo>
  )
})

export function Selecao({
  rotulo, ajuda, erro, obrigatorio, className, children, ...resto
}: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio} className={className}>
      {(id, extra) => (
        <div className="relative">
          <select id={id} {...extra} {...resto} className={`${classeEntrada} appearance-none pr-9`}>
            {children}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-texto-3" />
        </div>
      )}
    </Campo>
  )
}

export function AreaTexto({
  rotulo, ajuda, erro, obrigatorio, className, ...resto
}: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio} className={className}>
      {(id, extra) => <textarea id={id} rows={3} {...extra} {...resto} className={`${classeEntrada} h-auto py-2.5`} />}
    </Campo>
  )
}

type PropsDinheiro = Base & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  valor: number
  aoMudar: (centavos: number) => void
  grande?: boolean
}

/** Dinheiro em centavos; digitar só números preenche da direita para a esquerda (1234 -> 12,34). */
export const CampoDinheiro = forwardRef<HTMLInputElement, PropsDinheiro>(function CampoDinheiro(
  { rotulo, ajuda, erro, obrigatorio, className, valor, aoMudar, grande, ...resto },
  ref,
) {
  return (
    <Campo rotulo={rotulo} ajuda={ajuda} erro={erro} obrigatorio={obrigatorio} className={className}>
      {(id, extra) => (
        <div className="relative">
          <span className={`pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-texto-3 ${grande ? 'text-lg' : 'text-sm'}`}>R$</span>
          <input
            ref={ref}
            id={id}
            inputMode="numeric"
            autoComplete="off"
            {...extra}
            {...resto}
            value={dinheiroSemSimbolo(valor)}
            onChange={(e) => {
              const dig = soDigitos(e.target.value).replace(/^0+/, '').slice(0, 11)
              aoMudar(dig ? parseInt(dig, 10) : 0)
            }}
            onFocus={(e) => {
              const alvo = e.target
              requestAnimationFrame(() => alvo.setSelectionRange(alvo.value.length, alvo.value.length))
              resto.onFocus?.(e)
            }}
            className={`${classeEntrada} tabular text-right font-semibold ${grande ? 'h-14! pl-12 text-2xl!' : 'pl-10'}`}
          />
        </div>
      )}
    </Campo>
  )
})

type TipoMascara = 'telefone' | 'cep' | 'data' | 'documento' | 'cpf' | 'cnpj'
const mascaras: Record<TipoMascara, (v: string) => string> = {
  telefone: mascararTelefone,
  cep: mascararCep,
  data: mascararData,
  documento: mascararDocumento,
  cpf: mascararDocumento,
  cnpj: mascararDocumento,
}

type PropsMascara = Base & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  tipo: TipoMascara
  valor: string
  aoMudar: (valor: string) => void
}

/** Campo com máscara. Para documento valida CPF/CNPJ ao sair do campo. */
export const CampoMascara = forwardRef<HTMLInputElement, PropsMascara>(function CampoMascara(
  { tipo, valor, aoMudar, erro, onBlur, ...resto },
  ref,
) {
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const ehDoc = tipo === 'documento' || tipo === 'cpf' || tipo === 'cnpj'
  return (
    <CampoTexto
      ref={ref}
      inputMode="numeric"
      autoComplete="off"
      {...resto}
      erro={erro ?? erroLocal}
      value={mascaras[tipo](valor)}
      onChange={(e) => {
        setErroLocal(null)
        aoMudar(tipo === 'data' ? mascararData(e.target.value) : soDigitos(e.target.value))
      }}
      onBlur={(e) => {
        if (ehDoc) setErroLocal(erroDocumento(valor, tipo === 'documento' ? 'ambos' : tipo))
        onBlur?.(e)
      }}
      placeholder={
        resto.placeholder ??
        { telefone: '(00) 00000-0000', cep: '00000-000', data: 'dd/mm/aaaa', documento: 'CPF ou CNPJ', cpf: '000.000.000-00', cnpj: '00.000.000/0000-00' }[tipo]
      }
    />
  )
})

/** Interruptor liga/desliga com rótulo e descrição. */
export function Interruptor({
  rotulo, descricao, marcado, aoMudar, desabilitado,
}: { rotulo: string; descricao?: string; marcado: boolean; aoMudar: (v: boolean) => void; desabilitado?: boolean }) {
  const id = useId()
  return (
    <label htmlFor={id} className={`flex items-start justify-between gap-4 py-1 ${desabilitado ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-texto">{rotulo}</span>
        {descricao && <span className="text-xs text-texto-3">{descricao}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={marcado} disabled={desabilitado} onChange={(e) => aoMudar(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-borda transition-colors peer-checked:bg-primaria peer-focus-visible:ring-2 peer-focus-visible:ring-primaria/40" />
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

export function CaixaMarcar({ rotulo, marcado, aoMudar, desabilitado }: { rotulo: ReactNode; marcado: boolean; aoMudar: (v: boolean) => void; desabilitado?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-texto-2 ${desabilitado ? 'opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={marcado}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="size-4.5 rounded accent-[var(--primaria)]"
      />
      {rotulo}
    </label>
  )
}

/** Grupo de botões segmentados (ex.: Dia / Semana / Mês). */
export function Segmentado<T extends string>({
  opcoes, valor, aoMudar, tamanho = 'md', rotulo,
}: { opcoes: { valor: T; rotulo: string }[]; valor: T; aoMudar: (v: T) => void; tamanho?: 'sm' | 'md'; rotulo?: string }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex rounded-full bg-superficie-2 p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => aoMudar(o.valor)}
          className={`rounded-full font-semibold transition-colors ${tamanho === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-[13px]'} ${
            valor === o.valor ? 'bg-primaria text-sobre-primaria shadow-sm' : 'text-texto-2 hover:text-texto'
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  )
}

type PropsData = Base & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> & {
  /** Data em "aaaa-mm-dd" (ou vazio). */
  valor: string
  aoMudar: (iso: string) => void
}

/** Data digitada como dd/mm/aaaa (independe do idioma do navegador); devolve aaaa-mm-dd. */
export function CampoData({ valor, aoMudar, erro, ...resto }: PropsData) {
  const paraBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
  const [texto, setTexto] = useState(paraBr(valor))
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState(valor)
  if (valor !== ultimo) {
    setUltimo(valor)
    setTexto(paraBr(valor))
  }
  return (
    <CampoTexto
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      autoComplete="off"
      maxLength={10}
      {...resto}
      erro={erro ?? erroLocal}
      value={texto}
      onChange={(e) => {
        const t = mascararData(e.target.value)
        setTexto(t)
        setErroLocal(null)
        if (t.length === 10) {
          const [d, m, a] = t.split('/').map(Number)
          const dt = new Date(Date.UTC(a, m - 1, d))
          if (dt.getUTCDate() === d && dt.getUTCMonth() === m - 1) {
            const iso = `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            setUltimo(iso)
            aoMudar(iso)
          } else setErroLocal('Data inválida.')
        }
      }}
      onBlur={(e) => {
        if (texto && texto.length !== 10) setErroLocal('Use dd/mm/aaaa.')
        resto.onBlur?.(e)
      }}
    />
  )
}
