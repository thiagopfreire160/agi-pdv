// Cliente HTTP da API. Cookie de sessão vai junto (mesma origem via proxy do Vite).
// Toda requisição que altera dados envia o cabeçalho X-Agi-Csrf: 1.

export class ErroApi extends Error {
  status: number
  codigo?: string
  campos?: Record<string, string>
  dados: Record<string, unknown>
  constructor(status: number, corpo: Record<string, unknown>) {
    super(typeof corpo.erro === 'string' ? corpo.erro : mensagemPadrao(status))
    this.status = status
    this.codigo = typeof corpo.codigo === 'string' ? corpo.codigo : undefined
    this.campos = (corpo.campos as Record<string, string>) ?? undefined
    this.dados = corpo
  }
}

function mensagemPadrao(status: number) {
  if (status === 0) return 'Sem conexão com o servidor. Confira a rede e tente de novo.'
  if (status >= 500) return 'O servidor não respondeu como esperado. Tente de novo em instantes.'
  if (status === 404) return 'Não encontrado. Recarregue a página e tente de novo.'
  return 'Não foi possível concluir. Tente de novo.'
}

type Ouvinte = (erro: ErroApi) => void
const ouvintesSessao = new Set<Ouvinte>()
/** Avisado quando a sessão cai (401) ou a troca de senha é exigida. */
export function aoPerderSessao(fn: Ouvinte) {
  ouvintesSessao.add(fn)
  return () => { ouvintesSessao.delete(fn) }
}

type Parametros = Record<string, string | number | boolean | null | undefined>

export function montarQuery(params?: Parametros) {
  if (!params) return ''
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

async function requisitar<T>(metodo: string, caminho: string, corpo?: unknown, params?: Parametros): Promise<T> {
  const altera = metodo !== 'GET'
  let resp: Response
  try {
    resp = await fetch(`/api${caminho}${montarQuery(params)}`, {
      method: metodo,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(altera ? { 'X-Agi-Csrf': '1', 'Content-Type': 'application/json' } : {}),
      },
      body: altera ? JSON.stringify(corpo ?? {}) : undefined,
    })
  } catch {
    throw new ErroApi(0, {})
  }
  const tipo = resp.headers.get('content-type') ?? ''
  const json = tipo.includes('application/json') ? await resp.json().catch(() => ({})) : {}
  if (!resp.ok) {
    const erro = new ErroApi(resp.status, json as Record<string, unknown>)
    const ehLogin = caminho === '/auth/entrar' || caminho === '/autorizacoes'
    if (!ehLogin && (erro.codigo === 'NAO_AUTENTICADO' || erro.codigo === 'SESSAO_EXPIRADA' || erro.codigo === 'TROCA_SENHA_OBRIGATORIA')) {
      ouvintesSessao.forEach((fn) => fn(erro))
    }
    throw erro
  }
  return json as T
}

export const api = {
  get: <T>(caminho: string, params?: Parametros) => requisitar<T>('GET', caminho, undefined, params),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, corpo),
  put: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PUT', caminho, corpo),
  delete: <T>(caminho: string) => requisitar<T>('DELETE', caminho),
}

/** Baixa um arquivo (CSV) da API com o cookie de sessão. */
export async function baixarArquivo(caminho: string, params: Parametros, nomePadrao: string) {
  const resp = await fetch(`/api${caminho}${montarQuery(params)}`, { credentials: 'include' })
  if (!resp.ok) {
    const json = await resp.json().catch(() => ({}))
    throw new ErroApi(resp.status, json)
  }
  const disp = resp.headers.get('content-disposition') ?? ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disp)
  const nome = m ? decodeURIComponent(m[1]) : nomePadrao
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Mensagem amigável para qualquer erro. */
export function mensagemErro(e: unknown): string {
  if (e instanceof ErroApi) return e.message
  if (e instanceof Error) return e.message
  return 'Não foi possível concluir. Tente de novo.'
}
