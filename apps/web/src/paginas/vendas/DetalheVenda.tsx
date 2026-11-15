import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Ban, Printer } from 'lucide-react'
import { Gaveta } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { Pilula } from '../../componentes/ui/Pilula'
import { EsqueletoLinhas } from '../../componentes/ui/Estados'
import { useAvisos } from '../../componentes/ui/Avisos'
import { ModalAutorizacao, type PedidoAutorizacao } from '../../componentes/ui/ModalAutorizacao'
import { api, mensagemErro } from '../../api/cliente'
import type { Recibo, Venda } from '../../api/tipos'
import { useUsuario } from '../../ganchos/useSessao'
import { dataHora, dinheiro, mascararDocumento, NOMES_FORMA, quantidade } from '../../utils/formatos'
import { imprimirRecibo } from '../../utils/impressao'

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">{titulo}</h3>
      {children}
    </section>
  )
}

/** Detalhe da venda: itens, pagamentos, autorizações, devoluções e ações. */
export function DetalheVenda({ id, aoFechar }: { id: string | null; aoFechar: () => void }) {
  const usuario = useUsuario()
  const qc = useQueryClient()
  const navegar = useNavigate()
  const { confirmar, sucesso, erro } = useAvisos()
  const [pedido, setPedido] = useState<PedidoAutorizacao | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const motivoPendente = useRef('')
  const q = useQuery({ queryKey: ['venda', id], queryFn: () => api.get<Venda>(`/vendas/${id}`), enabled: !!id })
  const v = q.data

  async function reimprimir() {
    if (!v) return
    try {
      const r = await api.get<Recibo>(`/vendas/${v.id}/recibo`, { segunda_via: true })
      imprimirRecibo(r)
    } catch (e) {
      erro(mensagemErro(e))
    }
  }

  async function cancelar(token?: string, motivoAut?: string) {
    if (!v) return
    let motivo = motivoAut
    if (!motivo) {
      const m = await confirmar({
        titulo: `Cancelar a venda nº ${v.numero}?`,
        mensagem: `O estoque volta e o valor de ${dinheiro(v.total)} sai do caixa. Não dá para desfazer.`,
        confirmar: 'Cancelar venda',
        cancelar: 'Manter venda',
        perigo: true,
        pedirMotivo: { rotulo: 'Motivo do cancelamento', minimo: 3 },
      })
      if (m === null) return
      motivo = m
    }
    if (usuario.perfil === 'caixa' && !token) {
      setPedido({ acao: 'cancelar_venda', explicacao: `Cancelar a venda nº ${v.numero} de ${dinheiro(v.total)}. Motivo: ${motivo}`, pedirMotivo: false })
      motivoPendente.current = motivo
      return
    }
    setOcupado(true)
    try {
      await api.post(`/vendas/${v.id}/cancelar`, { motivo, token_autorizacao: token })
      sucesso(`Venda nº ${v.numero} cancelada.`)
      qc.invalidateQueries({ queryKey: ['venda', id] })
      qc.invalidateQueries({ queryKey: ['vendas'] })
    } catch (e) {
      erro(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Gaveta
      aberto={!!id}
      aoFechar={aoFechar}
      largura="max-w-2xl"
      titulo={v ? `Venda nº ${v.numero}` : 'Venda'}
      descricao={v ? `${dataHora(v.finalizada_em)} · ${v.operador_nome}${v.terminal ? ` · ${v.terminal}` : ''}` : undefined}
      rodape={
        v && (
          <>
            {v.situacao === 'finalizada' && v.itens.some((i) => i.quantidade_disponivel_devolucao > 0) && (
              <Botao variante="fantasma" icone={<ArrowLeftRight size={16} />} onClick={() => navegar(`/trocas?venda=${v.numero}`)}>
                Fazer troca
              </Botao>
            )}
            {v.pode_cancelar && (
              <Botao variante="perigo" icone={<Ban size={16} />} carregando={ocupado} onClick={() => cancelar()}>
                Cancelar venda
              </Botao>
            )}
            <Botao variante="contorno" icone={<Printer size={16} />} onClick={reimprimir}>
              Reimprimir recibo
            </Botao>
          </>
        )
      }
    >
      {!v ? (
        <EsqueletoLinhas linhas={8} colunas={3} />
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {v.situacao === 'cancelada' ? <Pilula tom="erro">Cancelada</Pilula> : <Pilula tom="ok">Finalizada</Pilula>}
            {v.devolucoes.length > 0 && <Pilula tom="info">Com devolução</Pilula>}
            {(v.cliente_nome || v.documento_recibo) && (
              <span className="text-sm text-texto-2">
                Cliente: <b className="text-texto">{v.cliente_nome ?? mascararDocumento(v.documento_recibo)}</b>
              </span>
            )}
          </div>
          {v.situacao === 'cancelada' && (
            <p className="mt-3 rounded-xl bg-erro-bg px-4 py-3 text-sm text-erro-fg">
              Cancelada em {dataHora(v.cancelada_em)} por {v.cancelada_por_nome}
              {v.cancelamento_autorizado_por_nome ? ` (autorizado por ${v.cancelamento_autorizado_por_nome})` : ''}. Motivo: {v.motivo_cancelamento}
            </p>
          )}

          <Bloco titulo="Itens">
            <div className="overflow-hidden rounded-2xl border border-borda">
              <table className="w-full text-sm">
                <tbody>
                  {v.itens.map((i) => (
                    <tr key={i.id} className="border-b border-borda last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-texto">{i.descricao}</p>
                        <p className="tabular text-xs text-texto-3">
                          {quantidade(i.quantidade, i.unidade)} {i.unidade} × {dinheiro(i.preco_unitario)}
                          {i.desconto > 0 ? ` · desconto ${dinheiro(i.desconto)}` : ''}
                          {i.rateio_desconto > 0 ? ` · rateio ${dinheiro(i.rateio_desconto)}` : ''}
                        </p>
                        {i.quantidade_devolvida > 0 && (
                          <p className="tabular mt-1 text-xs font-semibold text-info-fg">
                            Devolvido: {quantidade(i.quantidade_devolvida, i.unidade)} ({dinheiro(i.valor_devolvido)})
                          </p>
                        )}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-semibold text-texto">{dinheiro(i.total_liquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 ml-auto flex max-w-xs flex-col gap-1 text-sm">
              <div className="flex justify-between text-texto-2"><span>Subtotal</span><span className="tabular">{dinheiro(v.soma_bruto)}</span></div>
              {v.desconto_total > 0 && <div className="flex justify-between text-texto-2"><span>Descontos</span><span className="tabular">− {dinheiro(v.desconto_total)}</span></div>}
              <div className="flex justify-between border-t border-borda pt-1 text-base font-bold text-texto"><span>Total</span><span className="tabular">{dinheiro(v.total)}</span></div>
            </div>
          </Bloco>

          <Bloco titulo="Pagamentos">
            <ul className="flex flex-col gap-1.5">
              {v.pagamentos.map((p) => (
                <li key={p.id} className="flex justify-between rounded-xl bg-superficie-2 px-4 py-2.5 text-sm">
                  <span className="text-texto-2">
                    {NOMES_FORMA[p.forma]}
                    {p.forma === 'credito' && p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}
                    {p.codigo_vale ? ` · ${p.codigo_vale}` : ''}
                    {p.observacao ? ` · ${p.observacao}` : ''}
                  </span>
                  <span className="tabular font-semibold text-texto">{dinheiro(p.valor)}</span>
                </li>
              ))}
              {v.troco > 0 && (
                <li className="flex justify-between px-4 py-1 text-sm text-texto-2">
                  <span>Troco</span>
                  <span className="tabular font-semibold">{dinheiro(v.troco)}</span>
                </li>
              )}
            </ul>
          </Bloco>

          {v.autorizacoes.length > 0 && (
            <Bloco titulo="Autorizações">
              <ul className="flex flex-col gap-1.5 text-sm">
                {v.autorizacoes.map((a) => (
                  <li key={a.id} className="rounded-xl border border-borda px-4 py-2.5 text-texto-2">
                    <b className="text-texto">{a.tipo === 'remover_item' ? 'Remoção de item' : `Desconto de ${a.percentual}%`}</b> · autorizado por {a.autorizador_nome} às {dataHora(a.data_hora)}
                    {a.motivo ? ` · ${a.motivo}` : ''}
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          {v.devolucoes.length > 0 && (
            <Bloco titulo="Devoluções">
              <ul className="flex flex-col gap-1.5 text-sm">
                {v.devolucoes.map((d) => (
                  <li key={d.id} className="flex justify-between rounded-xl border border-borda px-4 py-2.5 text-texto-2">
                    <span>
                      Nº {d.numero} · {dataHora(d.criado_em)} · {d.destino === 'vale_troca' ? 'Vale-troca' : `Estorno ${NOMES_FORMA[d.forma_estorno ?? ''] ?? ''}`}
                    </span>
                    <span className="tabular font-semibold text-texto">{dinheiro(d.valor)}</span>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}
        </div>
      )}
      <ModalAutorizacao
        pedido={pedido}
        aoFechar={() => setPedido(null)}
        aoAutorizar={(token) => {
          setPedido(null)
          cancelar(token, motivoPendente.current)
        }}
      />
    </Gaveta>
  )
}
