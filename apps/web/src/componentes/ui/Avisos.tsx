import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { Modal } from './Modal'
import { Botao } from './Botao'
import { AreaTexto } from './Campo'

type TipoToast = 'sucesso' | 'erro' | 'info'
interface ToastItem { id: number; tipo: TipoToast; texto: string }

interface OpcoesConfirmacao {
  titulo: string
  mensagem?: ReactNode
  confirmar: string
  cancelar?: string
  perigo?: boolean
  /** Pede um motivo (texto) antes de confirmar. */
  pedirMotivo?: { rotulo: string; minimo?: number; obrigatorio?: boolean }
}

interface ContextoAvisos {
  toast: (texto: string, tipo?: TipoToast) => void
  sucesso: (texto: string) => void
  erro: (texto: string) => void
  /** Resolve com o motivo (ou '' sem motivo) quando confirmado; null quando cancelado. */
  confirmar: (op: OpcoesConfirmacao) => Promise<string | null>
}

const Contexto = createContext<ContextoAvisos | null>(null)

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const [conf, setConf] = useState<(OpcoesConfirmacao & { resolver: (v: string | null) => void }) | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)

  const fecharToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (texto: string, tipo: TipoToast = 'info') => {
      const id = ++seq.current
      setToasts((t) => [...t.slice(-3), { id, tipo, texto }])
      setTimeout(() => fecharToast(id), tipo === 'erro' ? 6500 : 4000)
    },
    [fecharToast],
  )

  const confirmar = useCallback(
    (op: OpcoesConfirmacao) =>
      new Promise<string | null>((resolver) => {
        setMotivo('')
        setErroMotivo(null)
        setConf({ ...op, resolver })
      }),
    [],
  )

  const valor = useMemo<ContextoAvisos>(
    () => ({ toast, sucesso: (t) => toast(t, 'sucesso'), erro: (t) => toast(t, 'erro'), confirmar }),
    [toast, confirmar],
  )

  const responder = (ok: boolean) => {
    if (!conf) return
    if (ok && conf.pedirMotivo) {
      const min = conf.pedirMotivo.minimo ?? 3
      if ((conf.pedirMotivo.obrigatorio ?? true) && motivo.trim().length < min) {
        setErroMotivo(`Escreva o motivo (pelo menos ${min} letras).`)
        return
      }
    }
    conf.resolver(ok ? motivo.trim() : null)
    setConf(null)
  }

  return (
    <Contexto.Provider value={valor}>
      {children}
      <Modal
        aberto={!!conf}
        aoFechar={() => responder(false)}
        titulo={conf?.titulo}
        largura="sm"
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => responder(false)}>
              {conf?.cancelar ?? 'Voltar'}
            </Botao>
            <Botao data-primario variante={conf?.perigo ? 'perigo' : 'primario'} onClick={() => responder(true)}>
              {conf?.confirmar}
            </Botao>
          </>
        }
      >
        {conf?.mensagem && <div className="text-sm text-texto-2">{conf.mensagem}</div>}
        {conf?.pedirMotivo && (
          <AreaTexto
            className="mt-4"
            rotulo={conf.pedirMotivo.rotulo}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            erro={erroMotivo}
            data-autofoco
            maxLength={500}
          />
        )}
      </Modal>
      {createPortal(
        <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.tipo === 'erro' ? 'alert' : 'status'}
              className="animate-entrar pointer-events-auto flex items-start gap-3 rounded-2xl bg-superficie p-4 shadow-[var(--shadow-flutuante)] ring-1 ring-borda"
            >
              <span
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                  t.tipo === 'sucesso' ? 'bg-ok-bg text-ok-fg' : t.tipo === 'erro' ? 'bg-erro-bg text-erro-fg' : 'bg-info-bg text-info-fg'
                }`}
              >
                {t.tipo === 'sucesso' ? <CircleCheck size={16} /> : t.tipo === 'erro' ? <CircleAlert size={16} /> : <Info size={16} />}
              </span>
              <p className="flex-1 pt-1 text-sm font-medium text-texto">{t.texto}</p>
              <button type="button" onClick={() => fecharToast(t.id)} aria-label="Fechar aviso" className="text-texto-3 hover:text-texto">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Contexto.Provider>
  )
}

export function useAvisos() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useAvisos fora do ProvedorAvisos')
  return c
}
