import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, Boxes, Pause, Play, Plus, ShoppingCart, Sparkles, X } from 'lucide-react'
import { api } from '../../api/cliente'
import type { Dashboard as TDashboard, Relatorio } from '../../api/tipos'
import { CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card, CabecalhoCard, CardKpi } from '../../componentes/ui/Card'
import { Botao } from '../../componentes/ui/Botao'
import { Segmentado } from '../../componentes/ui/Campo'
import { Pilula } from '../../componentes/ui/Pilula'
import { EstadoVazio, Esqueleto } from '../../componentes/ui/Estados'
import { useSessao } from '../../ganchos/useSessao'
import {
  dinheiro, dinheiroCompacto, duracao, hojeIso, hora, NOMES_FORMA, percentual, quantidade, rotuloDiaCurto, rotuloMes,
} from '../../utils/formatos'

type Agrupamento = 'dia' | 'semana' | 'mes'

const CORES_FORMA: Record<string, string> = {
  dinheiro: 'var(--destaque)',
  pix: 'var(--texto)',
  debito: 'var(--color-ouro-claro)',
  credito: 'var(--aviso-fg)',
  vale_troca: 'var(--texto-3)',
}

function TooltipCard({ active, payload, label, rotulo }: { active?: boolean; payload?: { value: number; payload: { vendas?: number } }[]; label?: string; rotulo?: (l: string) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-superficie px-3.5 py-2.5 shadow-[var(--shadow-flutuante)] ring-1 ring-borda">
      <p className="text-xs font-medium text-texto-3">{rotulo && label ? rotulo(label) : label}</p>
      <p className="tabular text-sm font-bold text-texto">{dinheiro(payload[0].value)}</p>
      {payload[0].payload.vendas !== undefined && <p className="tabular text-xs text-texto-3">{payload[0].payload.vendas} vendas</p>}
    </div>
  )
}

