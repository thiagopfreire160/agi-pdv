import type { FastifyRequest } from 'fastify';
import { semPermissao, ErroApp } from './erros.js';
import type { Ator } from './auditoria.js';

export type Perfil = 'administrador' | 'gerente' | 'caixa';

export interface UsuarioLogado {
  id: string;
  nome: string;
  email: string;
  cpf: string | null;
  telefone: string | null;
  perfil: Perfil;
  deve_trocar_senha: boolean;
  tema: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioLogado;
    sessaoLoginId?: string;
  }
  interface FastifyContextConfig {
    /** Rota acessível sem login. */
    publica?: boolean;
    /** Perfis autorizados (padrão: qualquer usuário logado). */
    perfis?: Perfil[];
    /** Acessível mesmo com troca de senha pendente. */
    permitirTrocaPendente?: boolean;
    /** Acessível antes do primeiro acesso. */
    antesDoPrimeiroAcesso?: boolean;
  }
}

export function usuario(req: FastifyRequest): UsuarioLogado {
  if (!req.usuario) throw new ErroApp(401, 'Entre no sistema para continuar.', { codigo: 'NAO_AUTENTICADO' });
  return req.usuario;
}

export const ator = (req: FastifyRequest): Ator => ({ usuarioId: req.usuario?.id ?? null, ip: req.ip });

export const ehSupervisor = (perfil: Perfil) => perfil === 'administrador' || perfil === 'gerente';

export function exigirPerfil(req: FastifyRequest, ...perfis: Perfil[]) {
  if (!perfis.includes(usuario(req).perfil)) throw semPermissao();
}

export const SUPERVISORES: Perfil[] = ['administrador', 'gerente'];
export const SO_ADMIN: Perfil[] = ['administrador'];
export const TODOS: Perfil[] = ['administrador', 'gerente', 'caixa'];
