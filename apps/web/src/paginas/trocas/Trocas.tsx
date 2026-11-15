import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Printer, ScanLine, Search, ShoppingCart, Ticket } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Devolucao, Lista, Vale, Venda } from '../../api/tipos'
import { useEmpresaRecibo } from '../../api/consultas'
import { useUsuario } from '../../ganchos/useSessao'
import { useAtraso } from '../../ganchos/useAtraso'
import { pode } from '../../utils/permissoes'
import { Abas, BarraFiltros, CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card, CabecalhoCard } from '../../componentes/ui/Card'
import { AreaTexto, CampoTexto, CaixaMarcar, Segmentado, Selecao, CampoData } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { Pilula, type TomPilula } from '../../componentes/ui/Pilula'
import { EstadoVazio } from '../../componentes/ui/Estados'
import { Modal } from '../../componentes/ui/Modal'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { ModalAutorizacao } from '../../componentes/ui/ModalAutorizacao'
import { useAvisos } from '../../componentes/ui/Avisos'
import { data, dataHora, dinheiro, hojeIso, inicioMesIso, NOMES_FORMA, NOMES_MOTIVO_DEVOLUCAO, quantidade, textoParaQuantidade } from '../../utils/formatos'
import { imprimirComprovante } from '../../utils/impressao'

interface Simulacao {
  valor: number
  fora_do_prazo: boolean
  dias_desde_venda: number
  prazo_trocas_dias: number
  precisa_autorizacao: boolean
  itens: { venda_item_id: string; valor: number }[]
}

interface Escolha { marcado: boolean; qtd: string; volta: boolean }

