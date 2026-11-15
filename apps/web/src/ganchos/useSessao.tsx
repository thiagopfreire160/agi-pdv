import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, aoPerderSessao, ErroApi } from '../api/cliente'
import type { Eu, Usuario } from '../api/tipos'
import { definirFuso } from '../utils/formatos'
import { useTema } from './useTema'

interface ContextoSessao {
  carregando: boolean
  primeiroAcesso: boolean
  eu: Eu | null
  usuario: Usuario | null
  recarregar: () => Promise<unknown>
  sair: () => Promise<void>
}

const Contexto = createContext<ContextoSessao | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { definirTema } = useTema()

  const pa = useQuery({
    queryKey: ['primeiro-acesso'],
    queryFn: () => api.get<{ necessario: boolean }>('/primeiro-acesso'),
    staleTime: Infinity,
    retry: 1,
  })

  const consultaEu = useQuery({
    queryKey: ['eu'],
    queryFn: async () => {
      try {
        return await api.get<Eu>('/auth/eu')
      } catch (e) {
        if (e instanceof ErroApi && e.status === 401) return null
        throw e
      }
    },
    enabled: pa.data?.necessario === false,
    staleTime: 30_000,
    retry: 1,
  })

  const eu = consultaEu.data ?? null

  useEffect(() => {
    if (eu?.empresa) definirFuso(eu.empresa.fuso_horario)
  }, [eu?.empresa])

  // Tema salvo no perfil vale em qualquer computador.
  useEffect(() => {
    if (eu?.usuario.tema) definirTema(eu.usuario.tema)
  }, [eu?.usuario.id, eu?.usuario.tema, definirTema])

  useEffect(
    () =>
      aoPerderSessao((erro) => {
        if (erro.codigo === 'TROCA_SENHA_OBRIGATORIA') {
          qc.invalidateQueries({ queryKey: ['eu'] })
          return
        }
        qc.setQueryData(['eu'], null)
      }),
    [qc],
  )

  const recarregar = useCallback(() => consultaEu.refetch(), [consultaEu])

  const sair = useCallback(async () => {
    try {
      await api.post('/auth/sair')
    } catch {
      /* sessão já caiu: segue para o login */
    }
    qc.clear()
    qc.setQueryData(['primeiro-acesso'], { necessario: false })
    qc.setQueryData(['eu'], null)
  }, [qc])

  const valor = useMemo<ContextoSessao>(
    () => ({
      carregando: pa.isLoading || (pa.data?.necessario === false && consultaEu.isLoading),
      primeiroAcesso: pa.data?.necessario === true,
      eu,
      usuario: eu?.usuario ?? null,
      recarregar,
      sair,
    }),
    [pa.isLoading, pa.data, consultaEu.isLoading, eu, recarregar, sair],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useSessao() {
  const c = useContext(Contexto)
  if (!c) throw new Error('useSessao fora do ProvedorSessao')
  return c
}

/** Usuário logado (use só dentro de rotas protegidas). */
export function useUsuario(): Usuario {
  const { usuario } = useSessao()
  if (!usuario) throw new Error('Sem usuário logado')
  return usuario
}
