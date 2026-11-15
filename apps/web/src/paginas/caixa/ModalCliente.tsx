import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, UserPlus } from 'lucide-react'
import { Modal } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { CampoMascara, CampoTexto } from '../../componentes/ui/Campo'
import { Segmentado } from '../../componentes/ui/Campo'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Cliente, Lista } from '../../api/tipos'
import { useAtraso } from '../../ganchos/useAtraso'
import { dinheiro, erroDocumento, mascararDocumento, mascararTelefone } from '../../utils/formatos'
import { EstadoVazio } from '../../componentes/ui/Estados'

type Escolha = { cliente: { id: string; nome: string; documento: string | null } | null; documento: string | null }

/** Identificar cliente (F3): busca, cadastro rápido ou só CPF/CNPJ no recibo. */
export function ModalCliente({ aberto, aoFechar, aoEscolher, atual }: { aberto: boolean; aoFechar: () => void; aoEscolher: (e: Escolha) => void; atual: Escolha }) {
  const [modo, setModo] = useState<'buscar' | 'novo' | 'documento'>('buscar')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [novo, setNovo] = useState({ nome: '', documento: '', celular: '' })
  const [doc, setDoc] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const atraso = useAtraso(q.trim(), 250)

  useEffect(() => {
    if (aberto) {
      setModo('buscar')
      setQ('')
      setNovo({ nome: '', documento: '', celular: '' })
      setDoc(atual.documento ?? '')
      setErros({})
    }
  }, [aberto, atual.documento])

  const r = useQuery({
    queryKey: ['clientes-caixa', atraso],
    queryFn: () => api.get<Lista<Cliente>>('/clientes', { busca: atraso, por_pagina: 8 }).then((x) => x.itens),
    enabled: aberto && modo === 'buscar' && atraso.length >= 2,
  })
  const itens = r.data ?? []
  useEffect(() => setSel(0), [atraso])

  const escolher = (c: Cliente) => aoEscolher({ cliente: { id: c.id, nome: c.nome, documento: c.documento }, documento: null })

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (novo.nome.trim().length < 2) er.nome = 'Informe o nome do cliente.'
    const d = erroDocumento(novo.documento)
    if (d) er.documento = d
    setErros(er)
    if (Object.keys(er).length) return
    setEnviando(true)
    try {
      const c = await api.post<Cliente>('/clientes', { nome: novo.nome.trim(), documento: novo.documento || null, celular: novo.celular || null })
      escolher(c)
    } catch (e) {
      if (e instanceof ErroApi && e.campos) {
        const existente = e.dados.cliente_existente as { nome?: string } | undefined
        setErros({ ...e.campos, ...(existente?.nome ? { documento: `Já cadastrado para ${existente.nome}. Busque pelo nome.` } : {}) })
      } else setErros({ nome: mensagemErro(e) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Cliente da venda" descricao="Opcional. Identifique o cliente ou só informe o CPF/CNPJ para o recibo." largura="md">
      <div className="mb-4">
        <Segmentado
          valor={modo}
          aoMudar={setModo}
          opcoes={[
            { valor: 'buscar', rotulo: 'Buscar' },
            { valor: 'novo', rotulo: 'Cadastro rápido' },
            { valor: 'documento', rotulo: 'Só CPF/CNPJ' },
          ]}
        />
      </div>
      {modo === 'buscar' && (
        <>
          <CampoTexto
            data-autofoco
            icone={<Search size={17} />}
            placeholder="Nome, CPF/CNPJ ou celular"
            aria-label="Buscar cliente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(itens.length - 1, s + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
              if (e.key === 'Enter' && itens[sel]) { e.preventDefault(); escolher(itens[sel]) }
            }}
          />
          <div className="mt-3 min-h-[200px]">
            {atraso.length < 2 ? (
              <EstadoVazio compacto titulo="Digite pelo menos 2 letras" />
            ) : itens.length === 0 && !r.isLoading ? (
              <EstadoVazio
                compacto
                titulo="Nenhum cliente encontrado"
                acao={
                  <Botao variante="contorno" tamanho="sm" icone={<UserPlus size={16} />} onClick={() => { setModo('novo'); setNovo({ ...novo, nome: q }) }}>
                    Cadastrar agora
                  </Botao>
                }
              />
            ) : (
              <ul className="flex flex-col gap-1">
                {itens.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => escolher(c)}
                      onMouseEnter={() => setSel(i)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left ${i === sel ? 'bg-floresta-50 dark:bg-superficie-2' : 'hover:bg-superficie-2'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-texto">{c.nome}</span>
                        <span className="tabular text-xs text-texto-3">
                          {[c.documento && mascararDocumento(c.documento), c.celular && mascararTelefone(c.celular)].filter(Boolean).join(' · ') || 'Sem documento'}
                        </span>
                      </span>
                      {c.saldo_credito > 0 && <span className="tabular text-xs font-semibold text-ok-fg">Vale {dinheiro(c.saldo_credito)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      {modo === 'novo' && (
        <form onSubmit={cadastrar} className="flex flex-col gap-4">
          <CampoTexto rotulo="Nome" obrigatorio data-autofoco value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} erro={erros.nome} maxLength={120} />
          <CampoMascara rotulo="CPF ou CNPJ" tipo="documento" valor={novo.documento} aoMudar={(v) => setNovo({ ...novo, documento: v })} erro={erros.documento} />
          <CampoMascara rotulo="Celular" tipo="telefone" valor={novo.celular} aoMudar={(v) => setNovo({ ...novo, celular: v })} erro={erros.celular} />
          <Botao type="submit" carregando={enviando} icone={<UserPlus size={18} />}>
            Cadastrar e usar na venda
          </Botao>
        </form>
      )}
      {modo === 'documento' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const er = erroDocumento(doc)
            if (er || !doc) {
              setErros({ doc: er ?? 'Informe o CPF ou CNPJ.' })
              return
            }
            aoEscolher({ cliente: null, documento: doc })
          }}
          className="flex flex-col gap-4"
        >
          <CampoMascara rotulo="CPF ou CNPJ para o recibo" tipo="documento" data-autofoco valor={doc} aoMudar={setDoc} erro={erros.doc} />
          <Botao type="submit">Usar no recibo</Botao>
        </form>
      )}
      {(atual.cliente || atual.documento) && (
        <div className="mt-5 border-t border-borda pt-4">
          <Botao variante="fantasma" onClick={() => aoEscolher({ cliente: null, documento: null })}>
            Tirar cliente da venda
          </Botao>
        </div>
      )}
    </Modal>
  )
}
