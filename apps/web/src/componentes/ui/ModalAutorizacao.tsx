import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Modal } from './Modal'
import { Botao } from './Botao'
import { AreaTexto, CampoTexto } from './Campo'
import { api, ErroApi, mensagemErro } from '../../api/cliente'

export type AcaoAutorizacao = 'desconto' | 'remover_item' | 'cancelar_venda_andamento' | 'cancelar_venda' | 'devolucao'

export interface PedidoAutorizacao {
  acao: AcaoAutorizacao
  /** O que precisa ser autorizado e por quê. */
  explicacao: string
  percentual?: number
  pedirMotivo?: boolean
  detalhes?: Record<string, unknown>
}

interface Props {
  pedido: PedidoAutorizacao | null
  aoFechar: () => void
  aoAutorizar: (token: string, motivo: string, autorizador: string) => void
}

/** Janela de autorização: gerente ou administrador digita e-mail (ou CPF) e senha no próprio terminal. */
export function ModalAutorizacao({ pedido, aoFechar, aoAutorizar }: Props) {
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (pedido) {
      setIdentificador('')
      setSenha('')
      setMotivo('')
      setErro(null)
      setErroMotivo(null)
    }
  }, [pedido])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!pedido) return
    if (pedido.pedirMotivo && motivo.trim().length < 3) {
      setErroMotivo('Escreva o motivo (pelo menos 3 letras).')
      return
    }
    if (!identificador.trim() || !senha) {
      setErro('Informe o e-mail (ou CPF) e a senha do gerente ou administrador.')
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      const r = await api.post<{ token: string; autorizador: { nome: string } }>('/autorizacoes', {
        acao: pedido.acao,
        identificador: identificador.trim(),
        senha,
        percentual: pedido.percentual,
        motivo: motivo.trim() || undefined,
        detalhes: pedido.detalhes,
      })
      aoAutorizar(r.token, motivo.trim(), r.autorizador.nome)
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'CREDENCIAIS_INVALIDAS') setErro('E-mail ou senha incorretos. Confira e tente de novo.')
      else setErro(mensagemErro(e))
      setSenha('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal aberto={!!pedido} aoFechar={aoFechar} titulo="Autorização do gerente" largura="sm">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-2xl bg-aviso-bg p-3.5 text-sm text-aviso-fg">
          <ShieldCheck size={20} className="mt-0.5 shrink-0" />
          <p className="font-medium">{pedido?.explicacao}</p>
        </div>
        {pedido?.pedirMotivo && (
          <AreaTexto rotulo="Motivo" obrigatorio value={motivo} onChange={(e) => setMotivo(e.target.value)} erro={erroMotivo} rows={2} data-autofoco maxLength={500} />
        )}
        <CampoTexto
          rotulo="E-mail ou CPF de quem autoriza"
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          autoComplete="off"
          data-autofoco={pedido?.pedirMotivo ? undefined : true}
        />
        <CampoTexto rotulo="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" erro={erro} />
        <div className="flex justify-end gap-2.5 pt-1">
          <Botao variante="fantasma" onClick={aoFechar}>
            Voltar
          </Botao>
          <Botao type="submit" carregando={enviando}>
            Autorizar
          </Botao>
        </div>
        <p className="text-xs text-texto-3">A autorização vale só para esta ação. Você continua no sistema com o seu usuário.</p>
      </form>
    </Modal>
  )
}