function NovaDevolucao() {
  const usuario = useUsuario()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const { erro: avisoErro } = useAvisos()
  const cab = useEmpresaRecibo()
  const [numero, setNumero] = useState(params.get('venda') ?? '')
  const [venda, setVenda] = useState<Venda | null>(null)
  const [erroBusca, setErroBusca] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({})
  const [destino, setDestino] = useState<'vale_troca' | 'estorno'>('vale_troca')
  const [forma, setForma] = useState('dinheiro')
  const [motivo, setMotivo] = useState('arrependimento')
  const [motivoTexto, setMotivoTexto] = useState('')
  const [sim, setSim] = useState<Simulacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [pedirAut, setPedirAut] = useState(false)
  const [feita, setFeita] = useState<Devolucao | null>(null)

  async function buscar(n = numero) {
    const num = n.replace(/\D/g, '')
    if (!num) return setErroBusca('Informe o número da venda.')
    setBuscando(true)
    setErroBusca(null)
    setVenda(null)
    setSim(null)
    try {
      const v = await api.get<Venda>(`/devolucoes/venda/${num}`)
      if (v.situacao === 'cancelada') {
        setErroBusca(`A venda nº ${v.numero} está cancelada. Não dá para devolver.`)
        return
      }
      setVenda(v)
      setEscolhas(Object.fromEntries(v.itens.map((i) => [i.id, { marcado: false, qtd: quantidade(i.quantidade_disponivel_devolucao, i.unidade), volta: true }])))
    } catch (e) {
      setErroBusca(e instanceof ErroApi && e.status === 404 ? `Venda nº ${num} não encontrada. Confira o número no recibo.` : mensagemErro(e))
    } finally {
      setBuscando(false)
    }
  }

  useEffect(() => {
    if (params.get('venda')) buscar(params.get('venda')!)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const itensEscolhidos = venda
    ? venda.itens
        .filter((i) => escolhas[i.id]?.marcado)
        .map((i) => ({ venda_item_id: i.id, quantidade: textoParaQuantidade(escolhas[i.id].qtd), volta_estoque: escolhas[i.id].volta }))
    : []
  const chaveSim = JSON.stringify(itensEscolhidos)
  const atrasoSim = useAtraso(chaveSim, 300)

  useEffect(() => {
    if (!venda) return
    const itens = JSON.parse(atrasoSim) as typeof itensEscolhidos
    if (itens.length === 0 || itens.some((i) => !(i.quantidade > 0))) {
      setSim(null)
      return
    }
    api
      .post<Simulacao>('/devolucoes/simular', { venda_id: venda.id, itens })
      .then((r) => { setSim(r); setErro(null) })
      .catch((e) => { setSim(null); setErro(mensagemErro(e)) })
  }, [atrasoSim, venda])

  async function confirmar(token?: string) {
    if (!venda || !sim) return
    if (motivo === 'outro' && motivoTexto.trim().length < 3) return setErro('Descreva o motivo (pelo menos 3 letras).')
    if (sim.precisa_autorizacao && !token) return setPedirAut(true)
    setEnviando(true)
    setErro(null)
    try {
      const d = await api.post<Devolucao>('/devolucoes', {
        venda_id: venda.id,
        itens: itensEscolhidos,
        destino,
        forma_estorno: destino === 'estorno' ? forma : undefined,
        motivo,
        motivo_texto: motivoTexto.trim() || undefined,
        token_autorizacao: token,
      })
      setFeita(d)
      setVenda(null)
      setNumero('')
      setSim(null)
      qc.invalidateQueries({ queryKey: ['devolucoes'] })
      qc.invalidateQueries({ queryKey: ['vales'] })
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setEnviando(false)
    }
  }

  function imprimirVale(d: Devolucao) {
    if (!cab.data || !d.vale_codigo) return avisoErro('Não foi possível montar o comprovante. Tente de novo.')
    imprimirComprovante({
      empresa: cab.data.empresa,
      papel: cab.data.papel,
      titulo: 'VALE-TROCA',
      linhas: [
        ['Devolução nº', String(d.numero)],
        ['Venda de origem', String(d.venda_numero)],
        ['Cliente', d.cliente_nome ?? '—'],
        ['Emitido em', dataHora(d.criado_em)],
        ['Válido até', data(d.vale_validade)],
      ],
      destaque: ['Valor', dinheiro(d.valor)],
      codigoBarras: d.vale_codigo,
      observacao: 'Apresente este comprovante no caixa. Pode ser usado em partes até a validade.',
    })
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px] xl:gap-5">
      <Card>
        <CabecalhoCard titulo="1. Encontre a venda" descricao="Digite o número que está no recibo ou leia o código de barras dele." />
        <form onSubmit={(e) => { e.preventDefault(); buscar() }} className="flex items-end gap-3">
          <CampoTexto className="max-w-xs flex-1" rotulo="Número da venda" icone={<ScanLine size={17} />} value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" autoFocus erro={erroBusca} />
          <Botao type="submit" carregando={buscando} icone={<Search size={17} />} className={erroBusca ? 'mb-6' : ''}>
            Buscar venda
          </Botao>
        </form>

        {venda && (
          <div className="mt-6">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-texto-2">
              <b className="text-texto">Venda nº {venda.numero}</b> · {dataHora(venda.finalizada_em)} · {dinheiro(venda.total)}
              {venda.cliente_nome && <> · {venda.cliente_nome}</>}
            </div>
            <h3 className="mb-2 text-base font-semibold text-texto">2. Escolha o que volta</h3>
            <ul className="flex flex-col gap-2">
              {venda.itens.map((i) => {
                const e = escolhas[i.id]
                const disp = i.quantidade_disponivel_devolucao
                return (
                  <li key={i.id} className={`rounded-2xl border p-4 ${e?.marcado ? 'border-primaria bg-floresta-50/60 dark:bg-superficie-2' : 'border-borda'}`}>
                    <div className="flex flex-wrap items-center gap-4">
                      <CaixaMarcar
                        desabilitado={disp <= 0}
                        marcado={!!e?.marcado}
                        aoMudar={(m) => setEscolhas({ ...escolhas, [i.id]: { ...e, marcado: m } })}
                        rotulo={<span className="font-semibold text-texto">{i.descricao}</span>}
                      />
                      <span className="tabular text-xs text-texto-3">
                        Comprou {quantidade(i.quantidade, i.unidade)} · pode devolver {quantidade(disp, i.unidade)} · {dinheiro(i.total_liquido)}
                      </span>
                      {disp <= 0 && <Pilula tom="neutro">Já devolvido</Pilula>}
                    </div>
                    {e?.marcado && (
                      <div className="mt-3 flex flex-wrap items-end gap-4 pl-6">
                        <CampoTexto
                          className="w-32"
                          rotulo={`Quantidade (${i.unidade})`}
                          inputMode="decimal"
                          value={e.qtd}
                          onChange={(ev) => setEscolhas({ ...escolhas, [i.id]: { ...e, qtd: ev.target.value.replace(/[^\d,]/g, '') } })}
                        />
                        <CaixaMarcar rotulo="Volta ao estoque (desmarque se estiver com defeito)" marcado={e.volta} aoMudar={(v) => setEscolhas({ ...escolhas, [i.id]: { ...e, volta: v } })} />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {!venda && !erroBusca && <EstadoVazio titulo="Nenhuma venda escolhida" descricao="Busque a venda para ver os itens que podem ser devolvidos." icone={<Search size={22} />} />}
      </Card>

      <Card className="flex flex-col">
        <CabecalhoCard titulo="3. Como devolver" />
        <div className="card-destaque ondas mb-4 rounded-2xl p-5">
          <p className="text-sm text-white/80">Valor da devolução</p>
          <p className="tabular mt-1 text-4xl font-extrabold text-white">{dinheiro(sim?.valor ?? 0)}</p>
          {sim && <p className="mt-1 text-xs text-floresta-100">Proporcional ao que o cliente pagou, já com descontos.</p>}
        </div>
        {sim?.fora_do_prazo && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-aviso-bg px-3.5 py-2.5 text-sm text-aviso-fg">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Venda de {sim.dias_desde_venda} dias atrás, fora do prazo de {sim.prazo_trocas_dias} dias. {pode.devolucaoDireto(usuario.perfil) ? 'Você pode seguir mesmo assim.' : 'Precisa de autorização do gerente.'}
          </p>
        )}
        <div className="flex flex-col gap-4">
          <Segmentado
            valor={destino}
            aoMudar={setDestino}
            opcoes={[{ valor: 'vale_troca', rotulo: 'Vale-troca' }, { valor: 'estorno', rotulo: 'Devolver o dinheiro' }]}
          />
          {destino === 'estorno' && (
            <Selecao rotulo="Forma do estorno" value={forma} onChange={(e) => setForma(e.target.value)} ajuda={forma === 'dinheiro' ? 'Sai do seu caixa aberto.' : 'Faça o estorno na maquininha ou no banco. Aqui fica só o registro.'}>
              {['dinheiro', 'debito', 'credito', 'pix'].map((f) => (
                <option key={f} value={f}>{NOMES_FORMA[f]}</option>
              ))}
            </Selecao>
          )}
          <Selecao rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {Object.entries(NOMES_MOTIVO_DEVOLUCAO).map(([k, n]) => (
              <option key={k} value={k}>{n}</option>
            ))}
          </Selecao>
          {motivo === 'outro' && <AreaTexto rotulo="Descreva o motivo" obrigatorio rows={2} value={motivoTexto} onChange={(e) => setMotivoTexto(e.target.value)} />}
          {erro && <p className="text-sm font-medium text-erro-fg">{erro}</p>}
          <Botao tamanho="lg" disabled={!sim || sim.valor <= 0} carregando={enviando} onClick={() => confirmar()}>
            Confirmar devolução
          </Botao>
        </div>
      </Card>

      <ModalAutorizacao
        pedido={pedirAut && sim ? { acao: 'devolucao', explicacao: `Devolução de ${dinheiro(sim.valor)} da venda nº ${venda?.numero}.` } : null}
        aoFechar={() => setPedirAut(false)}
        aoAutorizar={(t) => { setPedirAut(false); confirmar(t) }}
      />

      <Modal aberto={!!feita} aoFechar={() => setFeita(null)} titulo={`Devolução nº ${feita?.numero ?? ''} registrada`} largura="sm">
        {feita && (
          <div className="flex flex-col gap-4 text-center">
            {feita.destino === 'vale_troca' ? (
              <>
                <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-ok-bg text-ok-fg">
                  <Ticket size={26} />
                </span>
                <div>
                  <p className="text-sm text-texto-3">Código do vale-troca</p>
                  <p className="tabular text-4xl font-extrabold tracking-[0.15em] text-primaria" data-teste="codigo-vale">{feita.vale_codigo}</p>
                  <p className="tabular mt-1 text-sm text-texto-2">
                    {dinheiro(feita.valor)} · válido até {data(feita.vale_validade)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Botao variante="contorno" icone={<Printer size={16} />} onClick={() => imprimirVale(feita)}>
                    Imprimir vale
                  </Botao>
                  <Botao data-primario icone={<ShoppingCart size={16} />} onClick={() => navegar(`/caixa?vale=${feita.vale_codigo}`)}>
                    Usar agora no caixa
                  </Botao>
                </div>
              </>
            ) : (
              <p className="text-sm text-texto-2">
                Estorno de <b className="tabular text-texto">{dinheiro(feita.valor)}</b> em {NOMES_FORMA[feita.forma_estorno ?? '']?.toLowerCase()} registrado.
                {feita.forma_estorno === 'dinheiro' ? ' Entregue o dinheiro ao cliente: ele já saiu do seu caixa.' : ' Faça o estorno na maquininha ou no banco.'}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function ListaDevolucoes() {
  const [inicio, setInicio] = useState(inicioMesIso())
  const [fim, setFim] = useState(hojeIso())
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['devolucoes', inicio, fim, pagina],
    queryFn: () => api.get<Lista<Devolucao & { vale_codigo: string | null }>>('/devolucoes', { inicio, fim, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })
  const colunas: Coluna<Devolucao>[] = [
    { chave: 'n', titulo: 'Nº', render: (d) => <span className="tabular font-semibold text-texto">{d.numero}</span>, largura: '70px' },
    { chave: 'data', titulo: 'Data', render: (d) => <span className="tabular">{dataHora(d.criado_em)}</span> },
    { chave: 'venda', titulo: 'Venda', render: (d) => <span className="tabular">{d.venda_numero}</span> },
    { chave: 'cliente', titulo: 'Cliente', render: (d) => d.cliente_nome ?? '—', ocultarCelular: true },
    { chave: 'destino', titulo: 'Destino', render: (d) => (d.destino === 'vale_troca' ? <Pilula tom="ok">Vale {d.vale_codigo}</Pilula> : <Pilula tom="info">Estorno {NOMES_FORMA[d.forma_estorno ?? '']}</Pilula>) },
    { chave: 'motivo', titulo: 'Motivo', render: (d) => NOMES_MOTIVO_DEVOLUCAO[d.motivo] ?? d.motivo, ocultarCelular: true },
    { chave: 'usuario', titulo: 'Feita por', render: (d) => d.usuario_nome, ocultarCelular: true },
    { chave: 'valor', titulo: 'Valor', alinhar: 'direita', render: (d) => <span className="tabular font-semibold text-texto">{dinheiro(d.valor)}</span> },
  ]
  return (
    <Card>
      <BarraFiltros>
        <CampoData className="w-40" rotulo="De" valor={inicio} aoMudar={(v) => { setInicio(v); setPagina(1) }} />
        <CampoData className="w-40" rotulo="Até" valor={fim} aoMudar={(v) => { setFim(v); setPagina(1) }} />
      </BarraFiltros>
      <Tabela colunas={colunas} linhas={q.data?.itens} carregando={q.isFetching} chaveLinha={(d) => d.id} vazio={{ titulo: 'Nenhuma devolução no período', descricao: 'Mude o período para ver outras devoluções.' }} />
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
    </Card>
  )
}

const TOM_VALE: Record<string, TomPilula> = { ativo: 'ok', usado: 'neutro', expirado: 'aviso', cancelado: 'erro' }

function ListaVales() {
  const usuario = useUsuario()
  const qc = useQueryClient()
  const { confirmar, sucesso, erro } = useAvisos()
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('ativo')
  const [pagina, setPagina] = useState(1)
  const atraso = useAtraso(busca)
  const q = useQuery({
    queryKey: ['vales', atraso, situacao, pagina],
    queryFn: () => api.get<Lista<Vale>>('/vales-troca', { busca: atraso, situacao, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })

  async function cancelar(v: Vale) {
    const motivo = await confirmar({
      titulo: `Cancelar o vale ${v.codigo}?`,
      mensagem: `O saldo de ${dinheiro(v.saldo)} deixa de valer.`,
      confirmar: 'Cancelar vale',
      perigo: true,
      pedirMotivo: { rotulo: 'Motivo', minimo: 3 },
    })
    if (motivo === null) return
    try {
      await api.post(`/vales-troca/${v.id}/cancelar`, { motivo })
      sucesso('Vale cancelado.')
      qc.invalidateQueries({ queryKey: ['vales'] })
    } catch (e) {
      erro(mensagemErro(e))
    }
  }

  const colunas: Coluna<Vale>[] = [
    { chave: 'codigo', titulo: 'Código', render: (v) => <span className="tabular font-bold tracking-wider text-texto">{v.codigo}</span> },
    { chave: 'cliente', titulo: 'Cliente', render: (v) => v.cliente_nome ?? '—' },
    { chave: 'original', titulo: 'Valor', alinhar: 'direita', render: (v) => <span className="tabular">{dinheiro(v.valor_original)}</span>, ocultarCelular: true },
    { chave: 'saldo', titulo: 'Saldo', alinhar: 'direita', render: (v) => <span className="tabular font-semibold text-texto">{dinheiro(v.saldo)}</span> },
    { chave: 'validade', titulo: 'Validade', render: (v) => <span className="tabular">{data(v.validade)}</span> },
    { chave: 'sit', titulo: 'Situação', render: (v) => <Pilula tom={TOM_VALE[v.situacao]}>{v.situacao[0].toUpperCase() + v.situacao.slice(1)}</Pilula> },
    {
      chave: 'acao',
      titulo: '',
      alinhar: 'direita',
      render: (v) =>
        pode.cancelarVale(usuario.perfil) && v.situacao === 'ativo' ? (
          <Botao variante="fantasma" tamanho="sm" className="text-erro-fg" onClick={() => cancelar(v)}>
            Cancelar
          </Botao>
        ) : null,
    },
  ]
  return (
    <Card>
      <BarraFiltros>
        <CampoTexto className="w-64" rotulo="Buscar" placeholder="Código ou nome do cliente" icone={<Search size={16} />} value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1) }} />
        <Selecao className="w-40" rotulo="Situação" value={situacao} onChange={(e) => { setSituacao(e.target.value); setPagina(1) }}>
          <option value="ativo">Ativos</option>
          <option value="usado">Usados</option>
          <option value="expirado">Vencidos</option>
          <option value="cancelado">Cancelados</option>
          <option value="">Todos</option>
        </Selecao>
      </BarraFiltros>
      <Tabela colunas={colunas} linhas={q.data?.itens} carregando={q.isFetching} chaveLinha={(v) => v.id} vazio={{ titulo: 'Nenhum vale encontrado', descricao: 'Vales são criados ao registrar uma devolução com vale-troca.' }} />
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
    </Card>
  )
}

export function Trocas() {
  const usuario = useUsuario()
  const [aba, setAba] = useState<'nova' | 'devolucoes' | 'vales'>('nova')
  const abas = [
    { valor: 'nova' as const, rotulo: 'Nova devolução' },
    ...(pode.devolucaoDireto(usuario.perfil) ? [{ valor: 'devolucoes' as const, rotulo: 'Devoluções' }] : []),
    { valor: 'vales' as const, rotulo: 'Vales-troca' },
  ]
  return (
    <div>
      <CabecalhoPagina titulo="Trocas e devoluções" descricao="Para trocar: devolva o produto com vale-troca e use o vale na nova venda." />
      <Abas abas={abas} ativa={aba} aoMudar={setAba} />
      {aba === 'nova' && <NovaDevolucao />}
      {aba === 'devolucoes' && <ListaDevolucoes />}
      {aba === 'vales' && <ListaVales />}
    </div>
  )
}
