import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { LayoutAcesso } from './LayoutAcesso'
import { CampoTexto } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import { useSessao } from '../../ganchos/useSessao'

export function Login() {
  const { usuario, recarregar } = useSessao()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (usuario && !enviando) return <Navigate to={usuario.deve_trocar_senha ? '/trocar-senha' : params.get('voltar') || '/'} replace />

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!identificador.trim() || !senha) {
      setErro('Informe o e-mail (ou CPF) e a senha.')
      return
    }
    setEnviando(true)
    try {
      const r = await api.post<{ tela_inicial: string; deve_trocar_senha: boolean }>('/auth/entrar', { identificador: identificador.trim(), senha })
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'primeiro-acesso' && q.queryKey[0] !== 'eu' })
      await recarregar()
      const voltar = params.get('voltar')
      if (r.deve_trocar_senha) navegar('/trocar-senha', { replace: true })
      else navegar(voltar || (r.tela_inicial === 'caixa' ? '/caixa' : '/dashboard'), { replace: true })
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'BLOQUEADO') {
        const min = Number(e.dados.minutos_restantes ?? 10)
        setErro(`Muitas tentativas erradas. Tente de novo em ${min} ${min === 1 ? 'minuto' : 'minutos'} ou peça ajuda ao gerente.`)
      } else if (e instanceof ErroApi && e.codigo === 'CREDENCIAIS_INVALIDAS') {
        setErro('E-mail ou senha incorretos. Confira e tente de novo.')
      } else setErro(mensagemErro(e))
      setSenha('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <LayoutAcesso titulo="Entrar" descricao="Use seu e-mail ou CPF e a senha que o administrador passou.">
      <form onSubmit={entrar} className="flex flex-col gap-4" noValidate>
        <CampoTexto
          rotulo="E-mail ou CPF"
          name="identificador"
          autoComplete="username"
          autoFocus
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
        />
        <CampoTexto
          rotulo="Senha"
          name="senha"
          type={ver ? 'text' : 'password'}
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          sufixo={
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}
              className="flex size-8 items-center justify-center rounded-lg text-texto-3 hover:text-texto"
            >
              {ver ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          }
        />
        {erro && (
          <p role="alert" className="rounded-xl bg-erro-bg px-3.5 py-2.5 text-sm font-medium text-erro-fg">
            {erro}
          </p>
        )}
        <Botao type="submit" tamanho="lg" carregando={enviando} icone={<LogIn size={18} />} larguraTotal className="mt-2">
          Entrar
        </Botao>
        <p className="text-center text-xs text-texto-3">Esqueceu a senha? Peça ao administrador ou gerente uma senha temporária.</p>
      </form>
    </LayoutAcesso>
  )
}
