import { useQuery } from '@tanstack/react-query'
import { api } from './cliente'
import type { Categoria, Configuracoes, EmpresaRecibo, Fornecedor, Lista, Recibo, Usuario } from './tipos'

export const useConfiguracoes = () =>
  useQuery({ queryKey: ['configuracoes'], queryFn: () => api.get<Configuracoes>('/configuracoes'), staleTime: 60_000 })

export const useCategorias = (situacao: 'ativos' | 'todos' = 'ativos') =>
  useQuery({
    queryKey: ['categorias', situacao],
    queryFn: () => api.get<{ itens: Categoria[] }>('/categorias', { situacao }).then((r) => r.itens),
    staleTime: 60_000,
  })

export const useFornecedoresAtivos = (habilitado = true) =>
  useQuery({
    queryKey: ['fornecedores', 'ativos-todos'],
    queryFn: () => api.get<Lista<Fornecedor>>('/fornecedores', { situacao: 'ativos', por_pagina: 200 }).then((r) => r.itens),
    staleTime: 60_000,
    enabled: habilitado,
  })

export const useOperadores = (habilitado = true) =>
  useQuery({
    queryKey: ['usuarios', 'operadores'],
    queryFn: () => api.get<Lista<Usuario>>('/usuarios', { situacao: 'todos', por_pagina: 200 }).then((r) => r.itens),
    staleTime: 120_000,
    enabled: habilitado,
  })

/** Cabeçalho da empresa para comprovantes (vem do recibo de teste). */
export const useEmpresaRecibo = () =>
  useQuery({
    queryKey: ['recibo-teste'],
    queryFn: () => api.get<Recibo>('/configuracoes/recibo-teste'),
    staleTime: 300_000,
    select: (r): { empresa: EmpresaRecibo; papel: Recibo['configuracao']['papel_recibo'] } => ({ empresa: r.empresa, papel: r.configuracao.papel_recibo }),
  })
