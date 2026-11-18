import { useEffect, useRef, useState } from 'react'
import { Banknote, CreditCard, Percent, QrCode, Ticket, Trash2, Wallet } from 'lucide-react'
import { Modal } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { CampoDinheiro, CampoTexto, Selecao } from '../../componentes/ui/Campo'
import { Atalho } from '../../componentes/ui/Estados'
import { api, mensagemErro } from '../../api/cliente'
import type { Forma, Vale } from '../../api/tipos'
import { data, dinheiro, NOMES_FORMA } from '../../utils/formatos'
import { novoId, type PagamentoLocal, type Totais } from './vendaLocal'

const FORMAS: { forma: Forma; tecla: string; icone: typeof Banknote }[] = [
  { forma: 'dinheiro', tecla: '1', icone: Banknote },
  { forma: 'debito', tecla: '2', icone: CreditCard },
  { forma: 'credito', tecla: '3', icone: Wallet },
  { forma: 'pix', tecla: '4', icone: QrCode },
  { forma: 'vale_troca', tecla: '5', icone: Ticket },
]
const CEDULAS = [1000, 2000, 5000, 10000, 20000]

interface Props {
  aberto: boolean
  totais: Totais
  pagamentos: PagamentoLocal[]
  maxParcelas: number
  valePendente?: string | null
  finalizando: boolean
  aoFechar: () => void
  aoAdicionar: (p: PagamentoLocal) => void
  aoRemover: (chave: string) => void
  aoDesconto: () => void
  aoFinalizar: () => void
}

