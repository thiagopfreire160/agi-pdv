// Impressão de recibos e comprovantes pelo diálogo de impressão do navegador (58 mm, 80 mm, A4).
import type { EmpresaRecibo, Recibo } from '../api/tipos'
import { code128Svg } from './code128'
import { dataHora, dinheiro, mascararCep, mascararCnpj, mascararDocumento, mascararTelefone, NOMES_FORMA, quantidade } from './formatos'

type Papel = '58mm' | '80mm' | 'A4'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

function estilos(papel: Papel) {
  const largura = papel === '58mm' ? '48mm' : papel === '80mm' ? '72mm' : '120mm'
  const pagina = papel === 'A4' ? 'A4' : `${papel} auto`
  const fonte = papel === '58mm' ? '10px' : papel === '80mm' ? '11.5px' : '12.5px'
  return `
  @page { size: ${pagina}; margin: ${papel === 'A4' ? '15mm' : '2mm'}; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Courier New", ui-monospace, monospace; font-size: ${fonte}; color: #000; }
  .via { width: ${largura}; margin: 0 auto; padding: 2mm 0; }
  .via + .via { page-break-before: always; }
  .c { text-align: center; } .d { text-align: right; } .b { font-weight: bold; }
  .grande { font-size: 1.35em; font-weight: bold; }
  .logo { display: block; margin: 0 auto 2mm; max-width: 60%; max-height: 22mm; filter: grayscale(1); }
  hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
  .l { display: flex; justify-content: space-between; gap: 2mm; }
  .l span:first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .aviso { border: 1px solid #000; padding: 1mm; margin: 1.5mm 0; text-align: center; font-weight: bold; }
  .marca { border: 2px solid #000; padding: 1mm; margin: 1.5mm 0; text-align: center; font-weight: bold; font-size: 1.2em; letter-spacing: 1px; }
  .barras { text-align: center; margin-top: 2mm; }
  .assin { margin-top: 10mm; border-top: 1px solid #000; text-align: center; padding-top: 1mm; }
  .peq { font-size: 0.88em; }
  `
}

function cabecalho(e: EmpresaRecibo, mostrarLogo: boolean) {
  const end = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ')
  const cid = [e.bairro, e.cidade && e.uf ? `${e.cidade}/${e.uf}` : e.cidade].filter(Boolean).join(' - ')
  const tel = [e.telefone && mascararTelefone(e.telefone), e.whatsapp && `WhatsApp ${mascararTelefone(e.whatsapp)}`].filter(Boolean).join(' · ')
  return `
    ${mostrarLogo && e.tem_logo && e.logo_url ? `<img class="logo" src="${esc(e.logo_url)}" alt="">` : ''}
    <div class="c b grande">${esc(e.nome_fantasia)}</div>
    ${e.razao_social ? `<div class="c">${esc(e.razao_social)}</div>` : ''}
    <div class="c">CNPJ ${esc(mascararCnpj(e.cnpj))}</div>
    ${end ? `<div class="c peq">${esc(end)}</div>` : ''}
    ${cid ? `<div class="c peq">${esc(cid)}${e.cep ? ` · CEP ${esc(mascararCep(e.cep))}` : ''}</div>` : ''}
    ${tel ? `<div class="c peq">${esc(tel)}</div>` : ''}
  `
}

const linha = (a: string, b: string, cls = '') => `<div class="l ${cls}"><span>${a}</span><span>${b}</span></div>`

