import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, ScanLine, Search, Tag } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Categoria, Lista, Produto } from '../../api/tipos'
import { useCategorias } from '../../api/consultas'
import { useUsuario } from '../../ganchos/useSessao'
import { useAtraso } from '../../ganchos/useAtraso'
import { pode } from '../../utils/permissoes'
import { Abas, BarraFiltros, CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card } from '../../componentes/ui/Card'
import { CampoTexto, CaixaMarcar, Selecao } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { Pilula } from '../../componentes/ui/Pilula'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { Modal } from '../../componentes/ui/Modal'
import { useAvisos } from '../../componentes/ui/Avisos'
import { dinheiro, quantidade } from '../../utils/formatos'
import { FormProduto } from './FormProduto'

export function PilulaEstoque({ p }: { p: { controla_estoque?: boolean; estoque_atual: number; estoque_baixo?: boolean; unidade: string } }) {
  if (p.controla_estoque === false) return <span className="text-texto-3">Não controla</span>
  const txt = `${quantidade(p.estoque_atual, p.unidade)} ${p.unidade}`
  if (p.estoque_atual <= 0) return <Pilula tom="erro">{txt}</Pilula>
  if (p.estoque_baixo) return <Pilula tom="aviso">{txt}</Pilula>
  return <span className="tabular font-medium text-texto">{txt}</span>
}

function ConsultaPreco({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [p, setP] = useState<Produto | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (aberto) { setCodigo(''); setP(null); setErro(null) }
  }, [aberto])
  async function consultar(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) return
    setErro(null)
    try {
      setP(await api.get<Produto>(`/produtos/codigo/${encodeURIComponent(codigo.trim())}`))
    } catch (er) {
      setP(null)
      setErro(er instanceof ErroApi && er.status === 404 ? `Código ${codigo} não encontrado.` : mensagemErro(er))
    }
    setCodigo('')
  }
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Consultar preço" descricao="Leia o código de barras ou digite o código." largura="sm">
      <form onSubmit={consultar}>
        <CampoTexto data-autofoco icone={<ScanLine size={17} />} value={codigo} onChange={(e) => setCodigo(e.target.value)} aria-label="Código" erro={erro} />
      </form>
      {p && (
        <div className="card-destaque ondas mt-4 rounded-2xl p-5">
          <p className="text-sm font-semibold text-creme/85">{p.nome}</p>
          <p className="tabular mt-1 text-4xl font-extrabold text-creme">{dinheiro(p.preco_venda)}</p>
          <p className="tabular mt-2 text-xs text-creme-2">
            {p.controla_estoque ? `Estoque: ${quantidade(p.estoque_atual, p.unidade)} ${p.unidade}` : 'Não controla estoque'} · código {p.codigo}
          </p>
        </div>
      )}
    </Modal>
  )
}

