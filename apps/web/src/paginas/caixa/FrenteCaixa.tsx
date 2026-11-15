import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowLeftRight, Barcode, CircleCheck, LayoutGrid, LogOut, Minus, Moon, Pencil, Percent, Plus, Printer, ScanLine, Search, Sun,
  Ticket, Trash2, UserRound, Wallet, X,
} from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Produto, Recibo, SessaoCaixa, Venda } from '../../api/tipos'
import { useConfiguracoes } from '../../api/consultas'
import { useUsuario } from '../../ganchos/useSessao'
import { useAlternarTema } from '../../ganchos/useAlternarTema'
import { useAvisos } from '../../componentes/ui/Avisos'
import { Logo } from '../../componentes/ui/Logo'
import { Botao } from '../../componentes/ui/Botao'
import { Atalho, EstadoVazio, Esqueleto } from '../../componentes/ui/Estados'
import { Modal } from '../../componentes/ui/Modal'
import { CampoTexto } from '../../componentes/ui/Campo'
import { Pilula } from '../../componentes/ui/Pilula'
import { ModalAutorizacao, type PedidoAutorizacao } from '../../componentes/ui/ModalAutorizacao'
import { useSair } from '../../componentes/layout/LayoutApp'
import { data, dinheiro, duracao, hora, mascararDocumento, quantidade, textoParaQuantidade } from '../../utils/formatos'
import { imprimirRecibo } from '../../utils/impressao'
import { AberturaCaixa } from './AberturaCaixa'
import { ModalBusca } from './ModalBusca'
import { ModalCliente } from './ModalCliente'
import { ModalDesconto, type AlvoDesconto } from './ModalDesconto'
import { ModalPagamento } from './ModalPagamento'
import { ModalMovimento } from './ModalMovimento'
import { ModalFechamento } from './ModalFechamento'
import {
  calcularTotais, interpretarLeitura, itemDeProduto, lerVenda, salvarVenda, totalBruto, vendaVazia, type ItemLocal, type VendaLocal,
} from './vendaLocal'

type Janela = null | 'busca' | 'cliente' | 'pagamento' | 'movimento' | 'fechar' | 'quantidade' | 'pos' | 'precos'

function bipe() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = 880
    g.gain.value = 0.06
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.15)
    o.onended = () => ctx.close()
  } catch {
    /* sem áudio */
  }
}

function TempoAberto({ desde }: { desde: string }) {
  const [, setT] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setT((x) => x + 1), 30_000)
    return () => clearInterval(i)
  }, [])
  return <>{duracao((Date.now() - new Date(desde).getTime()) / 60000)}</>
}

