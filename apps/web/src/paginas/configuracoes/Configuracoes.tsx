import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Laptop, LogOut, Moon, Printer, Sun } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Configuracoes as TConfig, Lista, Recibo, RegistroAuditoria, SessaoLogin, Tema } from '../../api/tipos'
import { useConfiguracoes, useOperadores } from '../../api/consultas'
import { useSessao, useUsuario } from '../../ganchos/useSessao'
import { useTema } from '../../ganchos/useTema'
import { useAlternarTema } from '../../ganchos/useAlternarTema'
import { pode } from '../../utils/permissoes'
import { Abas, BarraFiltros, CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card, CabecalhoCard } from '../../componentes/ui/Card'
import { CampoDinheiro, CampoMascara, CampoTexto, Interruptor, Selecao, CampoData } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { Pilula } from '../../componentes/ui/Pilula'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { EsqueletoLinhas } from '../../componentes/ui/Estados'
import { useAvisos } from '../../componentes/ui/Avisos'
import { dataHora, hojeIso, NOMES_PERFIL, soDigitos } from '../../utils/formatos'
import { imprimirRecibo } from '../../utils/impressao'
import { erroSenha } from '../acesso/senha'

type Aba = 'caixa' | 'recibo' | 'aparencia' | 'conta' | 'seguranca' | 'auditoria'

function useFormConfig() {
  const cfg = useConfiguracoes()
  const qc = useQueryClient()
  const { sucesso, erro } = useAvisos()
  const [f, setF] = useState<TConfig | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (cfg.data) setF(cfg.data)
  }, [cfg.data])
  const set = <K extends keyof TConfig>(k: K, v: TConfig[K]) => setF((x) => (x ? { ...x, [k]: v } : x))
  async function salvar(campos: (keyof TConfig)[]) {
    if (!f || !cfg.data) return
    const corpo: Record<string, unknown> = { versao: cfg.data.versao }
    campos.forEach((c) => (corpo[c] = f[c]))
    setSalvando(true)
    setErros({})
    try {
      const r = await api.put<TConfig>('/configuracoes', corpo)
      qc.setQueryData(['configuracoes'], r)
      qc.invalidateQueries({ queryKey: ['recibo-teste'] })
      sucesso('Configurações salvas. Valem a partir da próxima ação.')
    } catch (e) {
      if (e instanceof ErroApi && e.campos) setErros(e.campos)
      else erro(e instanceof ErroApi && e.codigo === 'CONFLITO_VERSAO' ? 'Outra pessoa salvou antes. Recarregue a página.' : mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }
  return { f, set, erros, salvar, salvando }
}

const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')))

function CaixaVendas() {
  const { f, set, erros, salvar, salvando } = useFormConfig()
  if (!f) return <Card><EsqueletoLinhas /></Card>
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:gap-5">
      <Card>
        <CabecalhoCard titulo="Limites de desconto" descricao="Percentual máximo do desconto total da venda, sem autorização." />
        <div className="grid grid-cols-3 gap-4">
          <CampoTexto rotulo="Caixa (%)" inputMode="decimal" value={String(f.limite_desconto_caixa)} onChange={(e) => set('limite_desconto_caixa', num(e.target.value))} erro={erros.limite_desconto_caixa} />
          <CampoTexto rotulo="Gerente (%)" inputMode="decimal" value={String(f.limite_desconto_gerente)} onChange={(e) => set('limite_desconto_gerente', num(e.target.value))} erro={erros.limite_desconto_gerente} />
          <CampoTexto rotulo="Administrador" value="100%" disabled />
        </div>
        <p className="mt-3 text-xs text-texto-3">O limite do gerente precisa ser igual ou maior que o do caixa.</p>
      </Card>
      <Card>
        <CabecalhoCard titulo="Regras do caixa" />
        <div className="flex flex-col gap-3">
          <Interruptor rotulo="Pedir autorização para remover item" descricao="Vale para o perfil Caixa." marcado={f.exigir_autorizacao_remover_item} aoMudar={(v) => set('exigir_autorizacao_remover_item', v)} />
          <Interruptor rotulo="Permitir vender sem estoque" descricao="Desligado, o caixa não deixa vender produto sem estoque." marcado={f.permitir_vender_sem_estoque} aoMudar={(v) => set('permitir_vender_sem_estoque', v)} />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <CampoTexto rotulo="Máximo de parcelas no crédito" inputMode="numeric" value={String(f.max_parcelas_credito)} onChange={(e) => set('max_parcelas_credito', num(soDigitos(e.target.value)))} erro={erros.max_parcelas_credito} />
            <CampoDinheiro rotulo="Avisar sangria acima de" valor={f.alerta_sangria_valor} aoMudar={(v) => set('alerta_sangria_valor', v)} ajuda="R$ 0,00 desliga o aviso." erro={erros.alerta_sangria_valor} />
          </div>
        </div>
      </Card>
      <Card>
        <CabecalhoCard titulo="Trocas e vales" />
        <div className="grid grid-cols-2 gap-4">
          <CampoTexto rotulo="Prazo para trocas (dias)" inputMode="numeric" value={String(f.prazo_trocas_dias)} onChange={(e) => set('prazo_trocas_dias', num(soDigitos(e.target.value)))} ajuda="0 = sem limite." erro={erros.prazo_trocas_dias} />
          <CampoTexto rotulo="Validade do vale-troca (dias)" inputMode="numeric" value={String(f.validade_vale_troca_dias)} onChange={(e) => set('validade_vale_troca_dias', num(soDigitos(e.target.value)))} erro={erros.validade_vale_troca_dias} />
        </div>
      </Card>
      <div className="flex items-end justify-end lg:col-span-2">
        <Botao
          carregando={salvando}
          onClick={() => salvar(['limite_desconto_caixa', 'limite_desconto_gerente', 'exigir_autorizacao_remover_item', 'permitir_vender_sem_estoque', 'max_parcelas_credito', 'alerta_sangria_valor', 'prazo_trocas_dias', 'validade_vale_troca_dias'])}
        >
          Salvar regras
        </Botao>
      </div>
    </div>
  )
}