function GraficoVendas() {
  const [agrup, setAgrup] = useState<Agrupamento>('dia')
  const dados = useQuery({
    queryKey: ['dashboard-grafico', agrup],
    queryFn: async () => {
      if (agrup === 'semana') {
        const r = await api.get<Relatorio>('/relatorios/R1', { agrupar: 'semana', inicio: hojeIso(-7 * 11 - 6), fim: hojeIso() })
        return r.linhas.map((l) => ({ chave: String(l.periodo), rotulo: rotuloDiaCurto(String(l.periodo)), total: Number(l.total_liquido ?? 0), vendas: Number(l.numero_vendas ?? 0) }))
      }
      const d = await api.get<TDashboard>('/dashboard', { periodo: agrup === 'dia' ? '30d' : '12m' })
      return d.grafico.pontos.map((p) => ({
        chave: p.data,
        rotulo: agrup === 'mes' ? rotuloMes(p.data) : rotuloDiaCurto(p.data),
        total: p.total,
        vendas: p.numero_vendas,
      }))
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const pontos = dados.data ?? []
  const soma = pontos.reduce((s, p) => s + p.total, 0)
  const legenda = { dia: 'Últimos 30 dias', semana: 'Últimas 12 semanas', mes: 'Últimos 12 meses' }[agrup]

  return (
    <Card compacto className="flex flex-col xl:col-span-2">
      <CabecalhoCard
        titulo="Vendas por período"
        acoes={
          <Segmentado
            rotulo="Agrupar por"
            tamanho="sm"
            valor={agrup}
            aoMudar={setAgrup}
            opcoes={[
              { valor: 'dia', rotulo: 'Dia' },
              { valor: 'semana', rotulo: 'Semana' },
              { valor: 'mes', rotulo: 'Mês' },
            ]}
          />
        }
      />
      <div className="mb-1 flex items-baseline gap-3">
        <p className="tabular text-2xl font-bold text-texto">{dados.isLoading ? '—' : dinheiro(soma)}</p>
        <Pilula tom="ok">{legenda}</Pilula>
      </div>
      <div className="min-h-[124px] flex-1">
        {dados.isLoading ? (
          <Esqueleto className="h-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pontos} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--destaque)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--destaque)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--borda)" strokeDasharray="4 4" />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: 'var(--texto-3)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={72}
                tick={{ fill: 'var(--texto-3)', fontSize: 11 }}
                tickFormatter={(v: number) => dinheiroCompacto(v)}
              />
              <Tooltip content={<TooltipCard />} cursor={{ stroke: 'var(--texto-3)', strokeDasharray: '4 4' }} />
              <Area type="monotone" dataKey="total" stroke="var(--destaque)" strokeWidth={2.5} fill="url(#gradVendas)" activeDot={{ r: 5, fill: 'var(--destaque)', stroke: 'var(--superficie)', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

function Relogio({ desde }: { desde: string }) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const seg = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000))
  const h = String(Math.floor(seg / 3600)).padStart(2, '0')
  const m = String(Math.floor((seg % 3600) / 60)).padStart(2, '0')
  const s = String(seg % 60).padStart(2, '0')
  return (
    <span className="tabular" aria-label="Tempo de caixa aberto">
      {h}:{m}:{s}
    </span>
  )
}

function CardCaixaAtual({ total }: { total: number | null }) {
  const { eu } = useSessao()
  const navegar = useNavigate()
  const caixa = eu?.caixa_aberto
  return (
    <div className="card-escuro relative flex min-h-[240px] flex-col overflow-hidden rounded-[var(--radius-card)] p-5 shadow-[var(--shadow-card)]">
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]" viewBox="0 0 300 260" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-10 190 C 60 140, 120 240, 200 170 S 320 120, 320 160" stroke="white" strokeWidth="1.2" fill="none" />
        <path d="M-10 215 C 70 165, 130 265, 210 195 S 320 145, 320 185" stroke="white" strokeWidth="1.2" fill="none" />
        <path d="M-10 240 C 80 190, 140 290, 220 220 S 320 170, 320 210" stroke="white" strokeWidth="1.2" fill="none" />
      </svg>
      <div className="relative flex items-center justify-between">
        <p className="text-[15px] font-semibold text-creme">Seu caixa</p>
        {caixa ? (
          <span className="rounded-full bg-ouro/15 px-2.5 py-0.5 text-xs font-semibold text-ouro-claro">{caixa.vencido ? 'Do dia anterior' : `Nº ${caixa.numero}`}</span>
        ) : (
          <span className="rounded-full bg-creme/10 px-2.5 py-0.5 text-xs font-semibold text-creme/70">Fechado</span>
        )}
      </div>
      <p className="relative mt-4 text-center text-[40px] leading-none font-bold tracking-tight text-creme">
        {caixa ? <Relogio desde={caixa.aberto_em} /> : <span className="tabular text-creme/40">00:00:00</span>}
      </p>
      <p className="relative mt-2 text-center text-xs text-creme/60">
        {caixa ? `Aberto às ${hora(caixa.aberto_em)}${total !== null ? ` · ${dinheiro(total)} vendidos` : ''}` : 'Abra o caixa para começar a vender.'}
      </p>
      <div className="relative mt-auto flex items-center justify-center gap-3 pt-4">
        <button
          type="button"
          onClick={() => navegar('/caixa')}
          aria-label={caixa ? 'Ir para o caixa' : 'Abrir caixa'}
          className="flex size-12 items-center justify-center rounded-full bg-ouro text-preto shadow transition-transform hover:scale-105"
        >
          {caixa ? <ShoppingCart size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>
        <button
          type="button"
          onClick={() => navegar(caixa ? '/caixa?fechar=1' : '/caixa')}
          aria-label={caixa ? 'Fechar caixa' : 'Abrir caixa'}
          className="flex size-12 items-center justify-center rounded-full bg-erro text-white shadow transition-transform hover:scale-105"
        >
          {caixa ? <Pause size={20} /> : <Plus size={20} />}
        </button>
      </div>
    </div>
  )
}

function FormasPagamento({ d }: { d: TDashboard }) {
  const [quando, setQuando] = useState<'hoje' | 'mes'>('mes')
  const lista = d.formas_pagamento[quando]
  const total = lista.reduce((s, f) => s + f.valor, 0)
  const maior = [...lista].sort((a, b) => b.valor - a.valor)[0]
  const dados = lista.filter((f) => f.valor > 0)
  return (
    <Card compacto className="flex flex-col">
      <CabecalhoCard
        titulo="Pagamentos"
        acoes={
          <Segmentado tamanho="sm" valor={quando} aoMudar={setQuando} opcoes={[{ valor: 'hoje', rotulo: 'Hoje' }, { valor: 'mes', rotulo: 'Mês' }]} />
        }
      />
      {total === 0 ? (
        <EstadoVazio compacto titulo="Sem vendas no período" descricao="As formas aparecem aqui depois da primeira venda." />
      ) : (
        <div className="flex flex-1 items-center gap-3">
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
            {lista.map((f) => (
              <li key={f.forma} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CORES_FORMA[f.forma] }} />
                <span className="truncate text-texto-2">{NOMES_FORMA[f.forma]}</span>
                <span className="tabular ml-auto font-semibold text-texto">{percentual(f.percentual)}</span>
              </li>
            ))}
          </ul>
          <div className="relative size-[96px] shrink-0 2xl:size-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dados} dataKey="valor" nameKey="forma" innerRadius="70%" outerRadius="100%" paddingAngle={2} cornerRadius={6} startAngle={90} endAngle={-270} stroke="none">
                  {dados.map((f) => (
                    <Cell key={f.forma} fill={CORES_FORMA[f.forma]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="tabular text-lg font-bold text-texto">{percentual(maior?.percentual ?? 0, 0)}</span>
              <span className="text-[10px] font-medium text-texto-3">{NOMES_FORMA[maior?.forma ?? 'dinheiro']}</span>
            </div>
          </div>
        </div>
      )}
      <p className="tabular mt-3 border-t border-borda pt-3 text-xs text-texto-3">
        Total {quando === 'hoje' ? 'de hoje' : 'do mês'}: <span className="font-semibold text-texto-2">{dinheiro(total)}</span>
      </p>
    </Card>
  )
}

function MaisVendidos({ d }: { d: TDashboard }) {
  const [por, setPor] = useState<'quantidade' | 'valor'>('quantidade')
  const lista = (por === 'quantidade' ? d.mais_vendidos.por_quantidade : d.mais_vendidos.por_valor).slice(0, 5)
  const max = Math.max(1, ...lista.map((p) => (por === 'quantidade' ? p.quantidade : p.valor)))
  return (
    <Card compacto className="xl:col-span-2">
      <CabecalhoCard
        titulo="Mais vendidos nos últimos 30 dias"
        acoes={
          <Segmentado tamanho="sm" valor={por} aoMudar={setPor} opcoes={[{ valor: 'quantidade', rotulo: 'Quantidade' }, { valor: 'valor', rotulo: 'Valor' }]} />
        }
      />
      {lista.length === 0 ? (
        <EstadoVazio compacto titulo="Nenhuma venda no período" />
      ) : (
        <ol className="flex flex-col gap-2">
          {lista.map((p, i) => {
            const v = por === 'quantidade' ? p.quantidade : p.valor
            return (
              <li key={p.produto_id} className="flex items-center gap-3">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-primaria text-sobre-primaria' : 'bg-selecao text-destaque
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-texto">{p.nome}</p>
                    <p className="tabular shrink-0 text-sm font-semibold text-texto">{por === 'quantidade' ? `${quantidade(p.quantidade, p.unidade)} ${p.unidade}` : dinheiro(p.valor)}</p>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-superficie-2">
                    <div className="h-full rounded-full bg-destaque" style={{ width: `${Math.max(4, (v / max) * 100)}%` }} />
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

export function Dashboard() {
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const { eu } = useSessao()
  const consulta = useQuery({
    queryKey: ['dashboard', '30d'],
    queryFn: () => api.get<TDashboard>('/dashboard', { periodo: '30d' }),
    refetchInterval: 60_000,
  })
  const d = consulta.data
  const meuCaixa = useMemo(() => d?.caixas_abertos.find((c) => c.id === eu?.caixa_aberto?.id) ?? null, [d, eu])
  const outrosCaixas = d?.caixas_abertos ?? []
  const nome = eu?.usuario.nome.split(' ')[0]

  return (
    <div>
      <CabecalhoPagina
        titulo="Dashboard"
        descricao={`Olá, ${nome}. Veja como estão as vendas de hoje e do mês.`}
        acoes={
          <>
            <Link to="/caixa">
              <Botao icone={<ShoppingCart size={18} />}>{eu?.caixa_aberto ? 'Ir para o caixa' : 'Abrir caixa'}</Botao>
            </Link>
            <Link to="/relatorios">
              <Botao variante="contorno">Ver relatórios</Botao>
            </Link>
          </>
        }
      />

      {params.get('boas_vindas') && (
        <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] bg-info-bg p-4 text-info-fg">
          <Sparkles size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Sua loja está pronta.</p>
            <p className="mt-0.5">
              Complete os dados em <Link className="font-semibold underline" to="/empresa">Minha empresa</Link> e cadastre os primeiros{' '}
              <Link className="font-semibold underline" to="/produtos">produtos</Link>. Depois é só abrir o caixa.
            </p>
          </div>
          <button type="button" aria-label="Fechar aviso" onClick={() => setParams({})}>
            <X size={18} />
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!d ? (
          Array.from({ length: 4 }).map((_, i) => <Esqueleto key={i} className="h-[148px] rounded-[var(--radius-card)]" />)
        ) : (
          <>
            <CardKpi destaque aoClicar={() => navegar('/vendas')} titulo="Vendido hoje" valor={dinheiro(d.hoje.total_vendido)} rodape={`${d.hoje.numero_vendas} ${d.hoje.numero_vendas === 1 ? 'venda' : 'vendas'} hoje`} />
            <CardKpi
              aoClicar={() => navegar('/relatorios')}
              titulo="Vendido no mês"
              valor={dinheiro(d.mes.total_vendido)}
              variacao={d.mes.variacao_percentual}
              rodape={d.mes.variacao_percentual === null ? `${d.mes.numero_vendas} vendas` : 'contra o mês anterior'}
            />
            <CardKpi aoClicar={() => navegar('/relatorios')} titulo="Ticket médio" valor={dinheiro(d.hoje.ticket_medio)} rodape={`Hoje · no mês ${dinheiro(d.mes.ticket_medio)}`} />
            <CardKpi aoClicar={() => navegar('/produtos')} titulo="Itens vendidos" valor={quantidade(Math.round(d.hoje.itens_vendidos))} rodape={`Hoje · ${d.mes.numero_vendas} vendas no mês`} />
          </>
        )}

        <GraficoVendas />

        <Card compacto className="flex flex-col">
          <CabecalhoCard titulo="Caixas abertos" />
          {!d ? (
            <Esqueleto className="h-32" />
          ) : outrosCaixas.length === 0 ? (
            <EstadoVazio compacto titulo="Nenhum caixa aberto" descricao="Quando alguém abrir o caixa, ele aparece aqui." />
          ) : (
            <div className="flex flex-1 flex-col">
              <p className="text-xl leading-tight font-bold text-primaria">{outrosCaixas[0].operador_nome}</p>
              <p className="mt-1 text-sm text-texto-3">
                {outrosCaixas[0].terminal ?? 'Caixa'} · aberto há {duracao(outrosCaixas[0].minutos_aberto)}
              </p>
              <p className="tabular mt-3 text-sm text-texto-2">
                <span className="font-semibold text-texto">{dinheiro(outrosCaixas[0].total_vendido)}</span> em {outrosCaixas[0].quantidade_vendas} vendas
              </p>
              {outrosCaixas.length > 1 && (
                <ul className="mt-3 flex flex-col gap-1.5 border-t border-borda pt-3">
                  {outrosCaixas.slice(1, 4).map((c) => (
                    <li key={c.id} className="flex justify-between gap-2 text-[13px]">
                      <span className="truncate text-texto-2">{c.operador_nome}</span>
                      <span className="tabular font-semibold text-texto">{dinheiro(c.total_vendido)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {outrosCaixas.some((c) => c.vencido) && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-aviso-fg">
                  <AlertTriangle size={14} /> Há caixa do dia anterior para fechar.
                </p>
              )}
              <Link to="/vendas?aba=caixas" className="mt-auto pt-4">
                <Botao larguraTotal icone={<ArrowRight size={16} />} className="flex-row-reverse">
                  Ver caixas
                </Botao>
              </Link>
            </div>
          )}
        </Card>

        <Card compacto className="flex flex-col">
          <CabecalhoCard
            titulo="Estoque baixo"
            acoes={
              <Link to="/estoque?aba=baixo">
                <Botao variante="contorno" tamanho="sm">
                  Ver todos
                </Botao>
              </Link>
            }
          />
          {!d ? (
            <Esqueleto className="h-40" />
          ) : d.estoque_baixo.itens.length === 0 ? (
            <EstadoVazio compacto icone={<Boxes size={22} />} titulo="Estoque em dia" descricao="Nenhum produto abaixo do mínimo." />
          ) : (
            <ul className="flex flex-col gap-3">
              {d.estoque_baixo.itens.slice(0, 3).map((p) => {
                const zerado = p.estoque_atual <= 0
                return (
                  <li key={p.id} className="flex items-center gap-3">
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${zerado ? 'bg-erro-bg' : 'bg-aviso-bg'}`}>
                      <span className={`size-3 rounded-full ${zerado ? 'bg-erro' : 'bg-aviso-fg'}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-texto">{p.nome}</p>
                      <p className="tabular text-xs text-texto-3">
                        Tem {quantidade(p.estoque_atual, p.unidade)} · mínimo {quantidade(p.estoque_minimo, p.unidade)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {d && d.estoque_baixo.total > 3 && <p className="mt-auto pt-3 text-xs font-semibold text-texto-3">E mais {d.estoque_baixo.total - 3} produtos</p>}
        </Card>

        {d ? <MaisVendidos d={d} /> : <Esqueleto className="h-72 rounded-[var(--radius-card)] xl:col-span-2" />}
        {d ? <FormasPagamento d={d} /> : <Esqueleto className="h-72 rounded-[var(--radius-card)]" />}
        <CardCaixaAtual total={meuCaixa ? meuCaixa.total_vendido : null} />
      </div>
    </div>
  )
}