export function FrenteCaixa() {
  const usuario = useUsuario()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { escuro, alternar } = useAlternarTema()
  const avisos = useAvisos()
  const sair = useSair()
  const config = useConfiguracoes()
  const consultaSessao = useQuery({
    queryKey: ['caixa-atual'],
    queryFn: () => api.get<{ sessao: SessaoCaixa | null }>('/caixa/atual').then((r) => r.sessao),
  })
  const sessao = consultaSessao.data ?? null

  const [venda, setVenda] = useState<VendaLocal | null>(null)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [janela, setJanela] = useState<Janela>(null)
  const [textoLeitura, setTextoLeitura] = useState('')
  const [mensagem, setMensagem] = useState<{ tom: 'erro' | 'aviso' | 'ok'; texto: string } | null>(null)
  const [textoBusca, setTextoBusca] = useState('')
  const [pendenteQtd, setPendenteQtd] = useState<{ produto: Produto; chaveItem?: string } | null>(null)
  const [qtdTexto, setQtdTexto] = useState('')
  const [alvoDesconto, setAlvoDesconto] = useState<(AlvoDesconto & { chave?: string }) | null>(null)
  const [pedidoAut, setPedidoAut] = useState<(PedidoAutorizacao & { aoOk: (token: string, motivo: string) => void }) | null>(null)
  const [finalizando, setFinalizando] = useState(false)
  const [vendaFinal, setVendaFinal] = useState<Venda | null>(null)
  const [precosAlterados, setPrecosAlterados] = useState<{ produto_id: string; nome: string; preco_informado: number; preco_atual: number }[]>([])
  const refLeitura = useRef<HTMLInputElement>(null)

  const limite = usuario.perfil === 'administrador' ? 100 : usuario.perfil === 'gerente' ? (config.data?.limite_desconto_gerente ?? 20) : (config.data?.limite_desconto_caixa ?? 5)
  const vendeSemEstoque = config.data?.permitir_vender_sem_estoque ?? false

  // Restaura a venda em andamento (ou começa uma nova) quando o caixa carrega.
  useEffect(() => {
    if (consultaSessao.isLoading) return
    if (!sessao) {
      const guardada = lerVenda()
      if (guardada && guardada.itens.length > 0) {
        avisos.toast('A venda guardada neste computador foi descartada porque o caixa foi fechado.', 'info')
      }
      salvarVenda(null)
      setVenda(null)
      return
    }
    setVenda((atual) => {
      if (atual && atual.sessao_id === sessao.id) return atual
      const guardada = lerVenda()
      if (guardada && guardada.sessao_id === sessao.id) return guardada
      if (guardada && guardada.itens.length > 0) avisos.toast('A venda guardada era de um caixa já fechado e foi descartada.', 'info')
      return vendaVazia(sessao.id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.id, consultaSessao.isLoading])

  useEffect(() => {
    if (venda) salvarVenda(venda)
  }, [venda])

  // "Usar agora no caixa": vale vindo da tela de trocas.
  useEffect(() => {
    const vale = params.get('vale')
    if (vale && venda) {
      setVenda({ ...venda, vale_pendente: vale })
      setMensagem({ tom: 'ok', texto: `O vale ${vale} será usado no pagamento desta venda.` })
      params.delete('vale')
      setParams(params, { replace: true })
    }
    if (params.get('fechar') && sessao) {
      setJanela('fechar')
      params.delete('fechar')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venda?.id, sessao?.id])

  // Protege contra recarregar/fechar a aba com venda em andamento.
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (venda && venda.itens.length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [venda])

  const totais = useMemo(() => (venda ? calcularTotais(venda) : null), [venda])
  const algoAberto = janela !== null || !!alvoDesconto || !!pedidoAut

  const focar = useCallback(() => {
    setTimeout(() => refLeitura.current?.focus(), 30)
  }, [])
  useEffect(() => {
    if (!algoAberto) focar()
  }, [algoAberto, focar])

  const atualizar = (fn: (v: VendaLocal) => VendaLocal) => setVenda((v) => (v ? fn(v) : v))

  /* ---------- Itens ---------- */

  function adicionarProduto(p: Produto, qtd: number) {
    if (!venda) return
    if (!p.fracionavel && !Number.isInteger(qtd)) {
      setMensagem({ tom: 'erro', texto: `${p.nome} é vendido por unidade inteira. Informe uma quantidade sem vírgula.` })
      bipe()
      return
    }
    if (!(qtd > 0)) {
      setMensagem({ tom: 'erro', texto: 'Informe a quantidade.' })
      return
    }
    const qtdNaVenda = venda.itens.filter((i) => i.produto_id === p.id).reduce((s, i) => s + i.quantidade, 0)
    if (p.controla_estoque && !vendeSemEstoque && qtdNaVenda + qtd > p.estoque_atual + 1e-9) {
      const disp = Math.max(0, p.estoque_atual - qtdNaVenda)
      setMensagem({ tom: 'erro', texto: `Estoque insuficiente de ${p.nome}. Disponível: ${quantidade(disp, p.unidade)} ${p.unidade}.` })
      bipe()
      return
    }
    const existente = venda.itens.find((i) => i.produto_id === p.id && i.desconto === 0)
    let chave: string
    if (existente) {
      chave = existente.chave
      atualizar((v) => ({
        ...v,
        itens: v.itens.map((i) => (i.chave === existente.chave ? { ...i, quantidade: Math.round((i.quantidade + qtd) * 1000) / 1000, estoque_atual: p.estoque_atual, preco_unitario: p.preco_venda } : i)),
      }))
    } else {
      const novo = itemDeProduto(p, qtd)
      chave = novo.chave
      atualizar((v) => ({ ...v, itens: [...v.itens, novo] }))
    }
    setSelecionado(chave)
    if (p.estoque_baixo || (p.controla_estoque && p.estoque_minimo > 0 && p.estoque_atual - qtdNaVenda - qtd <= p.estoque_minimo)) {
      setMensagem({ tom: 'aviso', texto: `${p.nome} está com estoque baixo.` })
    } else setMensagem(null)
  }

  async function lerCodigo() {
    const texto = textoLeitura.trim()
    if (!texto || !venda) return
    if (sessao?.vencido) return
    const { quantidade: q, codigo } = interpretarLeitura(texto)
    setTextoLeitura('')
    if (!/^\d+$/.test(codigo)) {
      setTextoBusca(codigo)
      setJanela('busca')
      return
    }
    try {
      const p = await api.get<Produto>(`/produtos/codigo/${encodeURIComponent(codigo)}`)
      if (q === null && p.fracionavel) {
        setPendenteQtd({ produto: p })
        setQtdTexto('')
        setJanela('quantidade')
        return
      }
      adicionarProduto(p, q ?? 1)
    } catch (e) {
      bipe()
      const inativo = e instanceof ErroApi && /inativ/i.test(e.message)
      setMensagem({
        tom: 'erro',
        texto: e instanceof ErroApi && e.status === 404 ? (inativo ? `Produto ${codigo} está inativo e não pode ser vendido.` : `Código ${codigo} não encontrado. Confira e leia de novo ou use F2 para buscar.`) : mensagemErro(e),
      })
    } finally {
      focar()
    }
  }

  function escolherDaBusca(p: Produto) {
    setJanela(null)
    if (p.fracionavel) {
      setPendenteQtd({ produto: p })
      setQtdTexto('')
      setJanela('quantidade')
    } else adicionarProduto(p, 1)
  }

  function confirmarQuantidade(e: React.FormEvent) {
    e.preventDefault()
    if (!pendenteQtd) return
    const q = textoParaQuantidade(qtdTexto)
    if (!(q > 0)) {
      setMensagem({ tom: 'erro', texto: 'Informe a quantidade.' })
      return
    }
    const { produto, chaveItem } = pendenteQtd
    setJanela(null)
    setPendenteQtd(null)
    if (chaveItem) definirQuantidade(chaveItem, q)
    else adicionarProduto(produto, q)
  }

  function definirQuantidade(chave: string, q: number) {
    const item = venda?.itens.find((i) => i.chave === chave)
    if (!item || !venda) return
    if (!item.fracionavel && !Number.isInteger(q)) return setMensagem({ tom: 'erro', texto: 'Este produto é vendido por unidade inteira.' })
    if (q <= 0) return setMensagem({ tom: 'aviso', texto: 'Para tirar o item da venda, use F8.' })
    const outros = venda.itens.filter((i) => i.produto_id === item.produto_id && i.chave !== chave).reduce((s, i) => s + i.quantidade, 0)
    if (item.controla_estoque && !vendeSemEstoque && outros + q > item.estoque_atual + 1e-9) {
      bipe()
      return setMensagem({ tom: 'erro', texto: `Estoque insuficiente. Disponível: ${quantidade(Math.max(0, item.estoque_atual - outros), item.unidade)} ${item.unidade}.` })
    }
    const novoBruto = totalBruto(q, item.preco_unitario)
    atualizar((v) => ({ ...v, itens: v.itens.map((i) => (i.chave === chave ? { ...i, quantidade: q, desconto: Math.min(i.desconto, Math.max(0, novoBruto - 1)) } : i)) }))
    setMensagem(null)
  }

  function editarQuantidade(item: ItemLocal) {
    setPendenteQtd({ produto: { id: item.produto_id, nome: item.nome, unidade: item.unidade, fracionavel: item.fracionavel } as Produto, chaveItem: item.chave })
    setQtdTexto(quantidade(item.quantidade, item.unidade))
    setJanela('quantidade')
  }

  function removerItem() {
    if (!venda || venda.itens.length === 0) return
    const item = venda.itens.find((i) => i.chave === selecionado) ?? venda.itens[venda.itens.length - 1]
    const efetivar = (token?: string) => {
      atualizar((v) => ({ ...v, itens: v.itens.filter((i) => i.chave !== item.chave), autorizacoes: token ? [...v.autorizacoes, token] : v.autorizacoes, pagamentos: [] }))
      setSelecionado(null)
      setMensagem({ tom: 'ok', texto: `${item.nome} saiu da venda.` })
    }
    if (usuario.perfil === 'caixa' && (config.data?.exigir_autorizacao_remover_item ?? true)) {
      setPedidoAut({
        acao: 'remover_item',
        explicacao: `Remover ${quantidade(item.quantidade, item.unidade)} ${item.unidade} de ${item.nome} (${dinheiro(totalBruto(item.quantidade, item.preco_unitario) - item.desconto)}).`,
        pedirMotivo: true,
        detalhes: { descricao: item.nome, quantidade: item.quantidade, total: totalBruto(item.quantidade, item.preco_unitario) - item.desconto },
        aoOk: (token) => efetivar(token),
      })
    } else efetivar()
  }

  async function cancelarVenda() {
    if (!venda || venda.itens.length === 0 || !totais) return
    const ok = await avisos.confirmar({
      titulo: 'Cancelar esta venda?',
      mensagem: `Todos os ${venda.itens.length} itens (${dinheiro(totais.total)}) serão descartados.`,
      confirmar: 'Cancelar venda',
      cancelar: 'Continuar vendendo',
      perigo: true,
    })
    if (ok === null) return
    const enviar = async (token?: string, motivo?: string) => {
      try {
        await api.post('/vendas/descartes', {
          itens: venda.itens.map((i) => ({ produto_id: i.produto_id, descricao: i.nome, quantidade: i.quantidade, total: totalBruto(i.quantidade, i.preco_unitario) - i.desconto })),
          total: totais.total,
          motivo: motivo || undefined,
          token_autorizacao: token,
        })
        setVenda(vendaVazia(venda.sessao_id))
        setSelecionado(null)
        setMensagem({ tom: 'ok', texto: 'Venda cancelada. Pode começar outra.' })
      } catch (e) {
        avisos.erro(mensagemErro(e))
      }
    }
    if (usuario.perfil === 'caixa') {
      setPedidoAut({ acao: 'cancelar_venda_andamento', explicacao: `Cancelar a venda em andamento de ${dinheiro(totais.total)}.`, pedirMotivo: true, aoOk: (t, m) => enviar(t, m) })
    } else enviar()
  }

  /* ---------- Desconto ---------- */

  function abrirDesconto(naVenda: boolean) {
    if (!venda || !totais || venda.itens.length === 0) return
    if (naVenda || janela === 'pagamento') {
      if (venda.pagamentos.length > 0) return setMensagem({ tom: 'aviso', texto: 'Tire os pagamentos antes de mudar o desconto.' })
      setAlvoDesconto({ tipo: 'venda', descricao: `Sobre o subtotal de ${dinheiro(totais.subtotal)}`, base: totais.subtotal + venda.desconto_venda, atual: venda.desconto_venda })
      return
    }
    const item = venda.itens.find((i) => i.chave === selecionado) ?? venda.itens[venda.itens.length - 1]
    setSelecionado(item.chave)
    setAlvoDesconto({ tipo: 'item', chave: item.chave, descricao: item.nome, base: totalBruto(item.quantidade, item.preco_unitario), atual: item.desconto })
  }

  function aplicarDesconto(centavos: number) {
    if (!venda || !alvoDesconto) return
    const nova: VendaLocal =
      alvoDesconto.tipo === 'venda'
        ? { ...venda, desconto_venda: centavos }
        : { ...venda, itens: venda.itens.map((i) => (i.chave === alvoDesconto.chave ? { ...i, desconto: centavos } : i)) }
    const t = calcularTotais(nova)
    const efetivar = (token?: string) => {
      setVenda({ ...nova, autorizacoes: token ? [...nova.autorizacoes, token] : nova.autorizacoes, percentual_autorizado: token ? t.percentualDesconto : nova.percentual_autorizado })
      setAlvoDesconto(null)
      setMensagem(centavos > 0 ? { tom: 'ok', texto: `Desconto de ${dinheiro(centavos)} aplicado.` } : null)
    }
    if (t.percentualDesconto > limite && t.percentualDesconto > venda.percentual_autorizado) {
      setAlvoDesconto(null)
      setPedidoAut({
        acao: 'desconto',
        percentual: t.percentualDesconto,
        explicacao: `Desconto total de ${t.percentualDesconto.toLocaleString('pt-BR')}% passa do seu limite de ${limite.toLocaleString('pt-BR')}%.`,
        aoOk: (token) => efetivar(token),
      })
    } else efetivar()
  }

  /* ---------- Finalização ---------- */

  async function finalizar(tokensExtras: string[] = []) {
    if (!venda || !totais || finalizando) return
    if (totais.restante > 0) return
    setFinalizando(true)
    const tokens = [...venda.autorizacoes, ...tokensExtras]
    try {
      const r = await api.post<{ venda: Venda; ja_registrada: boolean }>('/vendas', {
        id: venda.id,
        terminal: sessao?.terminal ?? undefined,
        cliente_id: venda.cliente?.id ?? null,
        documento_recibo: venda.documento_recibo,
        itens: venda.itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade, preco_unitario: i.preco_unitario, desconto: i.desconto })),
        desconto_venda: totais.descontoVenda,
        pagamentos: venda.pagamentos.map((p) => ({ forma: p.forma, valor: p.valor, parcelas: p.parcelas, codigo_vale: p.codigo_vale, observacao: p.observacao })),
        autorizacoes: tokens,
      })
      setVendaFinal(r.venda)
      setVenda(vendaVazia(venda.sessao_id))
      setSelecionado(null)
      setMensagem(null)
      setJanela('pos')
      qc.invalidateQueries({ queryKey: ['caixa-atual'] })
      if (config.data?.imprimir_automaticamente) imprimir(r.venda.id, false)
    } catch (e) {
      if (!(e instanceof ErroApi)) return avisos.erro(mensagemErro(e))
      if (e.status === 0) return avisos.erro('Sem conexão. Tente finalizar de novo: a venda não será duplicada.')
      if (e.codigo === 'PRECOS_ALTERADOS') {
        const lista = (e.dados.precos_alterados as typeof precosAlterados) ?? []
        setPrecosAlterados(lista)
        setJanela('precos')
        return
      }
      if (e.codigo === 'AUTORIZACAO_NECESSARIA' && e.dados.acao === 'desconto') {
        const pct = Number(e.dados.percentual)
        setPedidoAut({
          acao: 'desconto',
          percentual: pct,
          explicacao: `Desconto total de ${pct.toLocaleString('pt-BR')}% passa do limite de ${Number(e.dados.limite).toLocaleString('pt-BR')}%.`,
          aoOk: (token) => {
            atualizar((v) => ({ ...v, autorizacoes: [...v.autorizacoes, token], percentual_autorizado: pct }))
            setTimeout(() => finalizar([token]), 0)
          },
        })
        return
      }
      if (e.codigo === 'ESTOQUE_INSUFICIENTE') {
        const item = venda.itens.find((i) => i.produto_id === e.dados.produto_id)
        return avisos.erro(`Estoque insuficiente${item ? ` de ${item.nome}` : ''}. Disponível: ${quantidade(Number(e.dados.disponivel ?? 0), item?.unidade)}. Ajuste a quantidade.`)
      }
      if (e.codigo === 'CAIXA_FECHADO' || e.codigo === 'CAIXA_VENCIDO') {
        qc.invalidateQueries({ queryKey: ['caixa-atual'] })
      }
      avisos.erro(e.message)
    } finally {
      setFinalizando(false)
    }
  }

  function aceitarPrecos() {
    const mapa = new Map(precosAlterados.map((p) => [p.produto_id, p.preco_atual]))
    atualizar((v) => ({
      ...v,
      pagamentos: [],
      itens: v.itens.map((i) => {
        const novo = mapa.get(i.produto_id)
        if (novo === undefined) return i
        return { ...i, preco_unitario: novo, desconto: Math.min(i.desconto, Math.max(0, totalBruto(i.quantidade, novo) - 1)) }
      }),
    }))
    setPrecosAlterados([])
    setJanela(null)
    setMensagem({ tom: 'aviso', texto: 'Preços atualizados. Confira o total e receba de novo.' })
  }

  async function imprimir(id: string, segunda = false) {
    try {
      const r = await api.get<Recibo>(`/vendas/${id}/recibo`, segunda ? { segunda_via: true } : undefined)
      imprimirRecibo(r)
    } catch (e) {
      avisos.erro(mensagemErro(e))
    }
  }

  /* ---------- Teclado ---------- */

  const teclado = useRef<(e: KeyboardEvent) => void>(() => {})
  teclado.current = (e: KeyboardEvent) => {
    if (!sessao || sessao.vencido || !venda) return
    const k = e.key
    if (['F2', 'F3', 'F4', 'F6', 'F8', 'F9'].includes(k)) e.preventDefault()
    if (janela === 'pos' && (k === 'Enter' || k === 'F4')) {
      e.preventDefault()
      setJanela(null)
      return
    }
    if (pedidoAut || alvoDesconto) return
    if (janela === 'pagamento') {
      if (k === 'F4' && totais && totais.restante === 0 && venda.pagamentos.length > 0) finalizar()
      if (k === 'F6') abrirDesconto(true)
      return
    }
    if (janela !== null) return
    const idx = venda.itens.findIndex((i) => i.chave === selecionado)
    switch (k) {
      case 'F2':
        setTextoBusca(textoLeitura)
        setTextoLeitura('')
        setJanela('busca')
        break
      case 'F3':
        setJanela('cliente')
        break
      case 'F4':
        if (venda.itens.length > 0) setJanela('pagamento')
        else setMensagem({ tom: 'aviso', texto: 'Passe pelo menos um item antes de receber.' })
        break
      case 'F6':
        abrirDesconto(false)
        break
      case 'F8':
        removerItem()
        break
      case 'F9':
        setJanela('movimento')
        break
      case 'ArrowDown':
      case 'ArrowUp': {
        if (venda.itens.length === 0) break
        e.preventDefault()
        const n = k === 'ArrowDown' ? Math.min(venda.itens.length - 1, idx < 0 ? 0 : idx + 1) : Math.max(0, idx < 0 ? venda.itens.length - 1 : idx - 1)
        setSelecionado(venda.itens[n].chave)
        break
      }
      case '+':
      case '-': {
        if (textoLeitura !== '' || idx < 0) break
        e.preventDefault()
        const it = venda.itens[idx]
        definirQuantidade(it.chave, Math.round((it.quantidade + (k === '+' ? 1 : -1)) * 1000) / 1000)
        break
      }
    }
  }
  useEffect(() => {
    const f = (e: KeyboardEvent) => teclado.current(e)
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  // Mantém o foco no campo de leitura ao clicar fora de controles.
  useEffect(() => {
    const f = (e: MouseEvent) => {
      if (algoAberto) return
      const t = e.target as HTMLElement
      if (!t.closest('input, select, textarea, button, a, [role="dialog"]')) focar()
    }
    document.addEventListener('click', f)
    return () => document.removeEventListener('click', f)
  }, [algoAberto, focar])

  /* ---------- Render ---------- */

  const voltarSistema = usuario.perfil === 'caixa' ? '/vendas' : '/dashboard'

  const cabecalho = (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-card)] bg-superficie px-5 py-3 shadow-[var(--shadow-card)]">
      <Logo tamanho={32} />
      {sessao && (
        <div className="flex items-center gap-4 border-l border-borda pl-5 text-sm">
          <div className="leading-tight">
            <p className="font-semibold text-texto">
              Caixa nº {sessao.numero}
              {sessao.terminal ? ` · ${sessao.terminal}` : ''}
            </p>
            <p className="text-xs text-texto-3">
              {sessao.operador_nome} · aberto há <TempoAberto desde={sessao.aberto_em} />
            </p>
          </div>
          <div className="hidden leading-tight xl:block">
            <p className="tabular font-semibold text-texto">{dinheiro(sessao.resumo.total_vendido)}</p>
            <p className="text-xs text-texto-3">{sessao.resumo.quantidade_vendas} vendas neste caixa</p>
          </div>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {sessao && !sessao.vencido && (
          <Botao variante="fantasma" tamanho="sm" icone={<Wallet size={16} />} onClick={() => setJanela('movimento')}>
            Sangria/suprimento
          </Botao>
        )}
        {sessao && (
          <Botao variante="contorno" tamanho="sm" onClick={() => (venda && venda.itens.length > 0 ? avisos.toast('Finalize ou cancele a venda em andamento antes de fechar o caixa.', 'erro') : setJanela('fechar'))}>
            Fechar caixa
          </Botao>
        )}
        <Link to={voltarSistema} title="Voltar ao sistema">
          <Botao variante="fantasma" tamanho="sm" icone={<LayoutGrid size={16} />}>
            Sistema
          </Botao>
        </Link>
        <button type="button" onClick={alternar} aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'} className="flex size-9 items-center justify-center rounded-full text-texto-2 hover:bg-superficie-2">
          {escuro ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button type="button" onClick={sair} aria-label="Sair" title="Sair" className="flex size-9 items-center justify-center rounded-full text-texto-2 hover:bg-superficie-2">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  )

  if (consultaSessao.isLoading || config.isLoading) {
    return (
      <div className="flex h-screen flex-col gap-3 bg-fundo p-3">
        <Esqueleto className="h-16 rounded-[var(--radius-card)]" />
        <div className="flex flex-1 gap-3">
          <Esqueleto className="flex-1 rounded-[var(--radius-card)]" />
          <Esqueleto className="w-[380px] rounded-[var(--radius-card)]" />
        </div>
      </div>
    )
  }

  if (!sessao) {
    return (
      <div className="flex min-h-screen flex-col gap-3 bg-fundo p-3">
        {cabecalho}
        <AberturaCaixa operador={usuario.nome} aoAbrir={(s) => { qc.setQueryData(['caixa-atual'], s); qc.invalidateQueries({ queryKey: ['eu'] }) }} />
      </div>
    )
  }

  const itens = venda?.itens ?? []

  return (
    <div className="flex h-screen min-h-[640px] flex-col gap-3 bg-fundo p-3">
      {cabecalho}

      {sessao.vencido && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-aviso-bg px-5 py-4 text-aviso-fg">
          <AlertTriangle size={20} />
          <p className="flex-1 text-sm font-semibold">Este caixa foi aberto em {data(sessao.aberto_em)}. Feche o caixa do dia anterior antes de vender hoje.</p>
          <Botao onClick={() => setJanela('fechar')}>Fechar caixa</Botao>
        </div>
      )}
      {sessao.alerta_sangria && !sessao.vencido && (
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-aviso-bg px-5 py-3 text-aviso-fg">
          <AlertTriangle size={18} />
          <p className="flex-1 text-sm font-semibold">Muito dinheiro na gaveta. Faça uma sangria (F9).</p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Esquerda: leitura e itens */}
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              lerCodigo()
            }}
            className="rounded-[var(--radius-card)] bg-superficie p-4 shadow-[var(--shadow-card)]"
          >
            <div className="relative">
              <ScanLine size={24} className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-primaria" />
              <input
                ref={refLeitura}
                value={textoLeitura}
                onChange={(e) => setTextoLeitura(e.target.value)}
                disabled={sessao.vencido}
                autoFocus
                autoComplete="off"
                aria-label="Código de barras ou busca"
                name="leitura"
                placeholder="Leia o código de barras ou digite. Ex.: 3*7891000000007"
                className="h-16 w-full rounded-2xl border-2 border-primaria/40 bg-superficie-2 pr-36 pl-14 text-xl font-semibold text-texto outline-none placeholder:text-base placeholder:font-normal focus:border-primaria focus:bg-superficie focus:ring-4 focus:ring-primaria/15"
              />
              <button
                type="button"
                onClick={() => { setTextoBusca(textoLeitura); setTextoLeitura(''); setJanela('busca') }}
                className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2 rounded-xl bg-floresta-50 px-3 py-2 text-sm font-semibold text-primaria hover:bg-floresta-100 dark:bg-superficie-2 dark:hover:bg-floresta-900"
              >
                <Search size={16} /> Buscar <kbd className="text-[11px] opacity-70">F2</kbd>
              </button>
            </div>
            {mensagem && (
              <div
                role={mensagem.tom === 'erro' ? 'alert' : 'status'}
                className={`mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ${
                  mensagem.tom === 'erro' ? 'bg-erro-bg text-erro-fg' : mensagem.tom === 'aviso' ? 'bg-aviso-bg text-aviso-fg' : 'bg-ok-bg text-ok-fg'
                }`}
              >
                {mensagem.tom === 'ok' ? <CircleCheck size={16} /> : <AlertTriangle size={16} />}
                <span className="flex-1">{mensagem.texto}</span>
                <button type="button" aria-label="Fechar mensagem" onClick={() => setMensagem(null)}>
                  <X size={15} />
                </button>
              </div>
            )}
          </form>

          <div className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-card)] bg-superficie shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-base font-semibold text-texto">Itens da venda</h2>
              <span className="tabular text-xs font-medium text-texto-3">
                {itens.length} {itens.length === 1 ? 'linha' : 'linhas'}
              </span>
            </div>
            {itens.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <EstadoVazio
                  icone={<Barcode size={24} />}
                  titulo="Leia um código para começar"
                  descricao="Passe o produto no leitor ou digite o código e tecle Enter. Para várias unidades, digite 3*código."
                />
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-[1] bg-superficie">
                    <tr className="text-left text-xs font-semibold tracking-wide text-texto-3 uppercase">
                      <th className="w-10 px-3 py-2">#</th>
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2 text-right">Qtd</th>
                      <th className="hidden px-3 py-2 text-right md:table-cell">Preço</th>
                      <th className="hidden px-3 py-2 text-right lg:table-cell">Desconto</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="w-24 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i, n) => {
                      const bruto = totalBruto(i.quantidade, i.preco_unitario)
                      const sel = i.chave === selecionado
                      return (
                        <tr
                          key={i.chave}
                          onClick={() => setSelecionado(i.chave)}
                          className={`cursor-pointer border-b border-borda/60 last:border-0 ${sel ? 'bg-floresta-50 dark:bg-superficie-2' : 'hover:bg-superficie-2/60'}`}
                        >
                          <td className="tabular relative px-3 py-3 text-texto-3">
                            {sel && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-primaria" />}
                            {n + 1}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-texto">{i.nome}</p>
                            <p className="tabular flex items-center gap-2 text-xs text-texto-3">
                              {i.codigo_barras ?? i.codigo}
                              {i.estoque_baixo && <Pilula tom="aviso" className="!px-1.5 !py-0 text-[10px]">estoque baixo</Pilula>}
                            </p>
                          </td>
                          <td className="tabular px-3 py-3 text-right font-semibold text-texto">
                            {quantidade(i.quantidade, i.unidade)} <span className="text-xs font-normal text-texto-3">{i.unidade}</span>
                          </td>
                          <td className="tabular hidden px-3 py-3 text-right text-texto-2 md:table-cell">{dinheiro(i.preco_unitario)}</td>
                          <td className="tabular hidden px-3 py-3 text-right text-texto-2 lg:table-cell">{i.desconto > 0 ? `− ${dinheiro(i.desconto)}` : '—'}</td>
                          <td className="tabular px-3 py-3 text-right font-bold text-texto">{dinheiro(bruto - i.desconto)}</td>
                          <td className="px-2 py-3">
                            <div className={`flex justify-end gap-0.5 ${sel ? '' : 'opacity-0 group-hover:opacity-100'} [tr:hover_&]:opacity-100`}>
                              {!i.fracionavel && (
                                <>
                                  <button type="button" aria-label="Diminuir 1" onClick={(e) => { e.stopPropagation(); definirQuantidade(i.chave, i.quantidade - 1) }} className="flex size-7 items-center justify-center rounded-lg text-texto-3 hover:bg-superficie hover:text-texto">
                                    <Minus size={14} />
                                  </button>
                                  <button type="button" aria-label="Aumentar 1" onClick={(e) => { e.stopPropagation(); definirQuantidade(i.chave, i.quantidade + 1) }} className="flex size-7 items-center justify-center rounded-lg text-texto-3 hover:bg-superficie hover:text-texto">
                                    <Plus size={14} />
                                  </button>
                                </>
                              )}
                              <button type="button" aria-label="Mudar quantidade" onClick={(e) => { e.stopPropagation(); editarQuantidade(i) }} className="flex size-7 items-center justify-center rounded-lg text-texto-3 hover:bg-superficie hover:text-texto">
                                <Pencil size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Direita: total e ações */}
        <aside className="flex w-[360px] shrink-0 flex-col gap-3 xl:w-[400px]">
          <div className="card-destaque ondas relative overflow-hidden rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-white/80">Total a pagar</p>
            <p className="tabular mt-2 text-[48px] leading-none font-extrabold tracking-tight text-white" data-teste="total">
              {dinheiro(totais?.total ?? 0)}
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/15 pt-4 text-xs">
              <div>
                <p className="text-white/60">Subtotal</p>
                <p className="tabular mt-0.5 text-sm font-semibold text-white">{dinheiro(totais?.somaBruto ?? 0)}</p>
              </div>
              <div>
                <p className="text-white/60">Descontos</p>
                <p className="tabular mt-0.5 text-sm font-semibold text-white">{dinheiro(totais?.descontoTotal ?? 0)}</p>
              </div>
              <div>
                <p className="text-white/60">Itens</p>
                <p className="tabular mt-0.5 text-sm font-semibold text-white">{quantidade(totais?.quantidadeItens ?? 0)}</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setJanela('cliente')}
            disabled={sessao.vencido}
            className="flex items-center gap-3 rounded-[var(--radius-card)] bg-superficie p-4 text-left shadow-[var(--shadow-card)] hover:bg-superficie-2"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-floresta-50 text-primaria dark:bg-superficie-2">
              <UserRound size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-texto-3">Cliente (opcional)</span>
              <span className="block truncate text-sm font-semibold text-texto">
                {venda?.cliente ? venda.cliente.nome : venda?.documento_recibo ? `CPF/CNPJ ${mascararDocumento(venda.documento_recibo)}` : 'Não identificado'}
              </span>
            </span>
            <kbd className="rounded-md bg-superficie-2 px-1.5 py-0.5 text-[11px] font-bold text-texto-3">F3</kbd>
          </button>

          {venda?.vale_pendente && (
            <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-ok-bg p-4 text-ok-fg">
              <Ticket size={18} />
              <span className="flex-1 text-sm font-semibold">Vale {venda.vale_pendente} será usado no pagamento</span>
              <button type="button" aria-label="Não usar o vale" onClick={() => atualizar((v) => ({ ...v, vale_pendente: null }))}>
                <X size={16} />
              </button>
            </div>
          )}

          {(() => {
            const item = itens.find((i) => i.chave === selecionado) ?? itens[itens.length - 1]
            if (!item) return null
            const bruto = totalBruto(item.quantidade, item.preco_unitario)
            return (
              <div className="hidden flex-col rounded-[var(--radius-card)] bg-superficie p-5 shadow-[var(--shadow-card)] [@media(min-height:760px)]:flex">
                <p className="text-xs font-semibold tracking-wide text-texto-3 uppercase">{item.chave === selecionado ? 'Item escolhido' : 'Último item'}</p>
                <p className="mt-2 line-clamp-2 text-lg leading-snug font-bold text-texto">{item.nome}</p>
                <p className="tabular mt-1 text-sm text-texto-2">
                  {quantidade(item.quantidade, item.unidade)} {item.unidade} × {dinheiro(item.preco_unitario)}
                  {item.desconto > 0 ? ` − ${dinheiro(item.desconto)}` : ''}
                </p>
                <div className="mt-3 flex items-end justify-between border-t border-borda pt-3">
                  <span className="text-xs text-texto-3">{item.estoque_baixo ? <Pilula tom="aviso">Estoque baixo</Pilula> : `Código ${item.codigo}`}</span>
                  <span className="tabular text-2xl font-bold text-primaria">{dinheiro(bruto - item.desconto)}</span>
                </div>
              </div>
            )
          })()}

          <div className="mt-auto flex flex-col gap-2.5 rounded-[var(--radius-card)] bg-superficie p-4 shadow-[var(--shadow-card)]">
            <Botao tamanho="lg" className="h-16 text-lg" disabled={itens.length === 0 || sessao.vencido} onClick={() => setJanela('pagamento')}>
              Receber pagamento <kbd className="ml-1 rounded-md bg-white/20 px-1.5 text-xs">F4</kbd>
            </Botao>
            <div className="grid grid-cols-2 gap-2.5">
              <Botao variante="suave" tamanho="lg" icone={<Percent size={17} />} disabled={itens.length === 0} onClick={() => abrirDesconto(false)}>
                Desconto
              </Botao>
              <Botao variante="suave" tamanho="lg" icone={<Trash2 size={17} />} disabled={itens.length === 0} onClick={removerItem}>
                Remover item
              </Botao>
            </div>
            <Botao variante="fantasma" disabled={itens.length === 0} onClick={cancelarVenda} className="text-erro-fg hover:bg-erro-bg hover:text-erro-fg">
              Cancelar venda
            </Botao>
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-2 px-1">
        <Atalho tecla="F2" rotulo="Buscar" aoClicar={() => setJanela('busca')} />
        <Atalho tecla="F3" rotulo="Cliente" aoClicar={() => setJanela('cliente')} />
        <Atalho tecla="F4" rotulo="Pagamento" aoClicar={() => itens.length > 0 && setJanela('pagamento')} />
        <Atalho tecla="F6" rotulo="Desconto" aoClicar={() => abrirDesconto(false)} />
        <Atalho tecla="F8" rotulo="Remover item" aoClicar={removerItem} />
        <Atalho tecla="F9" rotulo="Sangria/suprimento" aoClicar={() => setJanela('movimento')} />
        <Atalho tecla="Esc" rotulo="Fechar janela" />
        <Atalho tecla="↑↓" rotulo="Escolher item" />
        <Atalho tecla="+/−" rotulo="Quantidade" />
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-texto-3 xl:flex">
          <ArrowLeftRight size={14} /> Troca: devolva em Trocas e use o vale aqui
        </span>
      </footer>

      {/* Janelas */}
      <ModalBusca aberto={janela === 'busca'} textoInicial={textoBusca} aoFechar={() => setJanela(null)} aoEscolher={escolherDaBusca} />
      <ModalCliente
        aberto={janela === 'cliente'}
        atual={{ cliente: venda?.cliente ?? null, documento: venda?.documento_recibo ?? null }}
        aoFechar={() => setJanela(null)}
        aoEscolher={({ cliente, documento }) => {
          atualizar((v) => ({ ...v, cliente, documento_recibo: documento }))
          setJanela(null)
        }}
      />
      {totais && venda && (
        <ModalPagamento
          aberto={janela === 'pagamento'}
          totais={totais}
          pagamentos={venda.pagamentos}
          maxParcelas={config.data?.max_parcelas_credito ?? 12}
          valePendente={venda.vale_pendente}
          finalizando={finalizando}
          aoFechar={() => setJanela(null)}
          aoAdicionar={(p) => atualizar((v) => ({ ...v, pagamentos: [...v.pagamentos, p], vale_pendente: p.forma === 'vale_troca' ? null : v.vale_pendente }))}
          aoRemover={(chave) => atualizar((v) => ({ ...v, pagamentos: v.pagamentos.filter((p) => p.chave !== chave) }))}
          aoDesconto={() => abrirDesconto(true)}
          aoFinalizar={() => finalizar()}
        />
      )}
      <ModalDesconto alvo={alvoDesconto} limite={limite} aoFechar={() => setAlvoDesconto(null)} aoAplicar={aplicarDesconto} />
      <ModalAutorizacao
        pedido={pedidoAut}
        aoFechar={() => setPedidoAut(null)}
        aoAutorizar={(token, motivo, quem) => {
          const p = pedidoAut
          setPedidoAut(null)
          avisos.sucesso(`Autorizado por ${quem}.`)
          p?.aoOk(token, motivo)
        }}
      />
      <ModalMovimento
        aberto={janela === 'movimento'}
        sessao={sessao}
        aoFechar={() => setJanela(null)}
        aoRegistrar={() => {
          setJanela(null)
          avisos.sucesso('Movimento registrado.')
          qc.invalidateQueries({ queryKey: ['caixa-atual'] })
        }}
      />
      <ModalFechamento
        aberto={janela === 'fechar'}
        sessao={sessao}
        aoFechar={() => setJanela(null)}
        aoConcluir={() => {
          setJanela(null)
          salvarVenda(null)
          setVenda(null)
          avisos.sucesso('Caixa fechado.')
          qc.setQueryData(['caixa-atual'], null)
          qc.invalidateQueries({ queryKey: ['eu'] })
          qc.invalidateQueries({ queryKey: ['dashboard'] })
        }}
      />

      <Modal aberto={janela === 'quantidade'} aoFechar={() => { setJanela(null); setPendenteQtd(null) }} titulo="Quantidade" descricao={pendenteQtd?.produto.nome} largura="sm">
        <form onSubmit={confirmarQuantidade} className="flex flex-col gap-4">
          <CampoTexto
            rotulo={`Quantidade (${pendenteQtd?.produto.unidade ?? ''})`}
            data-autofoco
            inputMode="decimal"
            value={qtdTexto}
            onChange={(e) => setQtdTexto(e.target.value.replace(/[^\d,]/g, ''))}
            ajuda={pendenteQtd?.produto.fracionavel ? 'Use vírgula para decimais. Ex.: 0,350' : 'Só números inteiros.'}
          />
          <Botao type="submit">Confirmar quantidade</Botao>
        </form>
      </Modal>

      <Modal aberto={janela === 'precos'} aoFechar={aceitarPrecos} titulo="Preços mudaram" descricao="Alguém alterou o preço destes produtos durante a venda. Vale o preço atual." largura="md">
        <ul className="flex flex-col gap-2">
          {precosAlterados.map((p) => (
            <li key={p.produto_id} className="flex items-center justify-between gap-3 rounded-xl bg-superficie-2 px-4 py-3 text-sm">
              <span className="font-semibold text-texto">{p.nome}</span>
              <span className="tabular text-texto-3 line-through">{dinheiro(p.preco_informado)}</span>
              <span className="tabular font-bold text-texto">{dinheiro(p.preco_atual)}</span>
            </li>
          ))}
        </ul>
        <Botao className="mt-5" larguraTotal data-primario onClick={aceitarPrecos}>
          Atualizar preços e conferir
        </Botao>
      </Modal>

      <Modal aberto={janela === 'pos'} aoFechar={() => setJanela(null)} titulo={`Venda nº ${vendaFinal?.numero ?? ''} finalizada`} largura="sm">
        {vendaFinal && (
          <div className="flex flex-col items-center gap-5 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-ok-bg text-ok-fg">
              <CircleCheck size={34} />
            </span>
            {vendaFinal.troco > 0 ? (
              <div>
                <p className="text-sm font-semibold text-texto-3">Troco</p>
                <p className="tabular text-[52px] leading-none font-extrabold text-primaria" data-teste="troco">
                  {dinheiro(vendaFinal.troco)}
                </p>
              </div>
            ) : (
              <p className="tabular text-2xl font-bold text-texto">{dinheiro(vendaFinal.total)}</p>
            )}
            <p className="text-sm text-texto-3">
              {vendaFinal.itens.length} {vendaFinal.itens.length === 1 ? 'item' : 'itens'} · {hora(vendaFinal.finalizada_em)}
            </p>
            <div className="grid w-full grid-cols-2 gap-2.5">
              <Botao variante="contorno" icone={<Printer size={17} />} onClick={() => imprimir(vendaFinal.id)}>
                Imprimir recibo
              </Botao>
              <Botao data-primario onClick={() => setJanela(null)}>
                Nova venda
              </Botao>
            </div>
            <p className="text-xs text-texto-3">Tecle Enter para começar a próxima venda.</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