function ConfigRecibo() {
  const { f, set, erros, salvar, salvando } = useFormConfig()
  const { erro } = useAvisos()
  if (!f) return <Card><EsqueletoLinhas /></Card>
  async function teste() {
    try {
      const r = await api.get<Recibo>('/configuracoes/recibo-teste')
      imprimirRecibo(r)
    } catch (e) {
      erro(mensagemErro(e))
    }
  }
  return (
    <Card className="max-w-2xl">
      <CabecalhoCard titulo="Impressão do recibo" descricao="O recibo abre a janela de impressão do navegador. Escolha a impressora térmica lá." />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Selecao rotulo="Papel" value={f.papel_recibo} onChange={(e) => set('papel_recibo', e.target.value as TConfig['papel_recibo'])} erro={erros.papel_recibo}>
            <option value="80mm">Bobina 80 mm</option>
            <option value="58mm">Bobina 58 mm</option>
            <option value="A4">Folha A4</option>
          </Selecao>
          <Selecao rotulo="Vias" value={f.vias_recibo} onChange={(e) => set('vias_recibo', Number(e.target.value))}>
            <option value={1}>1 via</option>
            <option value={2}>2 vias</option>
          </Selecao>
        </div>
        <Interruptor rotulo="Mostrar logo no recibo" marcado={f.mostrar_logo_recibo} aoMudar={(v) => set('mostrar_logo_recibo', v)} />
        <Interruptor rotulo="Imprimir automaticamente ao finalizar" descricao="Desligado, o caixa mostra o botão Imprimir recibo." marcado={f.imprimir_automaticamente} aoMudar={(v) => set('imprimir_automaticamente', v)} />
        <div className="flex justify-end gap-2.5 pt-2">
          <Botao variante="contorno" icone={<Printer size={16} />} onClick={teste}>Imprimir recibo de teste</Botao>
          <Botao carregando={salvando} onClick={() => salvar(['papel_recibo', 'vias_recibo', 'mostrar_logo_recibo', 'imprimir_automaticamente'])}>Salvar recibo</Botao>
        </div>
      </div>
    </Card>
  )
}

