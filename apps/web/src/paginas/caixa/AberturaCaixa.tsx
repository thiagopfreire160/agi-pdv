import { useState } from 'react'
import { LockOpen } from 'lucide-react'
import { CampoDinheiro, CampoTexto, CaixaMarcar } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { SessaoCaixa } from '../../api/tipos'
import { lerTerminal, salvarTerminal } from './vendaLocal'
import { useEmpresaRecibo } from '../../api/consultas'
import { imprimirComprovante } from '../../utils/impressao'
import { dataHora, dinheiro } from '../../utils/formatos'

/** Abertura do caixa: fundo de troco e nome do terminal (lembrado no navegador). */
export function AberturaCaixa({ aoAbrir, operador }: { aoAbrir: (s: SessaoCaixa) => void; operador: string }) {
  const [fundo, setFundo] = useState(0)
  const [terminal, setTerminal] = useState(lerTerminal)
  const [imprimir, setImprimir] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const cab = useEmpresaRecibo()

  async function abrir(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    try {
      const r = await api.post<{ sessao: SessaoCaixa }>('/caixa/abrir', { fundo_troco: fundo, terminal: terminal.trim() || undefined })
      salvarTerminal(terminal.trim() || 'Caixa 1')
      if (imprimir && cab.data) {
        imprimirComprovante({
          empresa: cab.data.empresa,
          papel: cab.data.papel,
          titulo: 'ABERTURA DE CAIXA',
          linhas: [
            ['Caixa nº', String(r.sessao.numero)],
            ['Computador', r.sessao.terminal ?? '—'],
            ['Operador', operador],
            ['Data/hora', dataHora(r.sessao.aberto_em)],
          ],
          destaque: ['Fundo de troco', dinheiro(r.sessao.fundo_troco)],
          assinatura: true,
        })
      }
      aoAbrir(r.sessao)
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'CAIXA_JA_ABERTO') {
        const s = await api.get<{ sessao: SessaoCaixa | null }>('/caixa/atual')
        if (s.sessao) aoAbrir(s.sessao)
      } else setErro(mensagemErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={abrir} className="w-full max-w-md rounded-[28px] bg-superficie p-8 shadow-[var(--shadow-card)]">
        <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-selecao text-primaria">
          <LockOpen size={26} strokeWidth={1.75} />
        </div>
        <h1 className="text-[26px] font-bold tracking-tight text-texto">Abrir o caixa</h1>
        <p className="mt-1 text-sm text-texto-3">Conte o dinheiro que está na gaveta e informe abaixo. Pode ser zero.</p>
        <div className="mt-6 flex flex-col gap-4">
          <CampoDinheiro rotulo="Fundo de troco" grande autoFocus valor={fundo} aoMudar={setFundo} name="fundo_troco" />
          <CampoTexto rotulo="Nome deste computador" value={terminal} maxLength={30} onChange={(e) => setTerminal(e.target.value)} ajuda="Fica guardado neste navegador. Ex.: Caixa 1." />
          <CaixaMarcar rotulo="Imprimir comprovante de abertura" marcado={imprimir} aoMudar={setImprimir} />
          {erro && <p className="rounded-xl bg-erro-bg px-3.5 py-2.5 text-sm font-medium text-erro-fg">{erro}</p>}
          <Botao type="submit" tamanho="lg" carregando={enviando} larguraTotal className="mt-1 h-14 text-base">
            Abrir caixa
          </Botao>
        </div>
      </form>
    </div>
  )
}
