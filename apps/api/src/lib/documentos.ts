/** Validação de documentos e códigos brasileiros. */

export const somenteDigitos = (v: string) => v.replace(/\D/g, '');

export function cpfValido(valor: string): boolean {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

export function cnpjValido(valor: string): boolean {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((s, d, i) => s + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

/** CPF (11) ou CNPJ (14), decidido pelo tamanho. */
export function documentoValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
}

export function tipoPessoa(documento: string | null | undefined): 'fisica' | 'juridica' | null {
  if (!documento) return null;
  return documento.length === 14 ? 'juridica' : 'fisica';
}

/** Dígito verificador GTIN (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function codigoBarrasValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo) || ![8, 12, 13, 14].includes(codigo.length)) return false;
  const digitos = codigo.split('').map(Number);
  const verificador = digitos.pop()!;
  let soma = 0;
  digitos.reverse().forEach((d, i) => {
    soma += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (soma % 10)) % 10 === verificador;
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
