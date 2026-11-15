import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ClipboardList, Download, PackagePlus, Search, SlidersHorizontal } from 'lucide-react'
import { api, baixarArquivo, mensagemErro } from '../../api/cliente'
import type { EstoqueBaixoItem, Lista, Movimentacao, PosicaoEstoque, Produto } from '../../api/tipos'
import { useCategorias, useFornecedoresAtivos, useOperadores } from '../../api/consultas'
import { useAtraso } from '../../ganchos/useAtraso'
import { Abas, BarraFiltros, CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card } from '../../componentes/ui/Card'
import { CampoTexto, CaixaMarcar, Selecao, CampoData } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { Pilula } from '../../componentes/ui/Pilula'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { BuscaProduto } from '../../componentes/ui/BuscaProduto'
import { useAvisos } from '../../componentes/ui/Avisos'
import { dataHora, dinheiro, hojeIso, NOMES_MOVIMENTACAO, NOMES_MOTIVO_AJUSTE, quantidade } from '../../utils/formatos'
import { ModalAjuste, type ProdutoAjuste } from './ModalAjuste'
import { GavetaEntrada, ListaEntradas } from './Entradas'
import { GavetaInventario, ListaInventarios, ModalNovoInventario } from './Inventarios'

type Aba = 'posicao' | 'baixo' | 'movimentacoes' | 'entradas' | 'inventarios'

const SIT: Record<string, ['ok' | 'aviso' | 'erro', string]> = { ok: ['ok', 'Normal'], baixo: ['aviso', 'Baixo'], zerado: ['erro', 'Zerado'], negativo: ['erro', 'Negativo'] }