/** Documento HTML completo (usado na impressão e na pré-visualização). */
export function documentoImpressao(corpo: string, papel: Papel, titulo = 'Comprovante', previa = false) {
  const extra = previa ? 'body{background:#fff;padding:8px 0} .via{box-shadow:none}' : ''
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><base href="${location.origin}/"><style>${estilos(papel)}${extra}</style></head><body>${corpo}</body></html>`
}

/** Imprime HTML num iframe oculto e abre o diálogo de impressão. */
export function imprimirHtml(corpo: string, papel: Papel, titulo = 'Comprovante') {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write(documentoImpressao(corpo, papel, titulo))
  doc.close()
  const imprimir = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => iframe.remove(), 60_000)
    }
  }
  const imgs = Array.from(doc.images)
  if (imgs.length === 0) setTimeout(imprimir, 50)
  else {
    let faltam = imgs.length
    const pronto = () => {
      faltam -= 1
      if (faltam <= 0) imprimir()
    }
    imgs.forEach((im) => (im.complete ? pronto() : ((im.onload = pronto), (im.onerror = pronto))))
  }
}

/** Monta o HTML do recibo da venda (seção 5.12). */
export function htmlRecibo(r: Recibo, papelForcado?: Papel): { html: string; papel: Papel } {
  const papel = papelForcado ?? r.configuracao.papel_recibo
  const v = r.venda
  const itens = v.itens
    .map(
      (i) => `
      <div>${esc(i.descricao)}</div>
      ${linha(`&nbsp;&nbsp;${esc(quantidade(i.quantidade, i.unidade))} ${esc(i.unidade)} x ${esc(dinheiro(i.preco_unitario))}`, esc(dinheiro(i.total_bruto)))}
      ${i.desconto > 0 ? linha('&nbsp;&nbsp;Desconto no item', '-' + esc(dinheiro(i.desconto)), 'peq') : ''}`,
    )
    .join('')
  const pagamentos = v.pagamentos
    .map((p) =>
      linha(
        `${esc(NOMES_FORMA[p.forma] ?? p.forma)}${p.forma === 'credito' && p.parcelas > 1 ? ` ${p.parcelas}x` : ''}${p.codigo_vale ? ` ${esc(p.codigo_vale)}` : ''}`,
        esc(dinheiro(p.valor)),
      ),
    )
    .join('')
  const doc = v.documento_recibo || v.cliente_documento
  const via = `
    <div class="via">
      ${cabecalho(r.empresa, r.configuracao.mostrar_logo_recibo)}
      <div class="aviso">${esc(r.aviso_nao_fiscal || 'NÃO É DOCUMENTO FISCAL')}</div>
      ${r.cancelada ? '<div class="marca">CANCELADA</div>' : ''}
      ${r.segunda_via ? '<div class="marca">2ª VIA</div>' : ''}
      ${r.exemplo ? '<div class="marca">RECIBO DE TESTE</div>' : ''}
      ${linha(`Venda <b>${esc(v.numero)}</b>`, esc(dataHora(v.finalizada_em)))}
      ${linha(`Operador: ${esc(v.operador_nome_curto)}`, v.terminal ? esc(v.terminal) : '')}
      ${v.cliente_nome ? `<div>Cliente: ${esc(v.cliente_nome)}</div>` : ''}
      ${doc ? `<div>CPF/CNPJ: ${esc(mascararDocumento(doc))}</div>` : ''}
      <hr>
      ${itens}
      <hr>
      ${linha('Subtotal', esc(dinheiro(v.subtotal)))}
      ${v.desconto_venda > 0 ? linha('Desconto na venda', '-' + esc(dinheiro(v.desconto_venda))) : ''}
      ${v.desconto_total > 0 ? linha('Desconto total', '-' + esc(dinheiro(v.desconto_total))) : ''}
      ${linha('TOTAL', esc(dinheiro(v.total)), 'grande')}
      <hr>
      ${pagamentos}
      ${v.troco > 0 ? linha('Troco', esc(dinheiro(v.troco)), 'b') : ''}
      ${r.empresa.mensagem_rodape ? `<hr><div class="c peq">${esc(r.empresa.mensagem_rodape)}</div>` : ''}
      <div class="barras">${code128Svg(String(v.codigo_barras_venda ?? v.numero), 44, 1.6)}<div class="peq">${esc(v.codigo_barras_venda ?? v.numero)}</div></div>
    </div>`
  const vias = Math.max(1, Math.min(2, r.configuracao.vias_recibo || 1))
  return { html: Array.from({ length: vias }, () => via).join(''), papel }
}

export function imprimirRecibo(r: Recibo) {
  const { html, papel } = htmlRecibo(r)
  imprimirHtml(html, papel, `Recibo venda ${r.venda.numero}`)
}

/** Comprovante simples com o mesmo cabeçalho (abertura, sangria, suprimento, fechamento, vale-troca). */
export function imprimirComprovante(opcoes: {
  empresa: EmpresaRecibo
  papel: Papel
  titulo: string
  linhas: [string, string][]
  destaque?: [string, string]
  observacao?: string
  assinatura?: boolean
  codigoBarras?: string
}) {
  const { empresa, papel, titulo, linhas, destaque, observacao, assinatura, codigoBarras } = opcoes
  const html = `
    <div class="via">
      ${cabecalho(empresa, false)}
      <hr>
      <div class="c b grande">${esc(titulo)}</div>
      <hr>
      ${linhas.map(([a, b]) => linha(esc(a), esc(b))).join('')}
      ${destaque ? `<hr>${linha(esc(destaque[0]), esc(destaque[1]), 'grande')}` : ''}
      ${observacao ? `<hr><div class="peq">${esc(observacao)}</div>` : ''}
      ${codigoBarras ? `<div class="barras">${code128Svg(codigoBarras, 44, 1.6)}<div class="b">${esc(codigoBarras)}</div></div>` : ''}
      ${assinatura ? '<div class="assin">Assinatura</div>' : ''}
      <div class="c peq" style="margin-top:2mm">NÃO É DOCUMENTO FISCAL</div>
    </div>`
  imprimirHtml(html, papel, titulo)
}