function ListaProdutos({ abrirForm }: { abrirForm: (p: Produto | null) => void }) {
  const usuario = useUsuario()
  const editar = pode.editarCadastros(usuario.perfil)
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState(params.get('busca') ?? '')
  const [categoria, setCategoria] = useState('')
  const [situacao, setSituacao] = useState('ativos')
  const [baixo, setBaixo] = useState(false)
  const [ordenar, setOrdenar] = useState('nome')
  const [pagina, setPagina] = useState(1)
  const categorias = useCategorias('todos')
  const atraso = useAtraso(busca)

  useEffect(() => {
    const b = params.get('busca')
    if (b !== null) setBusca(b)
  }, [params])
  useEffect(() => setPagina(1), [atraso, categoria, situacao, baixo, ordenar])

  const q = useQuery({
    queryKey: ['produtos', atraso, categoria, situacao, baixo, ordenar, pagina],
    queryFn: () =>
      api.get<Lista<Produto>>('/produtos', {
        busca: atraso,
        categoria_id: categoria,
        situacao,
        estoque_baixo: baixo || undefined,
        ordenar,
        direcao: ordenar === 'nome' ? 'asc' : 'desc',
        pagina,
        por_pagina: 50,
      }),
    placeholderData: keepPreviousData,
  })

  const colunas: Coluna<Produto>[] = [
    { chave: 'codigo', titulo: 'Código', render: (p) => <span className="tabular text-texto-3">{p.codigo}</span>, largura: '90px' },
    {
      chave: 'nome',
      titulo: 'Produto',
      render: (p) => (
        <div>
          <p className="font-semibold text-texto">{p.nome}</p>
          <p className="tabular text-xs text-texto-3">{p.codigo_barras ?? 'Sem código de barras'}</p>
        </div>
      ),
    },
    { chave: 'categoria', titulo: 'Categoria', render: (p) => p.categoria_nome ?? <span className="text-texto-3">Sem categoria</span>, ocultarCelular: true },
    { chave: 'un', titulo: 'Un.', render: (p) => p.unidade, ocultarCelular: true },
    { chave: 'preco', titulo: 'Preço', alinhar: 'direita', render: (p) => <span className="tabular font-semibold text-texto">{dinheiro(p.preco_venda)}</span> },
    { chave: 'estoque', titulo: 'Estoque', alinhar: 'direita', render: (p) => <PilulaEstoque p={p} /> },
    { chave: 'sit', titulo: 'Situação', alinhar: 'direita', render: (p) => (p.ativo ? <Pilula tom="ok">Ativo</Pilula> : <Pilula tom="neutro">Inativo</Pilula>), ocultarCelular: true },
  ]

  return (
    <Card>
        <BarraFiltros>
          <CampoTexto
            className="w-full sm:w-72"
            rotulo="Buscar"
            placeholder="Nome, código ou código de barras"
            icone={<Search size={16} />}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              if (params.get('busca')) setParams({}, { replace: true })
            }}
          />
          <Selecao className="w-44" rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            <option value="sem">Sem categoria</option>
            {categorias.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </Selecao>
          <Selecao className="w-36" rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </Selecao>
          <Selecao className="w-40" rotulo="Ordenar por" value={ordenar} onChange={(e) => setOrdenar(e.target.value)}>
            <option value="nome">Nome</option>
            <option value="estoque">Estoque</option>
            <option value="preco">Preço</option>
            <option value="codigo">Código</option>
          </Selecao>
          <div className="pb-3">
            <CaixaMarcar rotulo="Só estoque baixo" marcado={baixo} aoMudar={setBaixo} />
          </div>
        </BarraFiltros>
        <Tabela
          colunas={colunas}
          linhas={q.data?.itens}
          carregando={q.isFetching}
          chaveLinha={(p) => p.id}
          aoClicarLinha={(p) => abrirForm(p)}
          vazio={{
            titulo: atraso ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado',
            descricao: atraso ? 'Confira a escrita ou busque pelo código.' : 'Cadastre o primeiro produto: basta nome e preço.',
            acao: editar && !atraso ? <Botao icone={<Plus size={16} />} onClick={() => abrirForm(null)}>Novo produto</Botao> : undefined,
          }}
        />
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
    </Card>
  )
}

