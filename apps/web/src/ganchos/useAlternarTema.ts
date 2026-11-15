import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/cliente'
import type { Tema, Usuario } from '../api/tipos'
import { useTema } from './useTema'

/** Troca o tema e salva no perfil do usuário (vale em qualquer computador). */
export function useAlternarTema() {
  const { escuro, alternar, definirTema } = useTema()
  const qc = useQueryClient()
  const salvar = async (t: Tema) => {
    try {
      const u = await api.put<Usuario>('/auth/perfil', { tema: t })
      qc.setQueryData(['eu'], (eu: unknown) => (eu && typeof eu === 'object' ? { ...(eu as object), usuario: u } : eu))
    } catch {
      /* sem conexão: a preferência fica só neste computador */
    }
  }
  return {
    escuro,
    alternar: () => salvar(alternar()),
    escolher: (t: Tema) => {
      definirTema(t)
      return salvar(t)
    },
  }
}
