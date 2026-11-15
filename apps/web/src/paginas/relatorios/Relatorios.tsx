import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Download, FileText, Printer } from 'lucide-react'
import { api, baixarArquivo, mensagemErro } from '../../api/cliente'
import type { Produto, Relatorio, RelatorioInfo } from '../../api/tipos'
import { useCategorias, useFornecedoresAtivos, useOperadores } from '../../api/consultas'
import { CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card } from '../../componentes/ui/Card'
import { CaixaMarcar, Selecao, CampoData } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { BuscaProduto } from '../../componentes/ui/BuscaProduto'
import { EstadoVazio, EsqueletoLinhas } from '../../componentes/ui/Estados'
import { useAvisos } from '../../componentes/ui/Avisos'
import {
  data, dataHora, dinheiro, fimMesIso, hojeIso, inicioMesIso, NOMES_FORMA, NOMES_MOTIVO_DEVOLUCAO, NOMES_MOVIMENTACAO, percentual, quantidade,
} from '../../utils/formatos'
import { imprimirHtml } from '../../utils/impressao'

const ATALHOS: { rotulo: string; periodo: () => [string, string] }[] = [
  { rotulo: 'Hoje', periodo: () => [hojeIso(), hojeIso()] },
  { rotulo: 'Ontem', periodo: () => [hojeIso(-1), hojeIso(-1)] },
  { rotulo: 'Últimos 7 dias', periodo: () => [hojeIso(-6), hojeIso()] },
  { rotulo: 'Mês atual', periodo: () => [inicioMesIso(), hojeIso()] },
  { rotulo: 'Mês anterior', periodo: () => [inicioMesIso(-1), fimMesIso(-1)] },
]

function formatar(v: unknown, tipo: string): string {
  if (v === null || v === undefined || v === '') return '—'
  switch (tipo) {
    case 'moeda': return dinheiro(Number(v))
    case 'quantidade': return quantidade(Number(v))
    case 'percentual': return percentual(Number(v))
    case 'data': return data(String(v))
    case 'data_hora': return dataHora(String(v))
    case 'booleano': return v ? 'Sim' : 'Não'
    case 'inteiro': return Number(v).toLocaleString('pt-BR')
    default: return String(v)
  }
}

const ROTULOS_TOTAIS: Record<string, string> = {
  sobras: 'Sobras', faltas: 'Faltas', diferenca: 'Diferença', sessoes: 'Caixas', vale_troca: 'Em vale-troca', estorno: 'Em estorno',
  saldo_vales_ativos: 'Saldo de vales ativos', produtos_a: 'Classe A', produtos_b: 'Classe B', produtos_c: 'Classe C', movimentacoes: 'Movimentações',
  quantidade: 'Vendas', quantidade_finalizadas: 'Finalizadas', faturamento: 'Faturamento', itens: 'Produtos',
}
const ehDinheiro = (k: string) => /valor|faturamento|sobras|faltas|diferenca|saldo|vale_troca|estorno|total|desconto|custo|lucro/.test(k)