/** Pagamento (F4): formas 1–5, pagamento dividido, troco só do dinheiro. */
export function ModalPagamento({ aberto, totais, pagamentos, maxParcelas, valePendente, finalizando, aoFechar, aoAdicionar, aoRemover, aoDesconto, aoFinalizar }: Props) {
  const [forma, setForma] = useState<Forma>('dinheiro')
  const [valor, setValor] = useState(0)
  const [parcelas, setParcelas] = useState(1)
  const [obs, setObs] = useState('')
  const [codigoVale, setCodigoVale] = useState('')
  const [vale, setVale] = useState<Vale | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [consultando, setConsultando] = useState(false)
  const refValor = useRef<HTMLInputElement>(null)
  const refVale = useRef<HTMLInputElement>(null)
  const refFormas = useRef<HTMLDivElement>(null)
  const refFinalizar = useRef<HTMLButtonElement>(null)

  const pronto = totais.restante === 0 && pagamentos.length > 0

  function escolher(f: Forma, focar = true) {
    setForma(f)
    setErro(null)
    setParcelas(1)
    setObs('')
    setVale(null)
    setValor(totais.restante)
    if (focar) setTimeout(() => (f === 'vale_troca' ? refVale.current : refValor.current)?.focus(), 20)
  }

  useEffect(() => {
    if (!aberto) return
    if (valePendente && !pagamentos.some((p) => p.codigo_vale === valePendente)) {
      setForma('vale_troca')
      setCodigoVale(valePendente)
      setValor(totais.restante)
      consultarVale(valePendente)
    } else {
      setForma('dinheiro')
      setCodigoVale('')
      setVale(null)
      setValor(totais.restante)
    }
    setErro(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  useEffect(() => {
    if (aberto && pronto) setTimeout(() => refFinalizar.current?.focus(), 30)
  }, [aberto, pronto])

  async function consultarVale(cod = codigoVale) {
    const c = cod.trim().toUpperCase()
    if (!c) {
      setErro('Informe o código do vale-troca.')
      return
    }
    setConsultando(true)
    setErro(null)
    try {
      const v = await api.get<Vale>(`/vales-troca/codigo/${encodeURIComponent(c)}`)
      if (!v.utilizavel) {
        setVale(null)
        setErro(v.situacao === 'expirado' ? `Vale vencido em ${data(v.validade)}. Não pode ser usado.` : `Vale ${v.situacao}. Não pode ser usado.`)
        return
      }
      const jaUsado = pagamentos.filter((p) => p.codigo_vale === v.codigo).reduce((s, p) => s + p.valor, 0)
      const saldo = v.saldo - jaUsado
      setVale({ ...v, saldo })
      setValor(Math.min(saldo, totais.restante))
      setTimeout(() => refValor.current?.focus(), 20)
    } catch (e) {
      setVale(null)
      setErro(mensagemErro(e))
    } finally {
      setConsultando(false)
    }
  }

  function adicionar() {
    setErro(null)
    if (pronto) return aoFinalizar()
    if (valor <= 0) return setErro('Informe o valor recebido.')
    if (forma !== 'dinheiro' && valor > totais.restante) return setErro(`${NOMES_FORMA[forma]} não pode passar do restante (${dinheiro(totais.restante)}). Só dinheiro gera troco.`)
    if (forma === 'credito' && (parcelas < 1 || parcelas > maxParcelas)) return setErro(`Parcelas de 1 a ${maxParcelas}.`)
    if (forma === 'vale_troca') {
      if (!vale) return setErro('Consulte o vale antes de usar.')
      if (valor > vale.saldo) return setErro(`O vale tem ${dinheiro(vale.saldo)} de saldo.`)
    }
    aoAdicionar({
      chave: novoId(),
      forma,
      valor,
      parcelas: forma === 'credito' ? parcelas : undefined,
      codigo_vale: forma === 'vale_troca' ? vale?.codigo : undefined,
      observacao: obs.trim() || undefined,
    })
    const restanteDepois = Math.max(0, totais.restante - valor)
    setValor(restanteDepois)
    setVale(null)
    setCodigoVale('')
    setObs('')
    setParcelas(1)
    if (restanteDepois > 0) {
      setForma('dinheiro')
      refFormas.current?.focus()
    }
  }

  function teclaFormas(e: React.KeyboardEvent) {
    const alvo = e.target as HTMLElement
    const emCampo = alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA'
    if (!emCampo && /^[1-5]$/.test(e.key) && !pronto) {
      e.preventDefault()
      escolher(FORMAS[Number(e.key) - 1].forma)
    }
    if (e.key === 'Enter' && (alvo.tagName === 'INPUT' || alvo === refFormas.current)) {
      e.preventDefault()
      if (forma === 'vale_troca' && alvo === refVale.current) consultarVale()
      else adicionar()
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Pagamento" descricao="Escolha a forma (teclas 1 a 5), confira o valor e tecle Enter." largura="xl">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]" onKeyDown={teclaFormas}>
        <div className="flex flex-col gap-4">
          <div ref={refFormas} tabIndex={-1} data-autofoco className="grid grid-cols-5 gap-2 rounded-2xl outline-none focus-visible:ring-0" role="radiogroup" aria-label="Forma de pagamento">
            {FORMAS.map(({ forma: f, tecla, icone: I }) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={forma === f}
                disabled={pronto}
                onClick={() => escolher(f)}
                className={`relative flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] px-2 py-3.5 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
                  forma === f ? 'border-primaria bg-selecao text-primaria' : 'border-borda text-texto-2 hover:border-destaque/50'
                }`}
              >
                <span className="absolute top-1.5 left-2 text-[10px] font-bold text-texto-3">{tecla}</span>
                <I size={22} strokeWidth={1.75} />
                {NOMES_FORMA[f]}
              </button>
            ))}
          </div>

          {!pronto && (
            <div className="flex flex-col gap-3 rounded-2xl bg-superficie-2 p-4">
              {forma === 'vale_troca' && (
                <div className="flex items-end gap-2">
                  <CampoTexto
                    ref={refVale}
                    className="flex-1"
                    rotulo="Código do vale-troca"
                    value={codigoVale}
                    onChange={(e) => { setCodigoVale(e.target.value.toUpperCase()); setVale(null) }}
                    placeholder="Ex.: 7Y54KWPV"
                    maxLength={8}
                  />
                  <Botao variante="contorno" carregando={consultando} onClick={() => consultarVale()}>
                    Consultar
                  </Botao>
                </div>
              )}
              {forma === 'vale_troca' && vale && (
                <p className="text-sm text-ok-fg">
                  Saldo do vale: <b className="tabular">{dinheiro(vale.saldo)}</b> · válido até {data(vale.validade)}
                  {vale.cliente_nome ? ` · ${vale.cliente_nome}` : ''}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <CampoDinheiro
                  ref={refValor}
                  className="min-w-[200px] flex-1"
                  rotulo={forma === 'dinheiro' ? 'Valor recebido' : 'Valor'}
                  grande
                  valor={valor}
                  aoMudar={setValor}
                  disabled={forma === 'vale_troca' && !vale}
                  name="valor_pagamento"
                />
                {forma === 'credito' && (
                  <Selecao rotulo="Parcelas" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className="w-28">
                    {Array.from({ length: maxParcelas }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}x</option>
                    ))}
                  </Selecao>
                )}
              </div>
              {forma === 'dinheiro' && (
                <div className="flex flex-wrap gap-2">
                  {CEDULAS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setValor((v) => (v === totais.restante ? c : v + c))}
                      className="tabular rounded-full border border-borda bg-superficie px-3.5 py-1.5 text-[13px] font-semibold text-texto-2 hover:border-primaria hover:text-primaria"
                    >
                      + {dinheiro(c).replace(',00', '')}
                    </button>
                  ))}
                  <button type="button" onClick={() => setValor(totais.restante)} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-texto-3 hover:text-texto">
                    Valor exato
                  </button>
                </div>
              )}
              {(forma === 'debito' || forma === 'credito' || forma === 'pix') && (
                <CampoTexto rotulo="Observação (opcional)" placeholder="Ex.: final do cartão ou código da maquininha" value={obs} maxLength={60} onChange={(e) => setObs(e.target.value)} />
              )}
              {erro && <p className="text-sm font-medium text-erro-fg" role="alert">{erro}</p>}
              <Botao tamanho="lg" onClick={adicionar} larguraTotal>
                Adicionar {NOMES_FORMA[forma].toLowerCase()} {valor > 0 ? dinheiro(valor) : ''}
              </Botao>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">Pagamentos</p>
            {pagamentos.length === 0 ? (
              <p className="text-sm text-texto-3">Nenhum pagamento ainda. Para dividir, adicione uma forma de cada vez.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pagamentos.map((p) => (
                  <li key={p.chave} className="flex items-center gap-3 rounded-xl border border-borda px-3.5 py-2.5">
                    <span className="flex-1 text-sm font-semibold text-texto">
                      {NOMES_FORMA[p.forma]}
                      {p.parcelas && p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}
                      {p.codigo_vale ? ` · ${p.codigo_vale}` : ''}
                      {p.observacao ? <span className="font-normal text-texto-3"> · {p.observacao}</span> : null}
                    </span>
                    <span className="tabular text-sm font-bold text-texto">{dinheiro(p.valor)}</span>
                    <button type="button" onClick={() => aoRemover(p.chave)} aria-label={`Remover pagamento em ${NOMES_FORMA[p.forma]}`} className="text-texto-3 hover:text-erro-fg">
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="card-destaque ondas rounded-[var(--radius-card)] p-5">
            <p className="text-sm font-medium text-creme/80">Total da venda</p>
            <p className="tabular mt-1 text-[40px] leading-none font-extrabold text-creme">{dinheiro(totais.total)}</p>
            {totais.descontoTotal > 0 && <p className="tabular mt-2 text-xs text-creme-2">Com {dinheiro(totais.descontoTotal)} de desconto</p>}
          </div>
          <div className="rounded-[var(--radius-card)] bg-superficie-2 p-5">
            <div className="flex justify-between text-sm text-texto-2">
              <span>Já pago</span>
              <span className="tabular font-semibold">{dinheiro(totais.pago)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-texto">Falta</span>
              <span className={`tabular text-2xl font-extrabold ${totais.restante > 0 ? 'text-aviso-fg' : 'text-texto-3'}`}>{dinheiro(totais.restante)}</span>
            </div>
            {totais.troco > 0 && (
              <div className="mt-3 flex items-baseline justify-between rounded-xl bg-ok-bg px-3 py-2 text-ok-fg">
                <span className="text-sm font-bold">Troco</span>
                <span className="tabular text-2xl font-extrabold">{dinheiro(totais.troco)}</span>
              </div>
            )}
          </div>
          <Botao variante="contorno" icone={<Percent size={16} />} onClick={aoDesconto} disabled={pagamentos.length > 0}>
            Desconto na venda (F6)
          </Botao>
          <Botao ref={refFinalizar} tamanho="lg" className="h-14 text-base" disabled={!pronto} carregando={finalizando} onClick={aoFinalizar}>
            Finalizar venda
          </Botao>
          <div className="flex flex-wrap justify-center gap-2">
            <Atalho tecla="F4" rotulo="Finalizar" />
            <Atalho tecla="Esc" rotulo="Voltar" />
          </div>
        </aside>
      </div>
    </Modal>
  )
}
