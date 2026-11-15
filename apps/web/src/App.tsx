import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useSessao } from './ganchos/useSessao'
import type { Perfil } from './api/tipos'
import { pode } from './utils/permissoes'
import { LayoutApp } from './componentes/layout/LayoutApp'
import { Logo } from './componentes/ui/Logo'
import { PrimeiroAcesso } from './paginas/acesso/PrimeiroAcesso'
import { Login } from './paginas/acesso/Login'
import { TrocarSenha } from './paginas/acesso/TrocarSenha'

const Dashboard = lazy(() => import('./paginas/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })))
const FrenteCaixa = lazy(() => import('./paginas/caixa/FrenteCaixa').then((m) => ({ default: m.FrenteCaixa })))
const Vendas = lazy(() => import('./paginas/vendas/Vendas').then((m) => ({ default: m.Vendas })))
const Trocas = lazy(() => import('./paginas/trocas/Trocas').then((m) => ({ default: m.Trocas })))
const Produtos = lazy(() => import('./paginas/produtos/Produtos').then((m) => ({ default: m.Produtos })))
const Estoque = lazy(() => import('./paginas/estoque/Estoque').then((m) => ({ default: m.Estoque })))
const Clientes = lazy(() => import('./paginas/clientes/Clientes').then((m) => ({ default: m.Clientes })))
const Fornecedores = lazy(() => import('./paginas/fornecedores/Fornecedores').then((m) => ({ default: m.Fornecedores })))
const Relatorios = lazy(() => import('./paginas/relatorios/Relatorios').then((m) => ({ default: m.Relatorios })))
const Usuarios = lazy(() => import('./paginas/usuarios/Usuarios').then((m) => ({ default: m.Usuarios })))
const MinhaEmpresa = lazy(() => import('./paginas/empresa/MinhaEmpresa').then((m) => ({ default: m.MinhaEmpresa })))
const Configuracoes = lazy(() => import('./paginas/configuracoes/Configuracoes').then((m) => ({ default: m.Configuracoes })))
const Ajuda = lazy(() => import('./paginas/ajuda/Ajuda').then((m) => ({ default: m.Ajuda })))

function TelaCarregando() {
  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center gap-4 bg-fundo">
      <div className="animate-pulsar">
        <Logo tamanho={44} />
      </div>
    </div>
  )
}

/** Exige login (e troca de senha em dia). Guarda a tela atual para voltar depois do login. */
function Protegida({ children, permitido }: { children: ReactNode; permitido?: (p: Perfil) => boolean }) {
  const { carregando, primeiroAcesso, usuario } = useSessao()
  const local = useLocation()
  if (carregando) return <TelaCarregando />
  if (primeiroAcesso) return <Navigate to="/primeiro-acesso" replace />
  if (!usuario) {
    const voltar = local.pathname + local.search
    return <Navigate to={`/entrar${voltar && voltar !== '/' ? `?voltar=${encodeURIComponent(voltar)}` : ''}`} replace />
  }
  if (usuario.deve_trocar_senha) return <Navigate to="/trocar-senha" replace />
  if (permitido && !permitido(usuario.perfil)) return <Navigate to="/" replace />
  return <>{children}</>
}

function Inicio() {
  const { eu } = useSessao()
  return <Navigate to={eu?.tela_inicial === 'caixa' ? '/caixa' : '/dashboard'} replace />
}

export function App() {
  const { carregando, primeiroAcesso } = useSessao()
  if (carregando) return <TelaCarregando />
  return (
    <Suspense fallback={<TelaCarregando />}>
    <Routes>
      <Route path="/primeiro-acesso" element={primeiroAcesso ? <PrimeiroAcesso /> : <Navigate to="/" replace />} />
      <Route path="/entrar" element={primeiroAcesso ? <Navigate to="/primeiro-acesso" replace /> : <Login />} />
      <Route path="/trocar-senha" element={<TrocarSenha />} />
      <Route
        path="/caixa"
        element={
          <Protegida>
            <FrenteCaixa />
          </Protegida>
        }
      />
      <Route
        element={
          <Protegida>
            <LayoutApp />
          </Protegida>
        }
      >
        <Route index element={<Inicio />} />
        <Route path="dashboard" element={<Protegida permitido={pode.verDashboard}><Dashboard /></Protegida>} />
        <Route path="vendas" element={<Vendas />} />
        <Route path="trocas" element={<Trocas />} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="estoque" element={<Protegida permitido={pode.estoque}><Estoque /></Protegida>} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="fornecedores" element={<Protegida permitido={pode.fornecedores}><Fornecedores /></Protegida>} />
        <Route path="relatorios" element={<Protegida permitido={pode.relatorios}><Relatorios /></Protegida>} />
        <Route path="usuarios" element={<Protegida permitido={pode.gerirUsuarios}><Usuarios /></Protegida>} />
        <Route path="empresa" element={<Protegida permitido={pode.verEmpresa}><MinhaEmpresa /></Protegida>} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="ajuda" element={<Ajuda />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