function Aparencia() {
  const { tema } = useTema()
  const { escolher } = useAlternarTema()
  const opcoes: { t: Tema; rotulo: string; icone: typeof Sun; desc: string }[] = [
    { t: 'claro', rotulo: 'Claro', icone: Sun, desc: 'Fundo creme, bom para lojas bem iluminadas.' },
    { t: 'escuro', rotulo: 'Escuro', icone: Moon, desc: 'Padrão. Cansa menos a vista à noite.' },
    { t: 'sistema', rotulo: 'Igual ao computador', icone: Laptop, desc: 'Usa o tema claro ou escuro do computador.' },
  ]
  return (
    <Card className="max-w-3xl">
      <CabecalhoCard titulo="Tema" descricao="Fica salvo no seu usuário e vale em qualquer computador." />
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tema">
        {opcoes.map(({ t, rotulo, icone: I, desc }) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tema === t}
            onClick={() => escolher(t)}
            className={`rounded-2xl border-2 p-4 text-left transition-colors ${tema === t ? 'border-primaria bg-selecao' : 'border-borda hover:border-destaque/50'}`}
          >
            <I size={22} className={tema === t ? 'text-primaria' : 'text-texto-3'} />
            <p className="mt-3 text-sm font-semibold text-texto">{rotulo}</p>
            <p className="text-xs text-texto-3">{desc}</p>
          </button>
        ))}
      </div>
    </Card>
  )
}

function MinhaConta() {
  const usuario = useUsuario()
  const { recarregar } = useSessao()
  const { sucesso, erro } = useAvisos()
  const [nome, setNome] = useState(usuario.nome)
  const [telefone, setTelefone] = useState(usuario.telefone ?? '')
  const [s, setS] = useState({ atual: '', nova: '', conf: '' })
  const [erros, setErros] = useState<Record<string, string>>({})
  async function salvarPerfil() {
    if (nome.trim().length < 2) return setErros({ nome: 'Informe seu nome.' })
    try {
      await api.put('/auth/perfil', { nome: nome.trim(), telefone: soDigitos(telefone) || null })
      await recarregar()
      sucesso('Seus dados foram salvos.')
    } catch (e) {
      erro(mensagemErro(e))
    }
  }
  async function trocarSenha() {
    const er: Record<string, string> = {}
    if (!s.atual) er.senha_atual = 'Informe a senha atual.'
    const p = erroSenha(s.nova)
    if (p) er.nova_senha = p
    if (s.nova !== s.conf) er.confirmacao_senha = 'A confirmação está diferente.'
    setErros(er)
    if (Object.keys(er).length) return
    try {
      const r = await api.post<{ outras_sessoes_encerradas: number }>('/auth/senha', { senha_atual: s.atual, nova_senha: s.nova, confirmacao_senha: s.conf })
      setS({ atual: '', nova: '', conf: '' })
      sucesso(r.outras_sessoes_encerradas > 0 ? `Senha trocada. ${r.outras_sessoes_encerradas} outros acessos foram desconectados.` : 'Senha trocada.')
    } catch (e) {
      if (e instanceof ErroApi && e.campos) setErros(e.campos)
      else erro(mensagemErro(e))
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:gap-5">
      <Card>
        <CabecalhoCard titulo="Meus dados" descricao={`${usuario.email} · ${NOMES_PERFIL[usuario.perfil]}`} />
        <div className="flex flex-col gap-4">
          <CampoTexto rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.nome} />
          <CampoMascara rotulo="Telefone" tipo="telefone" valor={telefone} aoMudar={setTelefone} />
          <Botao className="self-end" onClick={salvarPerfil}>Salvar meus dados</Botao>
        </div>
      </Card>
      <Card>
        <CabecalhoCard titulo="Trocar minha senha" descricao="Os outros computadores em que você entrou serão desconectados." />
        <div className="flex flex-col gap-4">
          <CampoTexto rotulo="Senha atual" type="password" autoComplete="current-password" value={s.atual} onChange={(e) => setS({ ...s, atual: e.target.value })} erro={erros.senha_atual} />
          <CampoTexto rotulo="Nova senha" type="password" autoComplete="new-password" value={s.nova} onChange={(e) => setS({ ...s, nova: e.target.value })} erro={erros.nova_senha} ajuda="Pelo menos 8 caracteres, com letras e números." />
          <CampoTexto rotulo="Repita a nova senha" type="password" autoComplete="new-password" value={s.conf} onChange={(e) => setS({ ...s, conf: e.target.value })} erro={erros.confirmacao_senha} />
          <Botao className="self-end" onClick={trocarSenha}>Trocar senha</Botao>
        </div>
      </Card>
    </div>
  )
}

