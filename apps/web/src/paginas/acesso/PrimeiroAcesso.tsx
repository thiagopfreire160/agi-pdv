import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { LayoutAcesso } from './LayoutAcesso'
import { CampoMascara, CampoTexto } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import { cnpjValido, emailValido } from '../../utils/formatos'
import { erroSenha } from './senha'

/** Assistente de primeiro acesso: loja (passo 1) e administrador (passo 2). */
export function PrimeiroAcesso() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const [passo, setPasso] = useState<1 | 2>(1)
  const [loja, setLoja] = useState({ nome_fantasia: '', cnpj: '' })
  const [adm, setAdm] = useState({ nome: '', email: '', senha: '', confirmacao_senha: '' })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  function avancar(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (loja.nome_fantasia.trim().length < 2) er['empresa.nome_fantasia'] = 'Informe o nome da loja.'
    if (!cnpjValido(loja.cnpj)) er['empresa.cnpj'] = 'Confira o CNPJ: os dígitos não batem.'
    setErros(er)
    if (!Object.keys(er).length) setPasso(2)
  }

  async function concluir(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (adm.nome.trim().length < 2) er['administrador.nome'] = 'Informe seu nome.'
    if (!emailValido(adm.email)) er['administrador.email'] = 'Informe um e-mail válido, como nome@loja.com.br.'
    const s = erroSenha(adm.senha)
    if (s) er['administrador.senha'] = s
    if (adm.senha !== adm.confirmacao_senha) er['administrador.confirmacao_senha'] = 'A confirmação está diferente da senha.'
    setErros(er)
    if (Object.keys(er).length) return
    setEnviando(true)
    try {
      await api.post('/primeiro-acesso', { empresa: loja, administrador: adm })
      qc.setQueryData(['primeiro-acesso'], { necessario: false })
      await qc.invalidateQueries({ queryKey: ['eu'] })
      navegar('/dashboard?boas_vindas=1', { replace: true })
    } catch (e) {
      if (e instanceof ErroApi && e.campos) {
        setErros(e.campos)
        if (Object.keys(e.campos).some((k) => k.startsWith('empresa.'))) setPasso(1)
      } else setErros({ geral: mensagemErro(e) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <LayoutAcesso
      titulo={passo === 1 ? 'Vamos começar pela sua loja' : 'Agora, o administrador'}
      descricao={passo === 1 ? 'Só o essencial. O resto você completa depois em Minha empresa.' : 'É quem cuida do sistema. Você entra com este e-mail e senha.'}
    >
      <ol className="mb-6 flex items-center gap-3" aria-label="Passos">
        {[1, 2].map((n) => (
          <li key={n} className="flex flex-1 items-center gap-3">
            <span
              className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${
                passo > n ? 'bg-primaria text-sobre-primaria' : passo === n ? 'bg-primaria text-sobre-primaria ring-4 ring-primaria/15' : 'bg-superficie-2 text-texto-3'
              }`}
            >
              {passo > n ? <Check size={16} /> : n}
            </span>
            <span className={`text-sm font-semibold ${passo >= n ? 'text-texto' : 'text-texto-3'}`}>{n === 1 ? 'Loja' : 'Administrador'}</span>
            {n === 1 && <span className="h-px flex-1 bg-borda" />}
          </li>
        ))}
      </ol>
      {passo === 1 ? (
        <form onSubmit={avancar} className="flex flex-col gap-4" noValidate>
          <CampoTexto
            rotulo="Nome da loja"
            obrigatorio
            autoFocus
            maxLength={80}
            value={loja.nome_fantasia}
            onChange={(e) => setLoja({ ...loja, nome_fantasia: e.target.value })}
            erro={erros['empresa.nome_fantasia']}
            ajuda="É o nome que aparece no recibo."
          />
          <CampoMascara rotulo="CNPJ" obrigatorio tipo="cnpj" valor={loja.cnpj} aoMudar={(v) => setLoja({ ...loja, cnpj: v })} erro={erros['empresa.cnpj']} />
          <Botao type="submit" tamanho="lg" larguraTotal icone={<ArrowRight size={18} />} className="mt-2 flex-row-reverse">
            Continuar
          </Botao>
        </form>
      ) : (
        <form onSubmit={concluir} className="flex flex-col gap-4" noValidate>
          <CampoTexto rotulo="Seu nome" obrigatorio autoFocus value={adm.nome} onChange={(e) => setAdm({ ...adm, nome: e.target.value })} erro={erros['administrador.nome']} />
          <CampoTexto rotulo="E-mail" obrigatorio type="email" autoComplete="username" value={adm.email} onChange={(e) => setAdm({ ...adm, email: e.target.value })} erro={erros['administrador.email']} />
          <CampoTexto
            rotulo="Senha"
            obrigatorio
            type="password"
            autoComplete="new-password"
            value={adm.senha}
            onChange={(e) => setAdm({ ...adm, senha: e.target.value })}
            erro={erros['administrador.senha']}
            ajuda="Pelo menos 8 caracteres, com letras e números."
          />
          <CampoTexto
            rotulo="Repita a senha"
            obrigatorio
            type="password"
            autoComplete="new-password"
            value={adm.confirmacao_senha}
            onChange={(e) => setAdm({ ...adm, confirmacao_senha: e.target.value })}
            erro={erros['administrador.confirmacao_senha']}
          />
          {erros.geral && <p className="rounded-xl bg-erro-bg px-3.5 py-2.5 text-sm font-medium text-erro-fg">{erros.geral}</p>}
          <div className="mt-2 flex gap-3">
            <Botao variante="contorno" tamanho="lg" icone={<ArrowLeft size={18} />} onClick={() => setPasso(1)}>
              Voltar
            </Botao>
            <Botao type="submit" tamanho="lg" carregando={enviando} className="flex-1">
              Concluir e entrar
            </Botao>
          </div>
        </form>
      )}
    </LayoutAcesso>
  )
}