function Filtros({ info, f, set }: { info: RelatorioInfo; f: Record<string, string>; set: (k: string, v: string) => void }) {
  const op = useOperadores(info.filtros.some((x) => x === 'operador_id' || x === 'usuario_id'))
  const cats = useCategorias('todos')
  const forn = useFornecedoresAtivos(info.filtros.includes('fornecedor_id'))
  const [produto, setProduto] = useState<Produto | null>(null)
  return (
    <>
      {info.filtros.map((fl) => {
        switch (fl) {
          case 'agrupar':
            return (
              <Selecao key={fl} className="w-36" rotulo="Agrupar por" value={f.agrupar ?? 'dia'} onChange={(e) => set('agrupar', e.target.value)}>
                <option value="dia">Dia</option>
                <option value="semana">Semana</option>
                <option value="mes">Mês</option>
              </Selecao>
            )
          case 'operador_id':
          case 'usuario_id':
            return (
              <Selecao key={fl} className="w-44" rotulo={fl === 'operador_id' ? 'Operador' : 'Usuário'} value={f[fl] ?? ''} onChange={(e) => set(fl, e.target.value)}>
                <option value="">Todos</option>
                {op.data?.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </Selecao>
            )
          case 'forma':
            return (
              <Selecao key={fl} className="w-36" rotulo="Pagamento" value={f.forma ?? ''} onChange={(e) => set('forma', e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(NOMES_FORMA).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </Selecao>
            )
          case 'situacao':
            return (
              <Selecao key={fl} className="w-36" rotulo="Situação" value={f.situacao ?? ''} onChange={(e) => set('situacao', e.target.value)}>
                <option value="">Todas</option>
                <option value="finalizada">Finalizadas</option>
                <option value="cancelada">Canceladas</option>
              </Selecao>
            )
          case 'categoria_id':
            return (
              <Selecao key={fl} className="w-44" rotulo="Categoria" value={f.categoria_id ?? ''} onChange={(e) => set('categoria_id', e.target.value)}>
                <option value="">Todas</option>
                <option value="sem">Sem categoria</option>
                {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
            )
          case 'fornecedor_id':
            return (
              <Selecao key={fl} className="w-44" rotulo="Fornecedor" value={f.fornecedor_id ?? ''} onChange={(e) => set('fornecedor_id', e.target.value)}>
                <option value="">Todos</option>
                {forn.data?.map((x) => <option key={x.id} value={x.id}>{x.nome_fantasia}</option>)}
              </Selecao>
            )
          case 'somente_baixo':
          case 'somente_com_saldo':
            return (
              <div key={fl} className="pb-3">
                <CaixaMarcar rotulo={fl === 'somente_baixo' ? 'Só estoque baixo' : 'Só com saldo'} marcado={f[fl] === 'true'} aoMudar={(v) => set(fl, v ? 'true' : '')} />
              </div>
            )
          case 'tipo':
            return (
              <Selecao key={fl} className="w-44" rotulo="Tipo" value={f.tipo ?? ''} onChange={(e) => set('tipo', e.target.value)}>
                <option value="">Todos</option>
                {info.codigo === 'R11'
                  ? [['sangria', 'Sangria'], ['suprimento', 'Suprimento'], ['estorno_dinheiro', 'Estorno em dinheiro']].map(([k, n]) => <option key={k} value={k}>{n}</option>)
                  : Object.entries(NOMES_MOVIMENTACAO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </Selecao>
            )
          case 'destino':
            return (
              <Selecao key={fl} className="w-40" rotulo="Destino" value={f.destino ?? ''} onChange={(e) => set('destino', e.target.value)}>
                <option value="">Todos</option>
                <option value="vale_troca">Vale-troca</option>
                <option value="estorno">Estorno</option>
              </Selecao>
            )
          case 'motivo':
            return (
              <Selecao key={fl} className="w-40" rotulo="Motivo" value={f.motivo ?? ''} onChange={(e) => set('motivo', e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(NOMES_MOTIVO_DEVOLUCAO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </Selecao>
            )
          case 'produto_id':
            return produto ? (
              <div key={fl} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-texto-2">Produto</span>
                <button type="button" onClick={() => { setProduto(null); set('produto_id', '') }} className="flex h-11 items-center rounded-[var(--radius-campo)] border border-primaria bg-floresta-50 px-3.5 text-sm font-semibold text-primaria dark:bg-superficie-2">
                  {produto.nome} ×
                </button>
              </div>
            ) : (
              <BuscaProduto key={fl} className="w-56" rotulo="Produto" placeholder="Todos" aoEscolher={(p) => { setProduto(p); set('produto_id', p.id) }} />
            )
          default:
            return null
        }
      })}
    </>
  )
}

export function Relatorios() {
  const { erro } = useAvisos()
  const lista = useQuery({ queryKey: ['relatorios'], queryFn: () => api.get<{ itens: RelatorioInfo[] }>('/relatorios').then((r) => r.itens) })
  const [codigo, setCodigo] = useState('R1')
  const [inicio, setInicio] = useState(inicioMesIso())
  const [fim, setFim] = useState(hojeIso())
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [baixando, setBaixando] = useState(false)
  const info = lista.data?.find((r) => r.codigo === codigo)

  const params = useMemo(() => ({ ...(info?.usa_periodo ? { inicio, fim } : {}), ...filtros }), [info, inicio, fim, filtros])
  const rel = useQuery({
    queryKey: ['relatorio', codigo, params],
    queryFn: () => api.get<Relatorio>(`/relatorios/${codigo}`, params),
    enabled: !!info,
  })

  const r = rel.data
  const colunasTotal = new Set(r?.colunas.map((c) => c.chave))
  const extras = r ? Object.entries(r.totais).filter(([k, v]) => !colunasTotal.has(k) && typeof v === 'number') : []

  function imprimir() {
    if (!r) return
    const linhas = r.linhas
      .map((l) => `<tr>${r.colunas.map((c) => `<td class="${['moeda', 'quantidade', 'percentual', 'inteiro'].includes(c.tipo) ? 'd' : ''}">${formatar(l[c.chave], c.tipo)}</td>`).join('')}</tr>`)
      .join('')
    const tot = `<tr class="b">${r.colunas.map((c, i) => `<td class="d">${r.totais[c.chave] !== undefined ? formatar(r.totais[c.chave], c.tipo) : i === 0 ? 'Totais' : ''}</td>`).join('')}</tr>`
    imprimirHtml(
      `<div style="font-family:Arial,sans-serif;font-size:10px">
        <h2 style="margin:0 0 4px">${r.titulo}</h2>
        <p style="margin:0 0 10px">${r.periodo ? `Período: ${data(r.periodo.inicio)} a ${data(r.periodo.fim)}` : `Posição em ${dataHora(new Date().toISOString())}`}</p>
        <table style="width:100%;border-collapse:collapse" border="1" cellpadding="4">
          <thead><tr>${r.colunas.map((c) => `<th style="text-align:left">${c.titulo}</th>`).join('')}</tr></thead>
          <tbody>${linhas}${tot}</tbody>
        </table></div>`,
      'A4',
      r.titulo,
    )
  }

  async function exportar() {
    setBaixando(true)
    try {
      await baixarArquivo(`/relatorios/${codigo}`, { ...params, formato: 'csv' }, `${info?.slug ?? codigo}.csv`)
    } catch (e) {
      erro(mensagemErro(e))
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Escolha o relatório, ajuste o período e baixe a planilha."
        acoes={
          <>
            <Botao variante="contorno" icone={<Printer size={17} />} onClick={imprimir} disabled={!r}>
              Imprimir
            </Botao>
            <Botao icone={<Download size={17} />} carregando={baixando} onClick={exportar} disabled={!r}>
              Baixar planilha
            </Botao>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr] xl:gap-5">
        <Card compacto className="h-fit p-3 lg:sticky lg:top-3">
          <nav className="flex flex-col gap-0.5" aria-label="Relatórios">
            {(lista.data ?? []).map((x) => (
              <button
                key={x.codigo}
                type="button"
                onClick={() => { setCodigo(x.codigo); setFiltros({}) }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  codigo === x.codigo ? 'bg-floresta-50 font-semibold text-primaria dark:bg-superficie-2' : 'text-texto-2 hover:bg-superficie-2'
                }`}
              >
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${codigo === x.codigo ? 'bg-primaria text-sobre-primaria' : 'bg-superficie-2 text-texto-3'}`}>{x.codigo}</span>
                {x.titulo}
              </button>
            ))}
          </nav>
        </Card>
        <Card className="min-w-0">
          {info && (
            <>
              <div className="mb-4 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-floresta-50 text-primaria dark:bg-superficie-2">
                  <BarChart3 size={20} />
                </span>
                <h2 className="text-lg font-bold text-texto">{info.titulo}</h2>
              </div>
              <div className="mb-4 flex flex-wrap items-end gap-3">
                {info.usa_periodo && (
                  <>
                    <CampoData className="w-40" rotulo="De" valor={inicio} aoMudar={(v) => setInicio(v)} />
                    <CampoData className="w-40" rotulo="Até" valor={fim} aoMudar={(v) => setFim(v)} />
                  </>
                )}
                <Filtros info={info} f={filtros} set={(k, v) => setFiltros((x) => ({ ...x, [k]: v }))} />
              </div>
              {info.usa_periodo && (
                <div className="mb-5 flex flex-wrap gap-2">
                  {ATALHOS.map((a) => {
                    const [i, f] = a.periodo()
                    const ativo = i === inicio && f === fim
                    return (
                      <button
                        key={a.rotulo}
                        type="button"
                        onClick={() => { setInicio(i); setFim(f) }}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${ativo ? 'border-primaria bg-primaria text-sobre-primaria' : 'border-borda text-texto-2 hover:border-primaria hover:text-primaria'}`}
                      >
                        {a.rotulo}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
          {rel.isError ? (
            <EstadoVazio titulo="Não foi possível gerar" descricao={mensagemErro(rel.error)} />
          ) : !r ? (
            <EsqueletoLinhas linhas={8} />
          ) : r.linhas.length === 0 ? (
            <EstadoVazio icone={<FileText size={22} />} titulo="Nada no período" descricao="Mude o período ou os filtros." />
          ) : (
            <>
              {extras.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {extras.map(([k, v]) => (
                    <span key={k} className="tabular rounded-full bg-superficie-2 px-3 py-1 text-xs text-texto-2">
                      {ROTULOS_TOTAIS[k] ?? k.replace(/_/g, ' ')}: <b className="text-texto">{ehDinheiro(k) ? dinheiro(Number(v)) : Number(v).toLocaleString('pt-BR')}</b>
                    </span>
                  ))}
                </div>
              )}
              <div className={`-mx-5 overflow-auto lg:-mx-6 ${rel.isFetching ? 'opacity-60' : ''}`} style={{ maxHeight: 'calc(100vh - 360px)' }}>
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-[1] bg-superficie">
                    <tr>
                      {r.colunas.map((c) => (
                        <th key={c.chave} className={`border-b border-borda px-3 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-texto-3 uppercase first:pl-5 last:pr-5 lg:first:pl-6 lg:last:pr-6 ${['moeda', 'quantidade', 'percentual', 'inteiro'].includes(c.tipo) ? 'text-right' : 'text-left'}`}>
                          {c.titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.linhas.map((l, i) => (
                      <tr key={i} className={`border-b border-borda/70 ${l.detalhe ? 'text-texto-3' : ''}`}>
                        {r.colunas.map((c) => (
                          <td key={c.chave} className={`tabular px-3 py-2.5 whitespace-nowrap text-texto-2 first:pl-5 last:pr-5 lg:first:pl-6 lg:last:pr-6 ${['moeda', 'quantidade', 'percentual', 'inteiro'].includes(c.tipo) ? 'text-right' : ''}`}>
                            {formatar(l[c.chave], c.tipo)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-superficie">
                    <tr>
                      {r.colunas.map((c, i) => (
                        <td key={c.chave} className={`tabular border-t-2 border-borda px-3 py-3 font-bold whitespace-nowrap text-texto first:pl-5 last:pr-5 lg:first:pl-6 lg:last:pr-6 ${['moeda', 'quantidade', 'percentual', 'inteiro'].includes(c.tipo) ? 'text-right' : ''}`}>
                          {r.totais[c.chave] !== undefined && typeof r.totais[c.chave] !== 'object' ? formatar(r.totais[c.chave], c.tipo) : i === 0 ? 'Totais' : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-3 text-xs text-texto-3">{r.linhas.length} linhas. A planilha abre no Excel com acentos e vírgula decimal, sem a linha de totais.</p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
