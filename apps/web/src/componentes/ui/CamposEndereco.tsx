import { useState } from 'react'
import { api } from '../../api/cliente'
import { soDigitos, UFS } from '../../utils/formatos'
import { CampoMascara, CampoTexto, Selecao } from './Campo'

export interface Endereco {
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export const enderecoVazio: Endereco = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' }

export function enderecoDe(o: Partial<Record<keyof Endereco, string | null>>): Endereco {
  return {
    cep: o.cep ?? '', logradouro: o.logradouro ?? '', numero: o.numero ?? '', complemento: o.complemento ?? '',
    bairro: o.bairro ?? '', cidade: o.cidade ?? '', uf: o.uf ?? '',
  }
}

/** Endereço com busca opcional pelo CEP (se o serviço não responder, preenche à mão). */
export function CamposEndereco({ valor, aoMudar, erros = {}, desabilitado }: { valor: Endereco; aoMudar: (e: Endereco) => void; erros?: Record<string, string>; desabilitado?: boolean }) {
  const [buscando, setBuscando] = useState(false)
  const set = (k: keyof Endereco, v: string) => aoMudar({ ...valor, [k]: v })

  async function buscarCep(cep: string) {
    if (soDigitos(cep).length !== 8) return
    setBuscando(true)
    try {
      const r = await api.get<{ logradouro: string; bairro: string; cidade: string; uf: string }>(`/cep/${soDigitos(cep)}`)
      aoMudar({ ...valor, cep, logradouro: r.logradouro || valor.logradouro, bairro: r.bairro || valor.bairro, cidade: r.cidade || valor.cidade, uf: r.uf || valor.uf })
    } catch {
      /* serviço de CEP fora: segue preenchendo à mão */
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="grid grid-cols-6 gap-4">
      <CampoMascara
        className="col-span-3 sm:col-span-2"
        rotulo="CEP"
        tipo="cep"
        valor={valor.cep}
        aoMudar={(v) => {
          set('cep', v)
          if (v.length === 8) buscarCep(v)
        }}
        erro={erros.cep}
        ajuda={buscando ? 'Buscando endereço...' : undefined}
        disabled={desabilitado}
      />
      <CampoTexto className="col-span-6 sm:col-span-4" rotulo="Logradouro" maxLength={120} value={valor.logradouro} onChange={(e) => set('logradouro', e.target.value)} erro={erros.logradouro} disabled={desabilitado} />
      <CampoTexto className="col-span-2" rotulo="Número" maxLength={10} placeholder="S/N" value={valor.numero} onChange={(e) => set('numero', e.target.value)} erro={erros.numero} disabled={desabilitado} />
      <CampoTexto className="col-span-4" rotulo="Complemento" maxLength={60} value={valor.complemento} onChange={(e) => set('complemento', e.target.value)} disabled={desabilitado} />
      <CampoTexto className="col-span-6 sm:col-span-2" rotulo="Bairro" maxLength={60} value={valor.bairro} onChange={(e) => set('bairro', e.target.value)} disabled={desabilitado} />
      <CampoTexto className="col-span-4 sm:col-span-3" rotulo="Cidade" maxLength={60} value={valor.cidade} onChange={(e) => set('cidade', e.target.value)} erro={erros.cidade} disabled={desabilitado} />
      <Selecao className="col-span-2 sm:col-span-1" rotulo="UF" value={valor.uf} onChange={(e) => set('uf', e.target.value)} erro={erros.uf} disabled={desabilitado}>
        <option value="">—</option>
        {UFS.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </Selecao>
    </div>
  )
}

/** Converte endereço do formulário para o corpo da API (vazio vira null). */
export function enderecoParaApi(e: Endereco) {
  return {
    cep: soDigitos(e.cep) || null,
    logradouro: e.logradouro.trim() || null,
    numero: e.numero.trim() || null,
    complemento: e.complemento.trim() || null,
    bairro: e.bairro.trim() || null,
    cidade: e.cidade.trim() || null,
    uf: e.uf || null,
  }
}
