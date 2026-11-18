import type { ReactNode } from 'react'
import { BarChart3, Boxes, ShoppingCart } from 'lucide-react'
import { Logo } from '../../componentes/ui/Logo'

/** Moldura das telas de acesso: painel verde à esquerda, formulário à direita. */
export function LayoutAcesso({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-fundo p-3">
      <section className="card-destaque ondas relative hidden w-[46%] max-w-[640px] flex-col justify-between overflow-hidden rounded-[28px] p-10 lg:flex">
        <Logo tamanho={40} sempreEscuro />
        <div>
          <h2 className="max-w-md text-[34px] leading-tight font-bold text-creme">Venda, confira o caixa e veja o resultado do dia.</h2>
          <p className="mt-3 max-w-md text-[15px] text-creme-2">Ponto de venda para o pequeno comércio, todo em português.</p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
            {[
              { icone: ShoppingCart, t: 'Caixa rápido', d: 'Leitor e atalhos' },
              { icone: Boxes, t: 'Estoque', d: 'Aviso de estoque baixo' },
              { icone: BarChart3, t: 'Relatórios', d: 'Planilha para o Excel' },
            ].map(({ icone: I, t, d }) => (
              <div key={t} className="rounded-2xl bg-creme/10 p-4 backdrop-blur-sm">
                <I size={20} className="text-ouro-claro" strokeWidth={1.75} />
                <p className="mt-3 text-sm font-semibold text-creme">{t}</p>
                <p className="text-xs text-creme/65">{d}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-creme/55">NEXO PDV · comprovante não fiscal</p>
      </section>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <Logo tamanho={38} />
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-texto">{titulo}</h1>
          {descricao && <p className="mt-1.5 text-sm text-texto-3">{descricao}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  )
}
