import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { Modal } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { CampoDinheiro, CampoTexto, CaixaMarcar, Segmentado } from '../../componentes/ui/Campo'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { MovimentoCaixa, SessaoCaixa } from '../../api/tipos'
import { dataHora, dinheiro, hora } from '../../utils/formatos'
import { useEmpresaRecibo } from '../../api/consultas'
import { imprimirComprovante } from '../../utils/impressao'
import { Pilula } from '../../componentes/ui/Pilula'

/** Sangria (tira dinheiro) e suprimento (põe dinheiro) — F9. */
export function ModalMovimento({ aberto, sessao, aoFechar, aoRegistrar }: { aberto: boolean; sessao: SessaoCaixa; aoFechar: () => void; aoRegistrar: () => void }) {
  const [tipo, setTipo] = useState<'sangria' | 'suprimento'>('sangria')
  const [valor, setValor] = useState(0)
  const [motivo, setMotivo] = useState('')
  const [imprimir, setImprimir] = useState(true)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const cab = useEmpresaRecibo()

  useEffect(() => {
    if (aberto) {
      setValor(0)
      setMotivo('')
      setErros({})
    }
  }, [aberto])

  async function registrar(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (valor <= 0) er.valor = 'Informe o valor.'
    if (tipo === 'sangria' && motivo.trim().length < 3) er.motivo = 'Escreva o motivo da sangria. Ex.: depósito no cofre.'
    setErros(er)
    if (Object.keys(er).length) return
    setEnviando(true)
    try {
      const m = await api.post<MovimentoCaixa>('/caixa/movimentos', { tipo, valor, motivo: motivo.trim() || undefined })
      if (imprimir && cab.data) {
        imprimirComprovante({
          empresa: cab.data.empresa,
          papel: cab.data.papel,
          titulo: tipo === 'sangria' ? 'SANGRIA' : 'SUPRIMENTO',
          linhas: [
            ['Caixa nº', String(sessao.numero)],
            ['Operador', sessao.operador_nome],
            ['Data/hora', dataHora(m.data_hora)],
          ],
          destaque: ['Valor', dinheiro(m.valor)],
          observacao: m.motivo ? `Motivo: ${m.motivo}` : undefined,
          assinatura: true,
        })
      }
      aoRegistrar()
    } catch (e) {
      if (e instanceof ErroApi && e.campos) setErros(e.campos)
      else setErros({ valor: mensagemErro(e) })
    } finally {
      setEnviando(false)
    }
  }

  const movs = sessao.movimentos ?? []

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Sangria e suprimento" descricao="Registre todo dinheiro que sai ou entra na gaveta fora das vendas." largura="lg">
      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={registrar} className="flex flex-col gap-4">
          <Segmentado
            valor={tipo}
            aoMudar={(t) => { setTipo(t); setErros({}) }}
            opcoes={[{ valor: 'sangria', rotulo: 'Sangria (tirar)' }, { valor: 'suprimento', rotulo: 'Suprimento (pôr)' }]}
          />
          <CampoDinheiro rotulo="Valor" grande data-autofoco valor={valor} aoMudar={setValor} erro={erros.valor} />
          <CampoTexto
            rotulo={tipo === 'sangria' ? 'Motivo' : 'Motivo (opcional)'}
            obrigatorio={tipo === 'sangria'}
            placeholder={tipo === 'sangria' ? 'Ex.: depósito no cofre' : 'Ex.: reforço de troco'}
            value={motivo}
            maxLength={120}
            onChange={(e) => setMotivo(e.target.value)}
            erro={erros.motivo}
          />
          <CaixaMarcar rotulo="Imprimir comprovante com espaço para assinatura" marcado={imprimir} aoMudar={setImprimir} />
          <Botao type="submit" carregando={enviando} icone={tipo === 'sangria' ? <ArrowUpFromLine size={18} /> : <ArrowDownToLine size={18} />}>
            {tipo === 'sangria' ? 'Registrar sangria' : 'Registrar suprimento'}
          </Botao>
        </form>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">Movimentos deste caixa</p>
          {movs.length === 0 ? (
            <p className="text-sm text-texto-3">Nenhum movimento ainda.</p>
          ) : (
            <ul className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
              {movs.map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-xl border border-borda px-3 py-2">
                  <Pilula tom={m.tipo === 'suprimento' ? 'ok' : m.tipo === 'sangria' ? 'aviso' : 'info'}>
                    {m.tipo === 'suprimento' ? 'Suprimento' : m.tipo === 'sangria' ? 'Sangria' : 'Estorno'}
                  </Pilula>
                  <span className="min-w-0 flex-1 truncate text-xs text-texto-3">{m.motivo ?? '—'}</span>
                  <span className="tabular text-xs text-texto-3">{hora(m.data_hora)}</span>
                  <span className="tabular text-sm font-semibold text-texto">{dinheiro(m.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
