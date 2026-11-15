import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, ScanLine } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Inventario, InventarioLista, Produto } from '../../api/tipos'
import { useCategorias } from '../../api/consultas'
import { Card } from '../../componentes/ui/Card'
import { Gaveta, Modal } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { CampoTexto, CaixaMarcar, Segmentado, Selecao } from '../../componentes/ui/Campo'
import { BuscaProduto } from '../../componentes/ui/BuscaProduto'
import { Pilula } from '../../componentes/ui/Pilula'
import { Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { BarraFiltros } from '../../componentes/ui/Pagina'
import { EsqueletoLinhas } from '../../componentes/ui/Estados'
import { useAvisos } from '../../componentes/ui/Avisos'
import { dataHora, quantidade, textoParaQuantidade } from '../../utils/formatos'

export function ModalNovoInventario({ aberto, aoFechar, aoCriar }: { aberto: boolean; aoFechar: () => void; aoCriar: (id: string) => void }) {
  const categorias = useCategorias('ativos')
  const [descricao, setDescricao] = useState('')
  const [abrangencia, setAbrangencia] = useState<'todos' | 'categoria' | 'selecionados'>('todos')
  const [cats, setCats] = useState<string[]>([])
  const [prods, setProds] = useState<Produto[]>([])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (aberto) { setDescricao(''); setAbrangencia('todos'); setCats([]); setProds([]); setErros({}) }
  }, [aberto])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (descricao.trim().length < 2) er.descricao = 'Dê um nome à contagem. Ex.: Bebidas novembro.'
    if (abrangencia === 'categoria' && cats.length === 0) er.categoria_ids = 'Escolha pelo menos uma categoria.'
    if (abrangencia === 'selecionados' && prods.length === 0) er.produto_ids = 'Escolha pelo menos um produto.'
    setErros(er)
    if (Object.keys(er).length) return
    setEnviando(true)
    try {
      const inv = await api.post<Inventario>('/inventarios', {
        descricao: descricao.trim(),
        abrangencia,
        categoria_ids: abrangencia === 'categoria' ? cats : undefined,
        produto_ids: abrangencia === 'selecionados' ? prods.map((p) => p.id) : undefined,
      })
      aoCriar(inv.id)
    } catch (er2) {
      setErros(er2 instanceof ErroApi && er2.campos ? er2.campos : { descricao: mensagemErro(er2) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Novo inventário" descricao="Conte com a loja fechada ou fora do movimento. O caixa continua vendendo durante a contagem." largura="md">
      <form onSubmit={criar} className="flex flex-col gap-4">
        <CampoTexto rotulo="Nome da contagem" obrigatorio data-autofoco maxLength={80} value={descricao} onChange={(e) => setDescricao(e.target.value)} erro={erros.descricao} />
        <Segmentado valor={abrangencia} aoMudar={setAbrangencia} opcoes={[{ valor: 'todos', rotulo: 'Todos' }, { valor: 'categoria', rotulo: 'Por categoria' }, { valor: 'selecionados', rotulo: 'Escolher produtos' }]} />
        {abrangencia === 'categoria' && (
          <div className="grid grid-cols-2 gap-2">
            {categorias.data?.map((c) => (
              <CaixaMarcar key={c.id} rotulo={c.nome} marcado={cats.includes(c.id)} aoMudar={(m) => setCats((l) => (m ? [...l, c.id] : l.filter((x) => x !== c.id)))} />
            ))}
            {erros.categoria_ids && <p className="col-span-2 text-xs font-medium text-erro-fg">{erros.categoria_ids}</p>}
          </div>
        )}
        {abrangencia === 'selecionados' && (
          <div>
            <BuscaProduto rotulo="Adicionar produto" filtrar={(p) => p.controla_estoque && !prods.some((x) => x.id === p.id)} aoEscolher={(p) => setProds((l) => [...l, p])} erro={erros.produto_ids} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {prods.map((p) => (
                <button key={p.id} type="button" onClick={() => setProds((l) => l.filter((x) => x.id !== p.id))} className="rounded-full bg-superficie-2 px-3 py-1 text-xs font-semibold text-texto-2 hover:bg-erro-bg hover:text-erro-fg">
                  {p.nome} ×
                </button>
              ))}
            </div>
          </div>
        )}
        <Botao type="submit" carregando={enviando}>Criar e começar a contar</Botao>
      </form>
    </Modal>
  )
}

export function GavetaInventario({ id, aoFechar }: { id: string | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const { confirmar, sucesso, erro } = useAvisos()
  const q = useQuery({ queryKey: ['inventario', id], queryFn: () => api.get<Inventario>(`/inventarios/${id}`), enabled: !!id })
  const inv = q.data
  const [codigo, setCodigo] = useState('')
  const [ultima, setUltima] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<Record<string, string>>({})
  const [naoContados, setNaoContados] = useState<'manter' | 'zerar'>('manter')
  const emContagem = inv?.situacao === 'em_contagem'

  useEffect(() => { setEdicao({}); setUltima(null) }, [id])

  async function ler(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim() || !inv) return
    try {
      const r = await api.post<{ nome: string; quantidade_contada: number }>(`/inventarios/${inv.id}/leituras`, { codigo: codigo.trim() })
      setUltima(`${r.nome}: ${quantidade(r.quantidade_contada)}`)
      q.refetch()
    } catch (er) {
      erro(mensagemErro(er))
    }
    setCodigo('')
  }

  async function gravar(produtoId: string) {
    if (!inv || edicao[produtoId] === undefined) return
    const t = edicao[produtoId].trim()
    const valor = t === '' ? null : textoParaQuantidade(t)
    if (valor !== null && !(valor >= 0)) return erro('Informe uma quantidade válida.')
    try {
      await api.put(`/inventarios/${inv.id}/itens/${produtoId}`, { quantidade_contada: valor })
      setEdicao(({ [produtoId]: _, ...resto }) => resto)
      q.refetch()
    } catch (er) {
      erro(mensagemErro(er))
    }
  }

  async function finalizar() {
    if (!inv) return
    const ok = await confirmar({
      titulo: 'Finalizar inventário?',
      mensagem: `${inv.resumo.com_diferenca} produtos com diferença terão o estoque corrigido. ${inv.resumo.nao_contados} não contados: ${naoContados === 'manter' ? 'mantêm o estoque atual' : 'ficam com zero'}. Não dá para desfazer.`,
      confirmar: 'Finalizar inventário',
    })
    if (ok === null) return
    try {
      await api.post(`/inventarios/${inv.id}/finalizar`, { nao_contados: naoContados })
      sucesso('Inventário finalizado. O estoque foi corrigido.')
      qc.invalidateQueries({ queryKey: ['inventarios'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      q.refetch()
    } catch (er) {
      erro(mensagemErro(er))
    }
  }

  async function cancelar() {
    if (!inv) return
    const ok = await confirmar({ titulo: 'Cancelar inventário?', mensagem: 'A contagem é descartada e o estoque não muda.', confirmar: 'Cancelar inventário', perigo: true })
    if (ok === null) return
    try {
      await api.post(`/inventarios/${inv.id}/cancelar`)
      qc.invalidateQueries({ queryKey: ['inventarios'] })
      aoFechar()
    } catch (er) {
      erro(mensagemErro(er))
    }
  }

  return (
    <Gaveta
      aberto={!!id}
      aoFechar={aoFechar}
      largura="max-w-4xl"
      titulo={inv ? `Inventário nº ${inv.numero} · ${inv.descricao}` : 'Inventário'}
      descricao={inv ? (emContagem ? 'Leia os códigos (cada leitura soma 1) ou digite a quantidade contada.' : `Situação: ${inv.situacao === 'finalizado' ? 'finalizado' : 'cancelado'}`) : undefined}
      rodape={
        emContagem && (
          <>
            <Botao variante="fantasma" className="mr-auto text-erro-fg" onClick={cancelar}>Cancelar inventário</Botao>
            <Selecao aria-label="Não contados" value={naoContados} onChange={(e) => setNaoContados(e.target.value as 'manter' | 'zerar')} className="w-64">
              <option value="manter">Não contados: manter estoque</option>
              <option value="zerar">Não contados: considerar zero</option>
            </Selecao>
            <Botao onClick={finalizar}>Finalizar inventário</Botao>
          </>
        )
      }
    >
      {!inv ? (
        <EsqueletoLinhas />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Produtos', inv.resumo.total_produtos],
              ['Contados', inv.resumo.contados],
              ['Com diferença', inv.resumo.com_diferenca],
            ].map(([r, v]) => (
              <div key={r} className="rounded-2xl bg-superficie-2 p-4">
                <p className="text-xs font-semibold text-texto-3">{r}</p>
                <p className="tabular text-2xl font-bold text-texto">{v}</p>
              </div>
            ))}
          </div>
          {emContagem && (
            <form onSubmit={ler} className="flex items-end gap-3">
              <CampoTexto className="flex-1" rotulo="Leitor de código de barras" icone={<ScanLine size={17} />} autoFocus value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              {ultima && <p className="pb-3 text-sm font-semibold text-ok-fg">{ultima}</p>}
            </form>
          )}
          <div className="overflow-hidden rounded-2xl border border-borda">
            <table className="w-full text-sm">
              <thead className="bg-superficie-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Produto</th>
                  <th className="px-3 py-2.5 text-right">No sistema</th>
                  <th className="w-36 px-3 py-2.5 text-right">Contado</th>
                  <th className="px-4 py-2.5 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {inv.itens.map((i) => (
                  <tr key={i.produto_id} className={`border-t border-borda ${!i.contado ? 'bg-aviso-bg/30' : ''}`}>
                    <td className="px-4 py-2">
                      <p className="font-semibold text-texto">{i.nome}</p>
                      <p className="tabular text-xs text-texto-3">{i.codigo_barras ?? i.codigo}</p>
                    </td>
                    <td className="tabular px-3 py-2 text-right">{quantidade(i.estoque_sistema, i.unidade)}</td>
                    <td className="px-3 py-2">
                      {emContagem ? (
                        <input
                          aria-label={`Contado de ${i.nome}`}
                          inputMode="decimal"
                          placeholder="Não contado"
                          value={edicao[i.produto_id] ?? (i.quantidade_contada === null ? '' : quantidade(i.quantidade_contada, i.unidade))}
                          onChange={(e) => setEdicao({ ...edicao, [i.produto_id]: e.target.value.replace(/[^\d,]/g, '') })}
                          onBlur={() => gravar(i.produto_id)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          className="tabular h-9 w-full rounded-lg border border-borda bg-superficie-2 px-2 text-right text-sm text-texto outline-none focus:border-primaria"
                        />
                      ) : (
                        <p className="tabular text-right">{i.quantidade_contada === null ? '—' : quantidade(i.quantidade_contada, i.unidade)}</p>
                      )}
                    </td>
                    <td className="tabular px-4 py-2 text-right">
                      {i.diferenca === null || i.diferenca === undefined ? (
                        <span className="text-texto-3">—</span>
                      ) : i.diferenca === 0 ? (
                        <Pilula tom="ok">Confere</Pilula>
                      ) : (
                        <Pilula tom={i.diferenca > 0 ? 'info' : 'erro'}>{i.diferenca > 0 ? '+' : ''}{quantidade(i.diferenca, i.unidade)}</Pilula>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Gaveta>
  )
}

const NOMES_SIT: Record<string, [string, 'aviso' | 'ok' | 'neutro']> = { em_contagem: ['Em contagem', 'aviso'], finalizado: ['Finalizado', 'ok'], cancelado: ['Cancelado', 'neutro'] }

export function ListaInventarios({ abrir, novo }: { abrir: (id: string) => void; novo: () => void }) {
  const [situacao, setSituacao] = useState('')
  const q = useQuery({ queryKey: ['inventarios', situacao], queryFn: () => api.get<{ itens: InventarioLista[] }>('/inventarios', { situacao }).then((r) => r.itens) })
  const colunas: Coluna<InventarioLista>[] = [
    { chave: 'n', titulo: 'Nº', render: (i) => <span className="tabular font-semibold text-texto">{i.numero}</span>, largura: '70px' },
    { chave: 'd', titulo: 'Descrição', render: (i) => <span className="font-medium text-texto">{i.descricao}</span> },
    { chave: 'c', titulo: 'Criado em', render: (i) => <span className="tabular">{dataHora(i.criado_em)}</span>, ocultarCelular: true },
    { chave: 'p', titulo: 'Contados', alinhar: 'direita', render: (i) => <span className="tabular">{i.contados} de {i.total_produtos}</span> },
    { chave: 's', titulo: 'Situação', alinhar: 'direita', render: (i) => <Pilula tom={NOMES_SIT[i.situacao][1]}>{NOMES_SIT[i.situacao][0]}</Pilula> },
  ]
  return (
    <Card>
      <BarraFiltros>
        <Selecao className="w-44" rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="">Todos</option>
          <option value="em_contagem">Em contagem</option>
          <option value="finalizado">Finalizados</option>
          <option value="cancelado">Cancelados</option>
        </Selecao>
      </BarraFiltros>
      <Tabela
        colunas={colunas}
        linhas={q.data}
        carregando={q.isFetching}
        chaveLinha={(i) => i.id}
        aoClicarLinha={(i) => abrir(i.id)}
        vazio={{ titulo: 'Nenhum inventário', descricao: 'Crie um inventário para contar o estoque e corrigir as diferenças.', acao: <Botao icone={<ClipboardList size={16} />} onClick={novo}>Novo inventário</Botao> }}
      />
    </Card>
  )
}
