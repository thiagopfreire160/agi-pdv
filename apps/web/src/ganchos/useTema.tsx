import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Tema } from '../api/tipos'

const CHAVE = 'agipdv-tema'

function lerTemaSalvo(): Tema {
  try {
    const t = localStorage.getItem(CHAVE)
    if (t === 'claro' || t === 'escuro' || t === 'sistema') return t
  } catch {
    /* navegador sem localStorage: usa o padrão */
  }
  return 'escuro'
}

function salvarTema(t: Tema) {
  try {
    localStorage.setItem(CHAVE, t)
  } catch {
    /* ignora */
  }
}

function sistemaEscuro() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

interface ContextoTema {
  tema: Tema
  escuro: boolean
  definirTema: (t: Tema) => void
  alternar: () => Tema
}

const Contexto = createContext<ContextoTema | null>(null)

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerTemaSalvo)
  const [sisEscuro, setSisEscuro] = useState(sistemaEscuro)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const f = () => setSisEscuro(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])

  const escuro = tema === 'escuro' || (tema === 'sistema' && sisEscuro)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', escuro)
  }, [escuro])

  const definirTema = useCallback((t: Tema) => {
    setTema(t)
    salvarTema(t)
  }, [])

  const alternar = useCallback(() => {
    const novo: Tema = escuro ? 'claro' : 'escuro'
    definirTema(novo)
    return novo
  }, [escuro, definirTema])

  const valor = useMemo(() => ({ tema, escuro, definirTema, alternar }), [tema, escuro, definirTema, alternar])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useTema() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useTema fora do ProvedorTema')
  return c
}
