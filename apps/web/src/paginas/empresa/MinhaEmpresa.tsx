import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Empresa, Recibo } from '../../api/tipos'
import { useUsuario } from '../../ganchos/useSessao'
import { pode } from '../../utils/permissoes'
import { CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card, CabecalhoCard } from '../../componentes/ui/Card'
import { AreaTexto, CampoMascara, CampoTexto, Selecao } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { EsqueletoLinhas } from '../../componentes/ui/Estados'
import { CamposEndereco, enderecoDe, enderecoParaApi, type Endereco } from '../../componentes/ui/CamposEndereco'
import { useAvisos } from '../../componentes/ui/Avisos'
import { cnpjValido, emailValido, soDigitos } from '../../utils/formatos'
import { documentoImpressao, htmlRecibo } from '../../utils/impressao'

const FUSOS = ['America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife', 'America/Belem', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Rio_Branco', 'America/Noronha']

interface Form {
  nome_fantasia: string; razao_social: string; cnpj: string; inscricao_estadual: string; telefone: string; whatsapp: string; email: string; site: string
  mensagem_rodape: string; fuso_horario: string; endereco: Endereco
}

function deEmpresa(e: Empresa): Form {
  return {
    nome_fantasia: e.nome_fantasia, razao_social: e.razao_social ?? '', cnpj: e.cnpj, inscricao_estadual: e.inscricao_estadual ?? '', telefone: e.telefone ?? '',
    whatsapp: e.whatsapp ?? '', email: e.email ?? '', site: e.site ?? '', mensagem_rodape: e.mensagem_rodape ?? '', fuso_horario: e.fuso_horario, endereco: enderecoDe(e),
  }
}

export function MinhaEmpresa() {
  const usuario = useUsuario()
  const editar = pode.editarEmpresa(usuario.perfil)
  const qc = useQueryClient()
  const { sucesso, erro } = useAvisos()
  const q = useQuery({ queryKey: ['empresa'], queryFn: () => api.get<Empresa>('/empresa') })
  const exemplo = useQuery({ queryKey: ['recibo-teste'], queryFn: () => api.get<Recibo>('/configuracoes/recibo-teste') })
  const [f, setF] = useState<Form | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const e = q.data

  useEffect(() => {
    if (e) setF(deEmpresa(e))
  }, [e])

  const previa = useMemo(() => {
    if (!exemplo.data || !f || !e) return ''
    const r: Recibo = {
      ...exemplo.data,
      empresa: {
        ...exemplo.data.empresa,
        nome_fantasia: f.nome_fantasia || 'Nome da loja', razao_social: f.razao_social || null, cnpj: soDigitos(f.cnpj), telefone: soDigitos(f.telefone) || null,
        whatsapp: soDigitos(f.whatsapp) || null, mensagem_rodape: f.mensagem_rodape || null, tem_logo: e.tem_logo, logo_url: e.tem_logo ? `/api/empresa/logo?v=${e.versao}` : null,
        ...enderecoParaApi(f.endereco),
      },
      configuracao: { ...exemplo.data.configuracao, vias_recibo: 1 },
    }
    const { html, papel } = htmlRecibo(r, '80mm')
    return documentoImpressao(html, papel, 'Prévia', true)
  }, [exemplo.data, f, e])

  if (!e || !f) return (
    <div>
      <CabecalhoPagina titulo="Minha empresa" />
      <Card><EsqueletoLinhas /></Card>
    </div>
  )

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => (x ? { ...x, [k]: v } : x))

  async function salvar() {
    if (!f || !e) return
    const er: Record<string, string> = {}
    if (f.nome_fantasia.trim().length < 2) er.nome_fantasia = 'Informe o nome da loja.'
    if (!cnpjValido(f.cnpj)) er.cnpj = 'Confira o CNPJ: os dígitos não batem.'
    if (f.email && !emailValido(f.email)) er.email = 'Confira o e-mail.'
    if (f.whatsapp && soDigitos(f.whatsapp).length !== 11) er.whatsapp = 'O WhatsApp tem 11 números com DDD.'
    if (f.endereco.cidade && !f.endereco.uf) er.uf = 'Escolha a UF da cidade.'
    setErros(er)
    if (Object.keys(er).length) return
    setSalvando(true)
    try {
      await api.put<Empresa>('/empresa', {
        versao: e.versao, nome_fantasia: f.nome_fantasia.trim(), razao_social: f.razao_social.trim() || null, cnpj: soDigitos(f.cnpj),
        inscricao_estadual: f.inscricao_estadual.trim() || null, telefone: soDigitos(f.telefone) || null, whatsapp: soDigitos(f.whatsapp) || null,
        email: f.email.trim() || null, site: f.site.trim() || null, mensagem_rodape: f.mensagem_rodape.trim() || null, fuso_horario: f.fuso_horario,
        ...enderecoParaApi(f.endereco),
      })
      sucesso('Dados da empresa salvos.')
      qc.invalidateQueries({ queryKey: ['empresa'] })
      qc.invalidateQueries({ queryKey: ['recibo-teste'] })
      qc.invalidateQueries({ queryKey: ['eu'] })
    } catch (er2) {
      if (er2 instanceof ErroApi && er2.campos) setErros(er2.campos)
      else erro(er2 instanceof ErroApi && er2.codigo === 'CONFLITO_VERSAO' ? 'Outra pessoa salvou antes. Recarregue a página.' : mensagemErro(er2))
    } finally {
      setSalvando(false)
    }
  }

  async function enviarLogo(file: File) {
    if (!['image/png', 'image/jpeg'].includes(file.type)) return erro('Use uma imagem PNG ou JPG.')
    if (file.size > 1024 * 1024) return erro('A imagem passa de 1 MB. Diminua o tamanho e tente de novo.')
    setEnviandoLogo(true)
    try {
      const dataUrl = await new Promise<string>((ok, falha) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result))
        r.onerror = () => falha(new Error('Não foi possível ler o arquivo.'))
        r.readAsDataURL(file)
      })
      await api.put('/empresa/logo', { imagem: dataUrl })
      sucesso('Logo atualizada.')
      qc.invalidateQueries({ queryKey: ['empresa'] })
      qc.invalidateQueries({ queryKey: ['recibo-teste'] })
    } catch (er2) {
      erro(mensagemErro(er2))
    } finally {
      setEnviandoLogo(false)
      if (arquivo.current) arquivo.current.value = ''
    }
  }

  async function removerLogo() {
    try {
      await api.delete('/empresa/logo')
      qc.invalidateQueries({ queryKey: ['empresa'] })
      qc.invalidateQueries({ queryKey: ['recibo-teste'] })
    } catch (er2) {
      erro(mensagemErro(er2))
    }
  }

  const so = !editar

  return (
    <div>
      <CabecalhoPagina
        titulo="Minha empresa"
        descricao={editar ? 'Os dados que aparecem no recibo e nos relatórios.' : 'Só o administrador pode alterar estes dados.'}
        acoes={editar && <Botao carregando={salvando} onClick={salvar}>Salvar dados</Botao>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_360px] xl:gap-5">
        <div className="flex flex-col gap-4 xl:gap-5">
          <Card>
            <CabecalhoCard titulo="Identificação" />
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto rotulo="Nome fantasia" obrigatorio maxLength={80} value={f.nome_fantasia} onChange={(x) => set('nome_fantasia', x.target.value)} erro={erros.nome_fantasia} disabled={so} />
              <CampoTexto rotulo="Razão social" maxLength={120} value={f.razao_social} onChange={(x) => set('razao_social', x.target.value)} disabled={so} />
              <CampoMascara rotulo="CNPJ" obrigatorio tipo="cnpj" valor={f.cnpj} aoMudar={(v) => set('cnpj', v)} erro={erros.cnpj} disabled={so} />
              <CampoTexto rotulo="Inscrição estadual" maxLength={20} placeholder="Ou ISENTO" value={f.inscricao_estadual} onChange={(x) => set('inscricao_estadual', x.target.value)} erro={erros.inscricao_estadual} disabled={so} />
            </div>
          </Card>
          <Card>
            <CabecalhoCard titulo="Contato" />
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoMascara rotulo="Telefone" tipo="telefone" valor={f.telefone} aoMudar={(v) => set('telefone', v)} erro={erros.telefone} disabled={so} />
              <CampoMascara rotulo="WhatsApp" tipo="telefone" valor={f.whatsapp} aoMudar={(v) => set('whatsapp', v)} erro={erros.whatsapp} disabled={so} />
              <CampoTexto rotulo="E-mail" type="email" maxLength={120} value={f.email} onChange={(x) => set('email', x.target.value)} erro={erros.email} disabled={so} />
              <CampoTexto rotulo="Site ou rede social" maxLength={120} value={f.site} onChange={(x) => set('site', x.target.value)} disabled={so} />
            </div>
          </Card>
          <Card>
            <CabecalhoCard titulo="Endereço" descricao="Digite o CEP para preencher o resto." />
            <CamposEndereco valor={f.endereco} aoMudar={(v) => set('endereco', v)} erros={erros} desabilitado={so} />
          </Card>
          <Card>
            <CabecalhoCard titulo="Recibo" />
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-borda bg-superficie-2">
                  {e.tem_logo ? <img src={`/api/empresa/logo?v=${e.versao}`} alt="Logo da empresa" className="max-h-full max-w-full object-contain" /> : <ImagePlus size={26} className="text-texto-3" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-texto">Logo da loja</p>
                  <p className="text-xs text-texto-3">PNG ou JPG até 1 MB. Sai em preto e branco na impressora térmica.</p>
                  {editar && (
                    <div className="mt-2 flex gap-2">
                      <input ref={arquivo} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(x) => x.target.files?.[0] && enviarLogo(x.target.files[0])} />
                      <Botao variante="contorno" tamanho="sm" icone={<ImagePlus size={15} />} carregando={enviandoLogo} onClick={() => arquivo.current?.click()}>
                        {e.tem_logo ? 'Trocar logo' : 'Enviar logo'}
                      </Botao>
                      {e.tem_logo && (
                        <Botao variante="fantasma" tamanho="sm" icone={<Trash2 size={15} />} onClick={removerLogo}>Remover</Botao>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <AreaTexto rotulo="Mensagem no rodapé do recibo" maxLength={200} placeholder="Ex.: Trocas em até 30 dias com este recibo." value={f.mensagem_rodape} onChange={(x) => set('mensagem_rodape', x.target.value)} disabled={so} />
              <Selecao rotulo="Fuso horário" value={f.fuso_horario} onChange={(x) => set('fuso_horario', x.target.value)} disabled={so} ajuda="Define a data de hoje no caixa, no Dashboard e nos relatórios.">
                {[...new Set([f.fuso_horario, ...FUSOS])].map((z) => (
                  <option key={z} value={z}>{z.replace('America/', '').replace('_', ' ')}</option>
                ))}
              </Selecao>
            </div>
          </Card>
        </div>
        <Card className="h-fit xl:sticky xl:top-3">
          <CabecalhoCard titulo="Prévia do recibo" descricao="Venda de exemplo, papel 80 mm." />
          <div className="rounded-2xl bg-superficie-2 p-3">
            {previa ? <iframe title="Prévia do recibo" srcDoc={previa} className="h-[560px] w-full rounded-xl bg-white" /> : <EsqueletoLinhas />}
          </div>
        </Card>
      </div>
    </div>
  )
}