function Seguranca() {
  const { f, set, erros, salvar, salvando } = useFormConfig()
  const qc = useQueryClient()
  const { confirmar, sucesso, erro } = useAvisos()
  const sessoes = useQuery({ queryKey: ['sessoes'], queryFn: () => api.get<{ itens: SessaoLogin[] }>('/sessoes').then((r) => r.itens) })
  async function encerrar(s: SessaoLogin) {
    const ok = await confirmar({ titulo: 'Encerrar este acesso?', mensagem: `${s.usuario_nome} precisará entrar de novo neste navegador.`, confirmar: 'Encerrar acesso' })
    if (ok === null) return
    try {
      await api.delete(`/sessoes/${s.id}`)
      qc.invalidateQueries({ queryKey: ['sessoes'] })
      sucesso('Acesso encerrado.')
    } catch (e) {
      erro(mensagemErro(e))
    }
  }
  async function encerrarTodas(s: SessaoLogin) {
    const ok = await confirmar({ titulo: `Desconectar ${s.usuario_nome} de tudo?`, mensagem: 'Todos os acessos dessa pessoa serão encerrados.', confirmar: 'Desconectar' })
    if (ok === null) return
    try {
      await api.post(`/usuarios/${s.usuario_id}/encerrar-sessoes`)
      qc.invalidateQueries({ queryKey: ['sessoes'] })
    } catch (e) {
      erro(mensagemErro(e))
    }
  }
  const colunas: Coluna<SessaoLogin>[] = [
    { chave: 'u', titulo: 'Usuário', render: (s) => <span><span className="block font-semibold text-texto">{s.usuario_nome}</span><span className="text-xs text-texto-3">{NOMES_PERFIL[s.perfil]}</span></span> },
    { chave: 'n', titulo: 'Navegador', render: (s) => <span className="line-clamp-1 max-w-[260px] text-xs" title={s.navegador ?? ''}>{s.navegador ?? '—'}</span>, ocultarCelular: true },
    { chave: 'ip', titulo: 'IP', render: (s) => <span className="tabular">{s.ip ?? '—'}</span>, ocultarCelular: true },
    { chave: 'i', titulo: 'Entrou em', render: (s) => <span className="tabular">{dataHora(s.criada_em)}</span> },
    { chave: 'l', titulo: 'Último uso', render: (s) => <span className="tabular">{dataHora(s.ultimo_uso)}</span> },
    {
      chave: 'a',
      titulo: '',
      alinhar: 'direita',
      render: (s) => (
        <span className="inline-flex gap-1">
          <Botao variante="fantasma" tamanho="sm" icone={<LogOut size={14} />} onClick={() => encerrar(s)}>Encerrar</Botao>
          <Botao variante="fantasma" tamanho="sm" onClick={() => encerrarTodas(s)}>Todos do usuário</Botao>
        </span>
      ),
    },
  ]
  return (
    <div className="flex flex-col gap-4 xl:gap-5">
      {f && (
        <Card>
          <CabecalhoCard titulo="Regras de acesso" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CampoTexto rotulo="Duração do acesso (horas)" inputMode="numeric" value={String(f.duracao_sessao_horas)} onChange={(e) => set('duracao_sessao_horas', num(soDigitos(e.target.value)))} erro={erros.duracao_sessao_horas} ajuda="De 1 a 24." />
            <CampoTexto rotulo="Desconectar sem uso (min)" inputMode="numeric" value={String(f.inatividade_minutos)} onChange={(e) => set('inatividade_minutos', num(soDigitos(e.target.value)))} erro={erros.inatividade_minutos} ajuda="0 desliga, ou de 5 a 240." />
            <CampoTexto rotulo="Tentativas antes de bloquear" inputMode="numeric" value={String(f.tentativas_login)} onChange={(e) => set('tentativas_login', num(soDigitos(e.target.value)))} erro={erros.tentativas_login} ajuda="De 3 a 10." />
            <CampoTexto rotulo="Tempo de bloqueio (min)" inputMode="numeric" value={String(f.tempo_bloqueio_minutos)} onChange={(e) => set('tempo_bloqueio_minutos', num(soDigitos(e.target.value)))} erro={erros.tempo_bloqueio_minutos} ajuda="De 5 a 60." />
          </div>
          <div className="mt-4 flex justify-end">
            <Botao carregando={salvando} onClick={() => salvar(['duracao_sessao_horas', 'inatividade_minutos', 'tentativas_login', 'tempo_bloqueio_minutos'])}>Salvar regras de acesso</Botao>
          </div>
        </Card>
      )}
      <Card>
        <CabecalhoCard titulo="Acessos ativos" descricao="Quem está conectado agora, em qual navegador." />
        <Tabela colunas={colunas} linhas={sessoes.data} carregando={sessoes.isFetching} chaveLinha={(s) => s.id} vazio={{ titulo: 'Nenhum acesso ativo' }} />
      </Card>
    </div>
  )
}

