import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Bell, CircleHelp, Menu as IconeMenu, Moon, Search, Sun, X } from 'lucide-react'
import { GERAL, ICONE_SAIR, MENU, type ItemMenu } from './menu'
import { Logo } from '../ui/Logo'
import { Esqueleto } from '../ui/Estados'
import { useSessao, useUsuario } from '../../ganchos/useSessao'
import { useAlternarTema } from '../../ganchos/useAlternarTema'
import { useAvisos } from '../ui/Avisos'
import { api } from '../../api/cliente'
import { iniciais, NOMES_PERFIL } from '../../utils/formatos'
import { pode } from '../../utils/permissoes'
import { haVendaEmAndamento } from '../../paginas/caixa/vendaLocal'

function ItemNav({ item, aoNavegar }: { item: ItemMenu; aoNavegar?: () => void }) {
  const Icone = item.icone
  return (
    <NavLink
      to={item.caminho}
      onClick={aoNavegar}
      className={({ isActive }) =>
        `group relative flex h-10 items-center gap-3 rounded-xl px-3.5 text-[14px] font-medium transition-colors ${
          isActive ? 'bg-floresta-50 font-semibold text-primaria dark:bg-superficie-2' : 'text-texto-2 hover:bg-superficie-2 hover:text-texto'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-primaria" />}
          <Icone size={18} strokeWidth={1.75} />
          {item.rotulo}
        </>
      )}
    </NavLink>
  )
}

export function useSair() {
  const { sair } = useSessao()
  const { confirmar } = useAvisos()
  const navegar = useNavigate()
  return async () => {
    if (haVendaEmAndamento()) {
      const ok = await confirmar({
        titulo: 'Sair com venda em andamento?',
        mensagem: 'A venda que está no caixa deste computador será descartada. O caixa continua aberto.',
        confirmar: 'Sair e descartar venda',
        perigo: true,
      })
      if (ok === null) return
      try {
        localStorage.removeItem('nexo-venda-andamento')
      } catch {
        /* ignora */
      }
    }
    await sair()
    navegar('/entrar', { replace: true })
  }
}

function Sidebar({ aoNavegar }: { aoNavegar?: () => void }) {
  const usuario = useUsuario()
  const sair = useSair()
  const menu = MENU.filter((m) => m.permitido(usuario.perfil))
  const geral = GERAL.filter((m) => m.permitido(usuario.perfil))
  return (
    <div className="flex h-full flex-col overflow-y-auto px-5 py-5">
      <div className="mb-5 px-1.5">
        <Logo tamanho={34} />
      </div>
      <p className="mb-2 px-3.5 text-[11px] font-semibold tracking-[0.12em] text-texto-3 uppercase">Menu</p>
      <nav className="flex flex-col gap-0.5" aria-label="Menu">
        {menu.map((m) => (
          <ItemNav key={m.caminho} item={m} aoNavegar={aoNavegar} />
        ))}
      </nav>
      <p className="mt-5 mb-2 px-3.5 text-[11px] font-semibold tracking-[0.12em] text-texto-3 uppercase">Geral</p>
      <nav className="flex flex-col gap-0.5" aria-label="Geral">
        {geral.map((m) => (
          <ItemNav key={m.caminho} item={m} aoNavegar={aoNavegar} />
        ))}
        <button
          type="button"
          onClick={sair}
          className="flex h-10 items-center gap-3 rounded-xl px-3.5 text-[14px] font-medium text-texto-2 transition-colors hover:bg-superficie-2 hover:text-texto"
        >
          <ICONE_SAIR size={18} strokeWidth={1.75} />
          Sair
        </button>
      </nav>
      <div className="mt-auto pt-5">
        <div className="card-escuro ondas rounded-[18px] p-4">
          <p className="flex items-center gap-2 text-[15px] font-bold text-white">
            <CircleHelp size={18} strokeWidth={1.75} className="text-broto-300" />
            Precisa de ajuda?
          </p>
          <p className="mt-1 text-xs text-white/65 [@media(max-height:940px)]:hidden">Atalhos do caixa e passos básicos.</p>
          <NavLink
            to="/ajuda"
            onClick={aoNavegar}
            className="mt-3 flex h-9 items-center justify-center rounded-full bg-broto-500 text-sm font-semibold text-floresta-950 transition-colors hover:bg-broto-400"
          >
            Abrir ajuda
          </NavLink>
        </div>
      </div>
    </div>
  )
}

function BotaoTema() {
  const { escuro, alternar } = useAlternarTema()
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      title={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      className="relative flex h-10 w-[76px] items-center rounded-full bg-floresta-100 p-1 transition-colors dark:bg-floresta-900"
    >
      <span className="absolute left-2.5 text-floresta-600 dark:text-floresta-300">
        <Sun size={15} />
      </span>
      <span className="absolute right-2.5 text-floresta-500">
        <Moon size={15} />
      </span>
      <span
        className={`relative z-[1] flex size-8 items-center justify-center rounded-full shadow transition-transform ${
          escuro ? 'translate-x-9 bg-broto-400 text-floresta-950' : 'translate-x-0 bg-primaria text-white'
        }`}
      >
        {escuro ? <Moon size={15} /> : <Sun size={15} />}
      </span>
    </button>
  )
}

function Notificacoes() {
  const usuario = useUsuario()
  const navegar = useNavigate()
  const [aberto, setAberto] = useState(false)
  const sup = pode.estoque(usuario.perfil)
  const { data } = useQuery({
    queryKey: ['estoque-baixo-total'],
    queryFn: () => api.get<{ itens: unknown[] }>('/estoque/baixo').then((r) => r.itens.length),
    enabled: sup,
    refetchInterval: 120_000,
  })
  const total = data ?? 0
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-label="Avisos"
        className="relative flex size-10 items-center justify-center rounded-full border border-borda bg-superficie text-texto-2 hover:bg-superficie-2 hover:text-texto"
      >
        <Bell size={18} strokeWidth={1.75} />
        {total > 0 && <span className="absolute top-2 right-2.5 size-2 rounded-full bg-erro ring-2 ring-superficie" />}
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="animate-entrar absolute right-0 z-40 mt-2 w-72 rounded-2xl bg-superficie p-2 shadow-[var(--shadow-flutuante)] ring-1 ring-borda">
            {total > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setAberto(false)
                  navegar('/estoque?aba=baixo')
                }}
                className="flex w-full items-start gap-3 rounded-xl p-3 text-left hover:bg-superficie-2"
              >
                <span className="mt-1 size-2 shrink-0 rounded-full bg-aviso-fg" />
                <span>
                  <span className="block text-sm font-semibold text-texto">
                    {total} {total === 1 ? 'produto' : 'produtos'} com estoque baixo
                  </span>
                  <span className="text-xs text-texto-3">Veja a sugestão de compra.</span>
                </span>
              </button>
            ) : (
              <p className="p-3 text-sm text-texto-3">Nenhum aviso agora.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function BarraSuperior({ abrirMenu }: { abrirMenu: () => void }) {
  const usuario = useUsuario()
  const navegar = useNavigate()
  const [busca, setBusca] = useState('')
  return (
    <header className="flex items-center gap-3 rounded-[var(--radius-card)] bg-superficie px-3 py-3 shadow-[var(--shadow-card)] sm:px-4">
      <button type="button" onClick={abrirMenu} aria-label="Abrir menu" className="flex size-10 items-center justify-center rounded-full text-texto-2 hover:bg-superficie-2 lg:hidden">
        <IconeMenu size={20} />
      </button>
      <form
        className="relative hidden max-w-sm flex-1 sm:block"
        onSubmit={(e) => {
          e.preventDefault()
          if (busca.trim()) navegar(`/produtos?busca=${encodeURIComponent(busca.trim())}`)
        }}
        role="search"
      >
        <Search size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-texto-3" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto por nome ou código"
          aria-label="Buscar produto"
          className="h-11 w-full rounded-full border border-borda bg-superficie-2 pr-4 pl-11 text-sm text-texto outline-none focus:border-primaria focus:bg-superficie"
        />
      </form>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <BotaoTema />
        <Notificacoes />
        <div className="ml-1 flex items-center gap-3 border-l border-borda pl-3 sm:pl-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-floresta-100 text-sm font-bold text-floresta-700 dark:bg-floresta-800 dark:text-floresta-100">
            {iniciais(usuario.nome)}
          </span>
          <span className="hidden leading-tight md:block">
            <span className="block text-sm font-semibold text-texto">{usuario.nome}</span>
            <span className="text-xs text-texto-3">{NOMES_PERFIL[usuario.perfil]}</span>
          </span>
        </div>
      </div>
    </header>
  )
}

/** Layout com sidebar flutuante (gaveta no celular) e barra superior. */
export function LayoutApp() {
  const [menuAberto, setMenuAberto] = useState(false)
  const local = useLocation()
  useEffect(() => setMenuAberto(false), [local.pathname])

  return (
    <div className="min-h-full bg-fundo">
      <aside className="fixed top-3 bottom-3 left-3 z-20 hidden w-[248px] rounded-[var(--radius-card)] bg-superficie shadow-[var(--shadow-card)] lg:block">
        <Sidebar />
      </aside>
      {menuAberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-floresta-950/40" onClick={() => setMenuAberto(false)} />
          <aside className="animate-entrar absolute top-0 bottom-0 left-0 w-[272px] max-w-[85vw] bg-superficie shadow-[var(--shadow-flutuante)]">
            <button
              type="button"
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar menu"
              className="absolute top-5 right-4 flex size-9 items-center justify-center rounded-full text-texto-3 hover:bg-superficie-2"
            >
              <X size={18} />
            </button>
            <Sidebar aoNavegar={() => setMenuAberto(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-h-full flex-col gap-4 p-3 lg:gap-5 lg:py-3 lg:pr-3 lg:pl-[272px]">
        <BarraSuperior abrirMenu={() => setMenuAberto(true)} />
        <main className="flex-1 px-1 pb-6 sm:px-2 lg:px-3">
          <Suspense fallback={<div className="flex flex-col gap-4"><Esqueleto className="h-14 w-72" /><Esqueleto className="h-[60vh] rounded-[var(--radius-card)]" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