function Posicao({ ajustar }: { ajustar: (p: ProdutoAjuste) => void }) {
  const categorias = useCategorias('todos')
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [baixo, setBaixo] = useState(false)
  const [comSaldo, setComSaldo] = useState(false)
  const atraso = useAtraso(busca)
  const q = useQuery({
    queryKey: ['estoque', 'posicao', atraso, categoria, baixo, comSaldo],
    queryFn: () =>
      api.get<{ itens: PosicaoEstoque[]; totais: { itens: number; valor_custo: number; valor_venda: number } }>('/estoque/posicao', {
        busca: atraso, categoria_id: categoria, somente_baixo: baixo || undefined, somente_com_saldo: comSaldo || undefined,
      }),
    placeholderData: keepPreviousData,
  })
  const colunas: Coluna<PosicaoEstoque>[] = [
    { chave: 'c', titulo: 'Código', render: (p) => <span className="tabular text-texto-3">{p.codigo}</span>, largura: '90px' },
    { chave: 'n', titulo: 'Produto', render: (p) => <span className="font-semibold text-texto">{p.nome}</span> },
    { chave: 'cat', titulo: 'Categoria', render: (p) => p.categoria_nome ?? 'Sem categoria', ocultarCelular: true },
    { chave: 'e', titulo: 'Estoque', alinhar: 'direita', render: (p) => <span className="tabular font-semibold text-texto">{quantidade(p.estoque_atual, p.unidade)} {p.unidade}</span> },
    { chave: 'm', titulo: 'Mínimo', alinhar: 'direita', render: (p) => <span className="tabular">{quantidade(p.estoque_minimo, p.unidade)}</span>, ocultarCelular: true },
    { chave: 'cu', titulo: 'Custo', alinhar: 'direita', render: (p) => <span className="tabular">{dinheiro(p.preco_custo)}</span>, ocultarCelular: true },
    { chave: 'vc', titulo: 'Valor em estoque', alinhar: 'direita', render: (p) => <span className="tabular">{dinheiro(p.valor_custo)}</span> },
    { chave: 's', titulo: 'Situação', alinhar: 'direita', render: (p) => (p.situacao_estoque === 'ok' ? <span className="text-texto-3">Normal</span> : <Pilula tom={SIT[p.situacao_estoque][0]}>{SIT[p.situacao_estoque][1]}</Pilula>) },
  ]
  return (
    <Card>
      <BarraFiltros>
        <CampoTexto className="w-full sm:w-72" rotulo="Buscar" icone={<Search size={16} />} placeholder="Nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Selecao className="w-44" rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas</option>
          {categorias.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </Selecao>
        <div className="flex gap-4 pb-3">
          <CaixaMarcar rotulo="Só estoque baixo" marcado={baixo} aoMudar={setBaixo} />
          <CaixaMarcar rotulo="Só com saldo" marcado={comSaldo} aoMudar={setComSaldo} />
        </div>
      </BarraFiltros>
      <Tabela
        colunas={colunas}
        linhas={q.data?.itens}
        carregando={q.isFetching}
        chaveLinha={(p) => p.id}
        alturaMax="max-h-[calc(100vh-380px)]"
        aoClicarLinha={(p) => ajustar({ id: p.id, nome: p.nome, unidade: p.unidade, estoque_atual: p.estoque_atual, fracionavel: ['KG', 'L', 'M'].includes(p.unidade) })}
        vazio={{ titulo: 'Nenhum produto encontrado', descricao: 'Só aparecem produtos que controlam estoque.' }}
        rodape={
          q.data && (
            <div className="tabular flex flex-wrap justify-between gap-3 text-sm">
              <span className="text-texto-3">{q.data.totais.itens} produtos · clique numa linha para ajustar</span>
              <span className="text-texto-2">
                Valor de custo <b className="text-texto">{dinheiro(q.data.totais.valor_custo)}</b> · valor de venda <b className="text-texto">{dinheiro(q.data.totais.valor_venda)}</b>
              </span>
            </div>
          )
        }
      />
    </Card>
  )
}

function Baixo() {
  const fornecedores = useFornecedoresAtivos()
  const { erro } = useAvisos()
  const [fornecedor, setFornecedor] = useState('')
  const q = useQuery({
    queryKey: ['estoque', 'baixo', fornecedor],
    queryFn: () => api.get<{ itens: EstoqueBaixoItem[]; totais: { valor_estimado: number } }>('/estoque/baixo', { fornecedor_id: fornecedor }),
  })
  const colunas: Coluna<EstoqueBaixoItem>[] = [
    { chave: 'n', titulo: 'Produto', render: (p) => <span className="font-semibold text-texto">{p.nome}</span> },
    { chave: 'f', titulo: 'Fornecedor', render: (p) => p.fornecedor_nome ?? '—', ocultarCelular: true },
    { chave: 'e', titulo: 'Estoque', alinhar: 'direita', render: (p) => <Pilula tom={p.estoque_atual <= 0 ? 'erro' : 'aviso'}>{quantidade(p.estoque_atual, p.unidade)} {p.unidade}</Pilula> },
    { chave: 'm', titulo: 'Mínimo', alinhar: 'direita', render: (p) => <span className="tabular">{quantidade(p.estoque_minimo, p.unidade)}</span> },
    { chave: 's', titulo: 'Comprar', alinhar: 'direita', render: (p) => <span className="tabular font-bold text-primaria">{quantidade(p.sugestao_compra, p.unidade)} {p.unidade}</span> },
    { chave: 'c', titulo: 'Último custo', alinhar: 'direita', render: (p) => <span className="tabular">{dinheiro(p.ultimo_custo)}</span>, ocultarCelular: true },
    { chave: 'v', titulo: 'Valor estimado', alinhar: 'direita', render: (p) => <span className="tabular font-semibold text-texto">{dinheiro(p.valor_estimado)}</span> },
  ]
  return (
    <Card>
      <BarraFiltros>
        <Selecao className="w-56" rotulo="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
          <option value="">Todos</option>
          {fornecedores.data?.map((f) => (
            <option key={f.id} value={f.id}>{f.nome_fantasia}</option>
          ))}
        </Selecao>
        <Botao
          variante="contorno"
          icone={<Download size={16} />}
          onClick={() => baixarArquivo('/estoque/baixo', { formato: 'csv', fornecedor_id: fornecedor }, `estoque_baixo_${hojeIso()}.csv`).catch((e) => erro(mensagemErro(e)))}
        >
          Baixar planilha
        </Botao>
      </BarraFiltros>
      <p className="mb-3 text-xs text-texto-3">Sugestão de compra = mínimo × 2 − estoque atual. Mais críticos primeiro.</p>
      <Tabela
        colunas={colunas}
        linhas={q.data?.itens}
        carregando={q.isFetching}
        chaveLinha={(p) => p.id}
        vazio={{ titulo: 'Estoque em dia', descricao: 'Nenhum produto está abaixo do mínimo.' }}
        rodape={q.data && <p className="tabular text-right text-sm text-texto-2">Valor estimado da compra: <b className="text-texto">{dinheiro(q.data.totais.valor_estimado)}</b></p>}
      />
    </Card>
  )
}

function Movimentacoes() {
  const operadores = useOperadores()
  const [produto, setProduto] = useState<Produto | null>(null)
  const [tipo, setTipo] = useState('')
  const [usuario, setUsuario] = useState('')
  const [inicio, setInicio] = useState(hojeIso(-30))
  const [fim, setFim] = useState(hojeIso())
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['estoque', 'mov', produto?.id, tipo, usuario, inicio, fim, pagina],
    queryFn: () => api.get<Lista<Movimentacao>>('/estoque/movimentacoes', { produto_id: produto?.id, tipo, usuario_id: usuario, inicio, fim, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })
  const colunas: Coluna<Movimentacao>[] = [
    { chave: 'd', titulo: 'Data e hora', render: (m) => <span className="tabular">{dataHora(m.data_hora)}</span> },
    { chave: 'p', titulo: 'Produto', render: (m) => <span className="font-semibold text-texto">{m.produto_nome}</span> },
    {
      chave: 't',
      titulo: 'Tipo',
      render: (m) => (
        <span>
          {NOMES_MOVIMENTACAO[m.tipo] ?? m.tipo}
          {m.motivo && <span className="block text-xs text-texto-3">{NOMES_MOTIVO_AJUSTE[m.motivo] ?? m.motivo}{m.motivo_texto ? `: ${m.motivo_texto}` : ''}</span>}
        </span>
      ),
    },
    {
      chave: 'q',
      titulo: 'Quantidade',
      alinhar: 'direita',
      render: (m) => <span className={`tabular font-semibold ${m.quantidade_com_sinal < 0 ? 'text-erro-fg' : 'text-ok-fg'}`}>{m.quantidade_com_sinal > 0 ? '+' : ''}{quantidade(m.quantidade_com_sinal, m.unidade)}</span>,
    },
    { chave: 'sa', titulo: 'Antes → depois', alinhar: 'direita', render: (m) => <span className="tabular">{quantidade(m.saldo_anterior, m.unidade)} → {quantidade(m.saldo_posterior, m.unidade)}</span> },
    { chave: 'u', titulo: 'Usuário', render: (m) => m.usuario_nome, ocultarCelular: true },
    { chave: 'o', titulo: 'Origem', render: (m) => (m.origem_numero ? `${m.origem_tipo === 'venda' ? 'Venda' : m.origem_tipo === 'entrada' ? 'Entrada' : m.origem_tipo === 'devolucao' ? 'Devolução' : m.origem_tipo === 'inventario' ? 'Inventário' : ''} nº ${m.origem_numero}` : '—'), ocultarCelular: true },
  ]
  return (
    <Card>
      <BarraFiltros>
        {produto ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-texto-2">Produto</span>
            <button type="button" onClick={() => setProduto(null)} className="flex h-11 items-center gap-2 rounded-[var(--radius-campo)] border border-primaria bg-floresta-50 px-3.5 text-sm font-semibold text-primaria dark:bg-superficie-2">
              {produto.nome} ×
            </button>
          </div>
        ) : (
          <BuscaProduto className="w-64" rotulo="Produto" placeholder="Todos" aoEscolher={(p) => { setProduto(p); setPagina(1) }} />
        )}
        <Selecao className="w-44" rotulo="Tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1) }}>
          <option value="">Todos</option>
          {Object.entries(NOMES_MOVIMENTACAO).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Selecao>
        <Selecao className="w-44" rotulo="Usuário" value={usuario} onChange={(e) => { setUsuario(e.target.value); setPagina(1) }}>
          <option value="">Todos</option>
          {operadores.data?.map((o) => (
            <option key={o.id} value={o.id}>{o.nome}</option>
          ))}
        </Selecao>
        <CampoData className="w-40" rotulo="De" valor={inicio} aoMudar={(v) => { setInicio(v); setPagina(1) }} />
        <CampoData className="w-40" rotulo="Até" valor={fim} aoMudar={(v) => { setFim(v); setPagina(1) }} />
      </BarraFiltros>
      <Tabela colunas={colunas} linhas={q.data?.itens} carregando={q.isFetching} chaveLinha={(m) => m.id} vazio={{ titulo: 'Nenhuma movimentação encontrada', descricao: 'Mude o período ou os filtros.' }} />
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
    </Card>
  )
}

export function Estoque() {
  const [params, setParams] = useSearchParams()
  const aba = (params.get('aba') as Aba) || 'posicao'
  const [ajuste, setAjuste] = useState<{ aberto: boolean; produto: ProdutoAjuste | null }>({ aberto: false, produto: null })
  const [entrada, setEntrada] = useState<{ aberto: boolean; id: string | null }>({ aberto: false, id: null })
  const [novoInv, setNovoInv] = useState(false)
  const [inventario, setInventario] = useState<string | null>(null)
  const baixo = useQuery({ queryKey: ['estoque-baixo-total'], queryFn: () => api.get<{ itens: unknown[] }>('/estoque/baixo').then((r) => r.itens.length) })

  return (
    <div>
      <CabecalhoPagina
        titulo="Estoque"
        descricao="Quanto tem de cada produto e por que o número mudou."
        acoes={
          <>
            <Botao variante="contorno" icone={<SlidersHorizontal size={17} />} onClick={() => setAjuste({ aberto: true, produto: null })}>
              Ajustar estoque
            </Botao>
            <Botao variante="contorno" icone={<ClipboardList size={17} />} onClick={() => setNovoInv(true)}>
              Novo inventário
            </Botao>
            <Botao icone={<PackagePlus size={18} />} onClick={() => setEntrada({ aberto: true, id: null })}>
              Entrada de mercadoria
            </Botao>
          </>
        }
      />
      <Abas
        ativa={aba}
        aoMudar={(a) => setParams(a === 'posicao' ? {} : { aba: a })}
        abas={[
          { valor: 'posicao', rotulo: 'Posição' },
          { valor: 'baixo', rotulo: 'Estoque baixo', contagem: baixo.data },
          { valor: 'movimentacoes', rotulo: 'Movimentações' },
          { valor: 'entradas', rotulo: 'Entradas' },
          { valor: 'inventarios', rotulo: 'Inventários' },
        ]}
      />
      {aba === 'posicao' && <Posicao ajustar={(p) => setAjuste({ aberto: true, produto: p })} />}
      {aba === 'baixo' && <Baixo />}
      {aba === 'movimentacoes' && <Movimentacoes />}
      {aba === 'entradas' && <ListaEntradas abrir={(id) => setEntrada({ aberto: true, id })} />}
      {aba === 'inventarios' && <ListaInventarios abrir={setInventario} novo={() => setNovoInv(true)} />}

      <ModalAjuste aberto={ajuste.aberto} produtoInicial={ajuste.produto} aoFechar={() => setAjuste({ aberto: false, produto: null })} />
      <GavetaEntrada aberto={entrada.aberto} entradaId={entrada.id} aoFechar={() => setEntrada({ aberto: false, id: null })} />
      <ModalNovoInventario
        aberto={novoInv}
        aoFechar={() => setNovoInv(false)}
        aoCriar={(id) => {
          setNovoInv(false)
          setParams({ aba: 'inventarios' })
          setInventario(id)
        }}
      />
      <GavetaInventario id={inventario} aoFechar={() => setInventario(null)} />
    </div>
  )
}