function ListaCategorias({ novaVez }: { novaVez: number }) {
  const usuario = useUsuario()
  const editar = pode.editarCadastros(usuario.perfil)
  const qc = useQueryClient()
  const { confirmar, sucesso, erro } = useAvisos()
  const lista = useCategorias('todos')
  const [edicao, setEdicao] = useState<{ cat: Categoria | null; nome: string } | null>(null)
  const [erroNome, setErroNome] = useState<string | null>(null)
  useEffect(() => {
    if (novaVez > 0) {
      setErroNome(null)
      setEdicao({ cat: null, nome: '' })
    }
  }, [novaVez])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!edicao) return
    if (edicao.nome.trim().length < 2) return setErroNome('Informe o nome da categoria.')
    try {
      if (edicao.cat) await api.put(`/categorias/${edicao.cat.id}`, { nome: edicao.nome.trim(), versao: edicao.cat.versao })
      else await api.post('/categorias', { nome: edicao.nome.trim() })
      sucesso('Categoria salva.')
      setEdicao(null)
      qc.invalidateQueries({ queryKey: ['categorias'] })
    } catch (er) {
      setErroNome(er instanceof ErroApi && er.campos?.nome ? er.campos.nome : mensagemErro(er))
    }
  }

  async function situacao(c: Categoria) {
    if (c.ativo) {
      const ok = await confirmar({ titulo: `Inativar ${c.nome}?`, mensagem: 'Ela some dos novos cadastros, mas continua nos produtos que já a usam.', confirmar: 'Inativar categoria' })
      if (ok === null) return
    }
    try {
      await api.post(`/categorias/${c.id}/${c.ativo ? 'inativar' : 'reativar'}`)
      qc.invalidateQueries({ queryKey: ['categorias'] })
    } catch (er) {
      erro(mensagemErro(er))
    }
  }

  const colunas: Coluna<Categoria>[] = [
    { chave: 'nome', titulo: 'Categoria', render: (c) => <span className="flex items-center gap-2 font-semibold text-texto"><Tag size={15} className="text-texto-3" />{c.nome}</span> },
    { chave: 'qtd', titulo: 'Produtos', alinhar: 'direita', render: (c) => <span className="tabular">{c.quantidade_produtos}</span> },
    { chave: 'sit', titulo: 'Situação', render: (c) => (c.ativo ? <Pilula tom="ok">Ativa</Pilula> : <Pilula tom="neutro">Inativa</Pilula>) },
    {
      chave: 'acoes',
      titulo: '',
      alinhar: 'direita',
      render: (c) =>
        editar && (
          <span className="inline-flex gap-1">
            <Botao variante="fantasma" tamanho="sm" icone={<Pencil size={14} />} onClick={() => { setErroNome(null); setEdicao({ cat: c, nome: c.nome }) }}>
              Renomear
            </Botao>
            <Botao variante="fantasma" tamanho="sm" onClick={() => situacao(c)}>
              {c.ativo ? 'Inativar' : 'Reativar'}
            </Botao>
          </span>
        ),
    },
  ]
  return (
    <>
      <Card>
        <Tabela colunas={colunas} linhas={lista.data} carregando={lista.isLoading} chaveLinha={(c) => c.id} vazio={{ titulo: 'Nenhuma categoria', descricao: 'Crie categorias para organizar os produtos e os relatórios.' }} />
      </Card>
      <Modal aberto={!!edicao} aoFechar={() => setEdicao(null)} titulo={edicao?.cat ? 'Renomear categoria' : 'Nova categoria'} largura="sm">
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <CampoTexto rotulo="Nome" data-autofoco maxLength={50} value={edicao?.nome ?? ''} onChange={(e) => setEdicao((x) => (x ? { ...x, nome: e.target.value } : x))} erro={erroNome} />
          <Botao type="submit">Salvar categoria</Botao>
        </form>
      </Modal>
    </>
  )
}

export function Produtos() {
  const usuario = useUsuario()
  const editar = pode.editarCadastros(usuario.perfil)
  const [aba, setAba] = useState<'produtos' | 'categorias'>('produtos')
  const [form, setForm] = useState<{ aberto: boolean; produto: Produto | null }>({ aberto: false, produto: null })
  const [consulta, setConsulta] = useState(false)
  const [novaCategoria, setNovaCategoria] = useState(0)
  return (
    <div>
      <CabecalhoPagina
        titulo="Produtos"
        descricao="O que a loja vende, com preço e estoque."
        acoes={
          aba === 'produtos' ? (
            <>
              <Botao variante="contorno" icone={<ScanLine size={17} />} onClick={() => setConsulta(true)}>
                Consultar preço
              </Botao>
              {editar && (
                <Botao icone={<Plus size={18} />} onClick={() => setForm({ aberto: true, produto: null })}>
                  Novo produto
                </Botao>
              )}
            </>
          ) : (
            editar && (
              <Botao icone={<Plus size={18} />} onClick={() => setNovaCategoria((n) => n + 1)}>
                Nova categoria
              </Botao>
            )
          )
        }
      />
      <Abas abas={[{ valor: 'produtos', rotulo: 'Produtos' }, { valor: 'categorias', rotulo: 'Categorias' }]} ativa={aba} aoMudar={setAba} />
      {aba === 'produtos' ? <ListaProdutos abrirForm={(p) => setForm({ aberto: true, produto: p })} /> : <ListaCategorias novaVez={novaCategoria} />}
      <FormProduto aberto={form.aberto} produto={form.produto} aoFechar={() => setForm({ aberto: false, produto: null })} />
      <ConsultaPreco aberto={consulta} aoFechar={() => setConsulta(false)} />
    </div>
  )
}
