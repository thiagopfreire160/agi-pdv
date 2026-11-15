import { useEffect, useState } from 'react'
import { Calculator, Lock, RotateCcw } from 'lucide-react'
import { Modal } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { AreaTexto, CampoDinheiro } from '../../componentes/ui/Campo'
import { Pilula } from '../../componentes/ui/Pilula'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { ResumoCaixa, SessaoCaixa } from '../../api/tipos'
import { dataHora, dinheiro, NOMES_FORMA } from '../../utils/formatos'
import { useEmpresaRecibo } from '../../api/consultas'
import { imprimirComprovante } from '../../utils/impressao'
import { useAvisos } from '../../componentes/ui/Avisos'

const VALORES = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5]

interface Conferencia {
  resumo: ResumoCaixa
  valor_contado: number
  valor_esperado: number
  diferenca: number
}

interface Props {
  aberto: boolean
  sessao: SessaoCaixa | null
  /** Fechamento forçado por gerente/admin (caixa de outro operador). */
  forcado?: boolean
  aoFechar: () => void
  aoConcluir: (s: SessaoCaixa) => void
}

/** Fechamento com contagem cega: primeiro o contado, depois o resumo e a diferença. */
export function ModalFechamento({ aberto, sessao, forcado, aoFechar, aoConcluir }: Props) {
  const [etapa, setEtapa] = useState<'contar' | 'conferir'>('contar')
  const [contado, setContado] = useState(0)
  const [porCedula, setPorCedula] = useState(false)
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [conf, setConf] = useState<Conferencia | null>(null)
  const [obs, setObs] = useState('')
  const [recontou, setRecontou] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [imprimir, setImprimir] = useState(true)
  const cab = useEmpresaRecibo()
  const { confirmar } = useAvisos()

  useEffect(() => {
    if (aberto) {
      setEtapa('contar')
      setContado(0)
      setContagem({})
      setPorCedula(false)
      setConf(null)
      setObs('')
      setRecontou(false)
      setErro(null)
    }
  }, [aberto])

  const somaCedulas = Object.entries(contagem).reduce((s, [v, q]) => s + Number(v) * (q || 0), 0)
  const valorContado = porCedula ? somaCedulas : contado

  async function conferir(e?: React.FormEvent) {
    e?.preventDefault()
    if (!sessao) return
    setEnviando(true)
    setErro(null)
    try {
      const contagemLimpa = porCedula ? Object.fromEntries(Object.entries(contagem).filter(([, q]) => q > 0)) : undefined
      if (forcado) {
        const s = await api.get<SessaoCaixa>(`/caixa/sessoes/${sessao.id}`)
        const esperado = s.resumo.esperado_dinheiro ?? 0
        setConf({ resumo: s.resumo, valor_contado: valorContado, valor_esperado: esperado, diferenca: valorContado - esperado })
      } else {
        const r = await api.post<Conferencia>('/caixa/conferencia', { valor_contado: valorContado, contagem: contagemLimpa })
        setConf(r)
      }
      setEtapa('conferir')
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setEnviando(false)
    }
  }

  async function fechar() {
    if (!sessao || !conf) return
    if (conf.diferenca !== 0 && obs.trim().length < 3) {
      setErro('Explique a diferença na observação antes de fechar.')
      return
    }
    const ok = await confirmar({
      titulo: 'Fechar o caixa?',
      mensagem: 'Depois de fechado, o caixa não pode ser reaberto nem editado.',
      confirmar: 'Fechar caixa',
    })
    if (ok === null) return
    setEnviando(true)
    setErro(null)
    try {
      const corpo = {
        valor_contado: conf.valor_contado,
        observacao: obs.trim() || undefined,
        contagem: porCedula ? Object.fromEntries(Object.entries(contagem).filter(([, q]) => q > 0)) : undefined,
      }
      const r = forcado
        ? await api.post<{ sessao: SessaoCaixa }>(`/caixa/sessoes/${sessao.id}/fechar`, corpo)
        : await api.post<{ sessao: SessaoCaixa }>('/caixa/fechar', corpo)
      if (imprimir && cab.data) {
        const res = r.sessao.resumo
        imprimirComprovante({
          empresa: cab.data.empresa,
          papel: cab.data.papel,
          titulo: forcado ? 'FECHAMENTO DE CAIXA (FORÇADO)' : 'FECHAMENTO DE CAIXA',
          linhas: [
            ['Caixa nº', String(r.sessao.numero)],
            ['Operador', r.sessao.operador_nome],
            ['Abertura', dataHora(r.sessao.aberto_em)],
            ['Fechamento', dataHora(r.sessao.fechado_em)],
            ['Fundo de troco', dinheiro(res.fundo_troco)],
            ...(Object.entries(res.vendas_por_forma).map(([f, v]) => [NOMES_FORMA[f] ?? f, dinheiro(v)]) as [string, string][]),
            ['Troco dado', dinheiro(res.troco ?? 0)],
            ['Suprimentos', dinheiro(res.suprimentos)],
            ['Sangrias', dinheiro(res.sangrias)],
            ['Estornos em dinheiro', dinheiro(res.estornos_dinheiro)],
            ['Vendas', String(res.quantidade_vendas)],
            ['Canceladas', `${res.canceladas.quantidade} (${dinheiro(res.canceladas.valor)})`],
            ['Esperado em dinheiro', dinheiro(r.sessao.valor_esperado)],
            ['Contado', dinheiro(r.sessao.valor_contado)],
          ],
          destaque: ['Diferença', dinheiro(r.sessao.diferenca)],
          observacao: r.sessao.observacao_fechamento ?? undefined,
          assinatura: true,
        })
      }
      aoConcluir(r.sessao)
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'OBSERVACAO_OBRIGATORIA') setErro('Explique a diferença na observação antes de fechar.')
      else setErro(mensagemErro(e))
    } finally {
      setEnviando(false)
    }
  }

  const res = conf?.resumo
  const dif = conf?.diferenca ?? 0

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={forcado ? `Fechar caixa de ${sessao?.operador_nome ?? ''}` : 'Fechar o caixa'}
      descricao={etapa === 'contar' ? 'Conte o dinheiro da gaveta e informe o total. O sistema só mostra o esperado depois.' : 'Confira o resumo antes de fechar.'}
      largura="lg"
    >
      {etapa === 'contar' ? (
        <form onSubmit={conferir} className="flex flex-col gap-4">
          {!porCedula ? (
            <CampoDinheiro rotulo="Dinheiro contado na gaveta" grande data-autofoco valor={contado} aoMudar={setContado} name="valor_contado" />
          ) : (
            <div>
              <p className="mb-2 text-[13px] font-semibold text-texto-2">Quantidade de cada cédula e moeda</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VALORES.map((v) => (
                  <label key={v} className="flex items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3 py-2">
                    <span className="tabular w-16 text-xs font-semibold text-texto-2">{v >= 100 ? `R$ ${v / 100}` : `${v} ¢`}</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={contagem[v] || ''}
                      onChange={(e) => setContagem({ ...contagem, [v]: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                      className="tabular w-full min-w-0 bg-transparent text-right text-sm font-semibold text-texto outline-none"
                      aria-label={`Quantidade de ${dinheiro(v)}`}
                    />
                  </label>
                ))}
              </div>
              <p className="tabular mt-3 text-right text-lg font-bold text-texto">Total contado: {dinheiro(somaCedulas)}</p>
            </div>
          )}
          <button type="button" onClick={() => setPorCedula((p) => !p)} className="inline-flex items-center gap-2 self-start text-sm font-semibold text-primaria hover:underline">
            <Calculator size={16} /> {porCedula ? 'Digitar o total direto' : 'Ajuda para contar por cédulas e moedas'}
          </button>
          {erro && <p className="text-sm font-medium text-erro-fg">{erro}</p>}
          <div className="flex justify-end gap-2.5">
            <Botao variante="fantasma" onClick={aoFechar}>Voltar</Botao>
            <Botao type="submit" carregando={enviando}>
              Conferir
            </Botao>
          </div>
        </form>
      ) : (
        res && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-superficie-2 p-4 text-sm">
                {[
                  ['Fundo de troco', res.fundo_troco],
                  ...Object.entries(res.vendas_por_forma).map(([f, v]) => [`Vendas em ${NOMES_FORMA[f]?.toLowerCase() ?? f}`, v]),
                  ['Troco dado', res.troco ?? 0],
                  ['Suprimentos', res.suprimentos],
                  ['Sangrias', res.sangrias],
                  ['Estornos em dinheiro', res.estornos_dinheiro],
                ].map(([r, v]) => (
                  <div key={String(r)} className="flex justify-between py-1 text-texto-2">
                    <span>{r}</span>
                    <span className="tabular font-medium text-texto">{dinheiro(Number(v))}</span>
                  </div>
                ))}
                <div className="mt-1 flex justify-between border-t border-borda pt-2 text-texto-2">
                  <span>Vendas</span>
                  <span className="tabular font-medium text-texto">{res.quantidade_vendas}</span>
                </div>
                <div className="flex justify-between py-1 text-texto-2">
                  <span>Canceladas</span>
                  <span className="tabular font-medium text-texto">
                    {res.canceladas.quantidade} ({dinheiro(res.canceladas.valor)})
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-borda p-4">
                  <div className="flex justify-between text-sm text-texto-2">
                    <span>Esperado em dinheiro</span>
                    <span className="tabular font-semibold text-texto">{dinheiro(conf.valor_esperado)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm text-texto-2">
                    <span>Contado</span>
                    <span className="tabular font-semibold text-texto">{dinheiro(conf.valor_contado)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-borda pt-3">
                    <span className="text-sm font-bold text-texto">Diferença</span>
                    <span className="flex items-center gap-2">
                      {dif !== 0 && <Pilula tom={dif > 0 ? 'info' : 'erro'}>{dif > 0 ? 'Sobra' : 'Falta'}</Pilula>}
                      {dif === 0 && <Pilula tom="ok">Confere</Pilula>}
                      <span className="tabular text-2xl font-extrabold text-texto">{dif < 0 ? '− ' : ''}{dinheiro(Math.abs(dif))}</span>
                    </span>
                  </div>
                </div>
                {dif !== 0 && !recontou && (
                  <Botao
                    variante="contorno"
                    icone={<RotateCcw size={16} />}
                    onClick={() => { setRecontou(true); setEtapa('contar'); setConf(null) }}
                  >
                    Contar de novo
                  </Botao>
                )}
              </div>
            </div>
            <AreaTexto
              rotulo={dif !== 0 ? 'Observação (obrigatória quando há diferença)' : 'Observação (opcional)'}
              obrigatorio={dif !== 0}
              value={obs}
              maxLength={500}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              data-autofoco={dif !== 0 ? true : undefined}
            />
            <label className="inline-flex items-center gap-2 text-sm text-texto-2">
              <input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} className="size-4 accent-[var(--primaria)]" />
              Imprimir relatório de fechamento
            </label>
            {erro && <p className="text-sm font-medium text-erro-fg">{erro}</p>}
            <div className="flex justify-end gap-2.5">
              <Botao variante="fantasma" onClick={aoFechar}>Voltar</Botao>
              <Botao data-primario icone={<Lock size={16} />} carregando={enviando} onClick={fechar}>
                Fechar caixa
              </Botao>
            </div>
          </div>
        )
      )}
    </Modal>
  )
}
