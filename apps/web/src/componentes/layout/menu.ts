import {
  ArrowLeftRight, BarChart3, Boxes, Building2, CircleHelp, LayoutDashboard, LogOut, Package, ReceiptText, Settings, ShoppingCart, Truck, UserCog, Users,
  type LucideIcon,
} from 'lucide-react'
import type { Perfil } from '../../api/tipos'
import { pode } from '../../utils/permissoes'

export interface ItemMenu {
  rotulo: string
  caminho: string
  icone: LucideIcon
  permitido: (p: Perfil) => boolean
}

const todos = () => true

export const MENU: ItemMenu[] = [
  { rotulo: 'Dashboard', caminho: '/dashboard', icone: LayoutDashboard, permitido: pode.verDashboard },
  { rotulo: 'Caixa', caminho: '/caixa', icone: ShoppingCart, permitido: todos },
  { rotulo: 'Vendas', caminho: '/vendas', icone: ReceiptText, permitido: todos },
  { rotulo: 'Trocas', caminho: '/trocas', icone: ArrowLeftRight, permitido: todos },
  { rotulo: 'Produtos', caminho: '/produtos', icone: Package, permitido: todos },
  { rotulo: 'Estoque', caminho: '/estoque', icone: Boxes, permitido: pode.estoque },
  { rotulo: 'Clientes', caminho: '/clientes', icone: Users, permitido: todos },
  { rotulo: 'Fornecedores', caminho: '/fornecedores', icone: Truck, permitido: pode.fornecedores },
  { rotulo: 'Relatórios', caminho: '/relatorios', icone: BarChart3, permitido: pode.relatorios },
]

export const GERAL: ItemMenu[] = [
  { rotulo: 'Usuários', caminho: '/usuarios', icone: UserCog, permitido: pode.gerirUsuarios },
  { rotulo: 'Minha empresa', caminho: '/empresa', icone: Building2, permitido: pode.verEmpresa },
  { rotulo: 'Configurações', caminho: '/configuracoes', icone: Settings, permitido: todos },
  { rotulo: 'Ajuda', caminho: '/ajuda', icone: CircleHelp, permitido: todos },
]

export const ICONE_SAIR = LogOut
