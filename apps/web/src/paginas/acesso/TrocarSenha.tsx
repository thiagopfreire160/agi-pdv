import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { KeyRound } from 'lucide-react'
import { LayoutAcesso } from './LayoutAcesso'
import { CampoTexto } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import { useSessao } from '../../ganchos/useSessao'
import { erroSenha } from './senha'

/** Troca de senha obrigatória: aparece logo após o login quando o usuário tem "deve trocar senha". */
export function TrocarSenha() {
  const { usuario, recarregar, sair } = useSessao()
  const navegar = useNavigate()
  const [nova, setNova] = useState('')
  const [conf, setConf] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  if (!usuario) return <Navigate to="/entrar" replace />
  if (!usuario.deve_trocar_senha && !enviando) return <Navigate to="/" replace />

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    const s = erroSenha(nova)
    if (s) er.nova_senha = s
    if (nova !== conf) er.confirmacao_senha = 'A confirmação está diferente da nova senha.'
    setErros(er)
    if (Object.keys(er).length) return
    setEnviando(true)
    try {
      await api.post('/auth/senha', { nova_senha: nova, confirmacao_senha: conf })
      await recarregar()
      navegar('/', { replace: true })
    } catch (e) {
      if (e instanceof ErroApi && e.campos) setErros(e.campos)
      else setErros({ nova_senha: mensagemErro(e) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <LayoutAcesso titulo="Crie sua senha" descricao={`Olá, ${usuario.nome.split(' ')[0]}. Antes de começar, troque a senha temporária por uma só sua.`}>
      <form onSubmit={salvar} className="flex flex-col gap-4" noValidate>
        <CampoTexto
          rotulo="Nova senha"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          erro={erros.nova_senha}
          ajuda="Pelo menos 8 caracteres, com letras e números."
        />
        <CampoTexto
          rotulo="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          value={conf}
          onChange={(e) => setConf(e.target.value)}
          erro={erros.confirmacao_senha}
        />
        <Botao type="submit" tamanho="lg" carregando={enviando} icone={<KeyRound size={18} />} larguraTotal className="mt-2">
          Salvar senha e continuar
        </Botao>
        <Botao variante="fantasma" onClick={() => sair().then(() => navegar('/entrar'))}>
          Sair
        </Botao>
      </form>
    </LayoutAcesso>
  )
}
