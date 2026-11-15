import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Search } from 'lucide-react'
import { api } from '../../api/cliente'
import type { Lista, SessaoCaixa, SessaoCaixaLista, VendaLista } from '../../api/tipos'
import { useOperadores } from '../../api/consultas'
import { useUsuario } from '../../ganchos/useSessao'
import { pode } from '../../utils/permissoes'
import { Abas, BarraFiltros, CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card } from '../../componentes/ui/Card'
import { CampoTexto, Selecao, CampoData } from '../../componentes/ui/Campo'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { Pilula } from '../../componentes/ui/Pilula'
import { Botao } from '../../componentes/ui/Botao'
import { useAvisos } from '../../componentes/ui/Avisos'
import { dataHora, dinheiro, duracao, hojeIso, NOMES_FORMA } from '../../utils/formatos'
import { DetalheVenda } from './DetalheVenda'
import { ModalFechamento } from '../caixa/ModalFechamento'

function ListaVendas() {
  const usuario = useUsuario()
  const sup = pode.cancelarVendaDireto(usuario.perfil)
  const [filtros, setFiltros] = useState({ inicio: hojeIso(), fim: hojeIso(), operador_id: '', forma: '', situacao: '', numero: '' })
  const [pagina, setPagina] = useState(1)
  const [aberta, setAberta] = useState<string | null>(null)
  const operadores = useOperadores(sup)

  const q = useQuery({
    queryKey: ['vendas', filtros, pagina],
    queryFn: () =>
      api.get<Lista<VendaLista> & { totais: { quantidade: number; quantidade_finalizadas: number; soma_finalizadas: number } }>('/vendas', {
        ...filtros,
        numero: filtros.numero.replace(/\D/g, ''),
        pagina,
        por_pagina: 50,
      }),
    placeholderData: keepPreviousData,
  })
  const mudar = (k: keyof typeof filtros, v: string) => {
    setFiltros((f) => ({ ...f, [k]: v }))
    setPagina(1)
  }

  const colunas: Coluna<VendaLista>[] = [
    { chave: 'numero', titulo: 'Nº', render: (v) => <span className="tabular font-semibold text-texto">{v.numero}</span>, largura: '80px' },
    { chave: 'data', titulo: 'Data e hora', render: (v) => <span className="tabular">{dataHora(v.finalizada_em)}</span> },
    { chave: 'operador', titulo: 'Operador', render: (v) => v.operador_nome, ocultarCelular: true },
    { chave: 'cliente', titulo: 'Cliente', render: (v) => v.cliente_nome ?? <span className="text-texto-3">—</span>, ocultarCelular: true },
    { chave: 'formas', titulo: 'Pagamento', render: (v) => v.formas_resumo },
    { chave: 'total', titulo: 'Total', alinhar: 'direita', render: (v) => <span className={`tabular font-semibold ${v.situacao === 'cancelada' ? 'text-texto-3 line-through' : 'text-texto'}`}>{dinheiro(v.total)}</span> },
    { chave: 'situacao', titulo: 'Situação', alinhar: 'direita', render: (v) => (v.situacao === 'cancelada' ? <Pilula tom="erro">Cancelada</Pilula> : <Pilula tom="ok">Finalizada</Pilula>) },
  ]

  return (
    <Card>
      <BarraFiltros>
        <CampoTexto className="w-36" rotulo="Nº da venda" icone={<Search size={16} />} value={filtros.numero} onChange={(e) => mudar('numero', e.target.value)} inputMode="numeric" />
        {sup && (
          <>
            <CampoData className="w-40" rotulo="De" valor={filtros.inicio} aoMudar={(v) => mudar('inicio', v)} />
            <CampoData className="w-40" rotulo="Até" valor={filtros.fim} aoMudar={(v) => mudar('fim', v)} />
            <Selecao className="w-44" rotulo="Operador" value={filtros.operador_id} onChange={(e) => mudar('operador_id', e.target.value)}>
              <option value="">Todos</option>
              {operadores.data?.map((o) => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </Selecao>
          </>
        )}
        <Selecao className="w-36" rotulo="Pagamento" value={filtros.forma} onChange={(e) => mudar('forma', e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(NOMES_FORMA).map(([k, n]) => (
            <option key={k} value={k}>{n}</option>
          ))}
        </Selecao>
        <Selecao className="w-36" rotulo="Situação" value={filtros.situacao} onChange={(e) => mudar('situacao', e.target.value)}>
          <option value="">Todas</option>
          <option value="finalizada">Finalizadas</option>
          <option value="cancelada">Canceladas</option>
        </Selecao>
      </BarraFiltros>
      {!sup && <p className="mb-3 text-xs text-texto-3">Você vê as vendas do seu caixa aberto.</p>}
      <Tabela
        colunas={colunas}
        linhas={q.data?.itens}
        carregando={q.isFetching}
        chaveLinha={(v) => v.id}
        aoClicarLinha={(v) => setAberta(v.id)}
        vazio={{ titulo: 'Nenhuma venda encontrada', descricao: sup ? 'Mude o período ou os filtros para ver outras vendas.' : 'As vendas do seu caixa aparecem aqui.' }}
        rodape={
          q.data && (
            <div className="tabular flex flex-wrap justify-between gap-2 text-sm">
              <span className="text-texto-3">
                {q.data.totais.quantidade} vendas · {q.data.totais.quantidade_finalizadas} finalizadas
              </span>
              <span className="font-semibold text-texto">Soma das finalizadas: {dinheiro(q.data.totais.soma_finalizadas)}</span>
            </div>
          )
        }
      />
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
      <DetalheVenda id={aberta} aoFechar={() => setAberta(null)} />
    </Card>
  )
}

function ListaCaixas() {
  const qc = useQueryClient()
  const { sucesso } = useAvisos()
  const [situacao, setSituacao] = useState<'aberto' | 'fechado'>('aberto')
  const [pagina, setPagina] = useState(1)
  const [fechar, setFechar] = useState<SessaoCaixa | null>(null)
  const q = useQuery({
    queryKey: ['caixas', situacao, pagina],
    queryFn: () => api.get<Lista<SessaoCaixaLista>>('/caixa/sessoes', { situacao, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })

  async function abrirFechamento(id: string) {
    const s = await api.get<SessaoCaixa>(`/caixa/sessoes/${id}`)
    setFechar(s)
  }

  const colunas: Coluna<SessaoCaixaLista>[] = [
    { chave: 'numero', titulo: 'Nº', render: (s) => <span className="tabular font-semibold text-texto">{s.numero}</span>, largura: '70px' },
    { chave: 'operador', titulo: 'Operador', render: (s) => <span className="font-medium text-texto">{s.operador_nome}</span> },
    { chave: 'terminal', titulo: 'Computador', render: (s) => s.terminal ?? '—', ocultarCelular: true },
    { chave: 'aberto', titulo: 'Aberto em', render: (s) => <span className="tabular">{dataHora(s.aberto_em)}</span> },
    situacao === 'aberto'
      ? { chave: 'tempo', titulo: 'Tempo', render: (s) => (s.vencido ? <Pilula tom="aviso">Do dia anterior</Pilula> : duracao(s.minutos_aberto)) }
      : { chave: 'fechado', titulo: 'Fechado em', render: (s) => <span className="tabular">{dataHora(s.fechado_em)}</span> },
    { chave: 'vendido', titulo: 'Vendido', alinhar: 'direita', render: (s) => <span className="tabular font-semibold text-texto">{dinheiro(s.total_vendido)}</span> },
    situacao === 'aberto'
      ? {
          chave: 'acao',
          titulo: '',
          alinhar: 'direita',
          render: (s) => (
            <Botao variante="contorno" tamanho="sm" icone={<Lock size={14} />} onClick={(e) => { e.stopPropagation(); abrirFechamento(s.id) }}>
              Fechar
            </Botao>
          ),
        }
      : {
          chave: 'dif',
          titulo: 'Diferença',
          alinhar: 'direita',
          render: (s) => (
            <span className="inline-flex items-center gap-2">
              {s.fechamento_forcado && <Pilula tom="info">Forçado</Pilula>}
              <Pilula tom={!s.diferenca ? 'ok' : s.diferenca > 0 ? 'info' : 'erro'}>
                {!s.diferenca ? 'Confere' : `${s.diferenca > 0 ? 'Sobra' : 'Falta'} ${dinheiro(Math.abs(s.diferenca))}`}
              </Pilula>
            </span>
          ),
        },
  ]

  return (
    <Card>
      <BarraFiltros>
        <Selecao className="w-44" rotulo="Situação" value={situacao} onChange={(e) => { setSituacao(e.target.value as 'aberto' | 'fechado'); setPagina(1) }}>
          <option value="aberto">Abertos agora</option>
          <option value="fechado">Fechados</option>
        </Selecao>
      </BarraFiltros>
      <Tabela
        colunas={colunas}
        linhas={q.data?.itens}
        carregando={q.isFetching}
        chaveLinha={(s) => s.id}
        vazio={{ titulo: situacao === 'aberto' ? 'Nenhum caixa aberto agora' : 'Nenhum caixa fechado', descricao: 'Os caixas aparecem aqui quando alguém abre a frente de caixa.' }}
      />
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
      <ModalFechamento
        aberto={!!fechar}
        sessao={fechar}
        forcado
        aoFechar={() => setFechar(null)}
        aoConcluir={() => {
          setFechar(null)
          sucesso('Caixa fechado.')
          qc.invalidateQueries({ queryKey: ['caixas'] })
          qc.invalidateQueries({ queryKey: ['eu'] })
        }}
      />
    </Card>
  )
}

export function Vendas() {
  const usuario = useUsuario()
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba') === 'caixas' && pode.fecharCaixaDeOutro(usuario.perfil) ? 'caixas' : 'vendas'
  return (
    <div>
      <CabecalhoPagina titulo="Vendas" descricao="Encontre uma venda para conferir, reimprimir, cancelar ou trocar." />
      {pode.fecharCaixaDeOutro(usuario.perfil) && (
        <Abas
          ativa={aba}
          aoMudar={(a) => setParams(a === 'vendas' ? {} : { aba: a })}
          abas={[
            { valor: 'vendas', rotulo: 'Histórico de vendas' },
            { valor: 'caixas', rotulo: 'Caixas' },
          ]}
        />
      )}
      {aba === 'vendas' ? <ListaVendas /> : <ListaCaixas />}
    </div>
  )
}
