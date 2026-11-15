import type { Perfil } from '../api/tipos'

// Matriz da seção 2.2 (o front só esconde; a API sempre valida).
export const pode = {
  verDashboard: (p: Perfil) => p !== 'caixa',
  gerirUsuarios: (p: Perfil) => p !== 'caixa',
  verEmpresa: (p: Perfil) => p !== 'caixa',
  editarEmpresa: (p: Perfil) => p === 'administrador',
  configuracoesGerais: (p: Perfil) => p === 'administrador',
  editarCadastros: (p: Perfil) => p !== 'caixa',
  verCusto: (p: Perfil) => p !== 'caixa',
  fornecedores: (p: Perfil) => p !== 'caixa',
  estoque: (p: Perfil) => p !== 'caixa',
  relatorios: (p: Perfil) => p !== 'caixa',
  auditoria: (p: Perfil) => p === 'administrador',
  fecharCaixaDeOutro: (p: Perfil) => p !== 'caixa',
  cancelarVendaDireto: (p: Perfil) => p !== 'caixa',
  devolucaoDireto: (p: Perfil) => p !== 'caixa',
  cancelarVale: (p: Perfil) => p === 'administrador',
}