const NOMES_ACAO: Record<string, string> = {
  criar: 'Criou', editar: 'Editou', inativar: 'Inativou', reativar: 'Reativou', excluir: 'Excluiu', login: 'Entrou', login_falhou: 'Errou a senha', bloqueio: 'Bloqueio',
  logout: 'Saiu', trocar_senha: 'Trocou a senha', redefinir_senha: 'Redefiniu senha', abrir: 'Abriu', fechar: 'Fechou', fechar_forcado: 'Fechou (forçado)', sangria: 'Sangria',
  suprimento: 'Suprimento', finalizar: 'Finalizou', cancelar: 'Cancelou', reimprimir: 'Reimprimiu', autorizar: 'Autorizou', autorizacao_negada: 'Autorização negada',
  alterar_preco: 'Alterou preço', ajuste_estoque: 'Ajustou estoque', confirmar: 'Confirmou', alterar_logo: 'Trocou a logo', remover_logo: 'Removeu a logo',
}

function Auditoria() {
  const op = useOperadores()
  const [inicio, setInicio] = useState(hojeIso(-7))
  const [fim, setFim] = useState(hojeIso())
  const [usuario, setUsuario] = useState('')
  const [entidade, setEntidade] = useState('')
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['auditoria', inicio, fim, usuario, entidade, pagina],
    queryFn: () => api.get<Lista<RegistroAuditoria>>('/auditoria', { inicio, fim, usuario_id: usuario, entidade, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })
  const resumo = (o: Record<string, unknown> | null) => (o ? Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ') : '')
  const colunas: Coluna<RegistroAuditoria>[] = [
    { chave: 'd', titulo: 'Quando', render: (a) => <span className="tabular whitespace-nowrap">{dataHora(a.data_hora)}</span> },
    { chave: 'u', titulo: 'Quem', render: (a) => <span>{a.usuario_nome ?? 'Sistema'}{a.autorizador_nome && <span className="block text-xs text-texto-3">autorizado por {a.autorizador_nome}</span>}</span> },
    { chave: 'a', titulo: 'Ação', render: (a) => <Pilula tom={a.acao.includes('falhou') || a.acao.includes('negada') || a.acao === 'cancelar' ? 'erro' : 'neutro'}>{NOMES_ACAO[a.acao] ?? a.acao}</Pilula> },
    { chave: 'e', titulo: 'O quê', render: (a) => a.entidade.replace(/_/g, ' ') },
    {
      chave: 'm',
      titulo: 'Mudanças',
      render: (a) => (
        <span className="line-clamp-2 max-w-[380px] text-xs" title={`${resumo(a.antes)} → ${resumo(a.depois)}`}>
          {a.antes && <span className="text-texto-3 line-through">{resumo(a.antes)}</span>} {resumo(a.depois)}
        </span>
      ),
      ocultarCelular: true,
    },
  ]
  return (
    <Card>
      <BarraFiltros>
        <CampoData className="w-40" rotulo="De" valor={inicio} aoMudar={(v) => { setInicio(v); setPagina(1) }} />
        <CampoData className="w-40" rotulo="Até" valor={fim} aoMudar={(v) => { setFim(v); setPagina(1) }} />
        <Selecao className="w-44" rotulo="Usuário" value={usuario} onChange={(e) => { setUsuario(e.target.value); setPagina(1) }}>
          <option value="">Todos</option>
          {op.data?.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </Selecao>
        <Selecao className="w-44" rotulo="Assunto" value={entidade} onChange={(e) => { setEntidade(e.target.value); setPagina(1) }}>
          <option value="">Todos</option>
          {['venda', 'produto', 'sessao_caixa', 'usuario', 'cliente', 'configuracoes', 'devolucao', 'autorizacao', 'sessao_login', 'entrada', 'inventario', 'empresa'].map((x) => (
            <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>
          ))}
        </Selecao>
      </BarraFiltros>
      <Tabela colunas={colunas} linhas={q.data?.itens} carregando={q.isFetching} chaveLinha={(a) => a.id} vazio={{ titulo: 'Nenhum registro no período', descricao: 'Mude o período ou os filtros.' }} />
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
    </Card>
  )
}

export function Configuracoes() {
  const usuario = useUsuario()
  const adm = pode.configuracoesGerais(usuario.perfil)
  const abas = [
    ...(adm ? [{ valor: 'caixa' as Aba, rotulo: 'Caixa e vendas' }, { valor: 'recibo' as Aba, rotulo: 'Recibo' }] : []),
    { valor: 'aparencia' as Aba, rotulo: 'Aparência' },
    { valor: 'conta' as Aba, rotulo: 'Minha conta' },
    ...(adm ? [{ valor: 'seguranca' as Aba, rotulo: 'Segurança e acessos' }, { valor: 'auditoria' as Aba, rotulo: 'Auditoria' }] : []),
  ]
  const [aba, setAba] = useState<Aba>(adm ? 'caixa' : 'aparencia')
  return (
    <div>
      <CabecalhoPagina titulo="Configurações" descricao="Ajuste o sistema ao jeito da loja. As mudanças valem na hora." />
      <Abas abas={abas} ativa={aba} aoMudar={setAba} />
      {aba === 'caixa' && <CaixaVendas />}
      {aba === 'recibo' && <ConfigRecibo />}
      {aba === 'aparencia' && <Aparencia />}
      {aba === 'conta' && <MinhaConta />}
      {aba === 'seguranca' && <Seguranca />}
      {aba === 'auditoria' && <Auditoria />}
    </div>
  )
}
