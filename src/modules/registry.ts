import {
  Bell,
  Boxes,
  Calculator,
  CalendarDays,
  House,
  ListChecks,
  type LucideIcon,
  MessageCircle,
  Package,
  SquareCheckBig,
  Tags,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'

/**
 * Registro dos módulos do app. Cada módulo tem a própria pasta em
 * src/modules/<id> (páginas, componentes, api, domínio e testes) e entra na
 * navegação por aqui. Veja docs/MODULOS.md para adicionar um novo.
 */
export interface AppModule {
  id: string
  /** Nome curto na navegação. */
  name: string
  path: string
  icon: LucideIcon
  /** 'active' aparece na navegação; 'planned' é só planejamento (sem telas). */
  status: 'active' | 'planned'
  description: string
  /** Fica na barra inferior do celular (cabem 4 + "Mais"). */
  bottomNav?: boolean
}

export const MODULES: readonly AppModule[] = [
  { id: 'home', name: 'Início', path: '/', icon: House, status: 'active', description: 'Resumo do dia', bottomNav: true },
  {
    id: 'shopping',
    name: 'Listas',
    path: '/listas',
    icon: ListChecks,
    status: 'active',
    description: 'Listas de compras compartilhadas e histórico',
    bottomNav: true,
  },
  {
    id: 'chat',
    name: 'Conversas',
    path: '/conversas',
    icon: MessageCircle,
    status: 'active',
    description: 'Grupo da família e conversas a dois',
    bottomNav: true,
  },
  {
    id: 'tasks',
    name: 'Tarefas',
    path: '/tarefas',
    icon: SquareCheckBig,
    status: 'active',
    description: 'Tarefas da casa, responsáveis e prazos',
    bottomNav: true,
  },
  {
    id: 'calculator',
    name: 'Calculadora',
    path: '/calculadora',
    icon: Calculator,
    status: 'active',
    description: 'Preço por embalagem e custo-benefício',
  },
  {
    id: 'agenda',
    name: 'Agenda',
    path: '/agenda',
    icon: CalendarDays,
    status: 'active',
    description: 'Compromissos, datas importantes e lembretes',
  },
  { id: 'stock', name: 'Estoque', path: '/estoque', icon: Boxes, status: 'active', description: 'O que tem em casa e o que está acabando' },
  { id: 'expenses', name: 'Despesas', path: '/despesas', icon: Wallet, status: 'active', description: 'Gastos, divisão e resumo do mês' },
  {
    id: 'catalog',
    name: 'Produtos',
    path: '/produtos',
    icon: Package,
    status: 'active',
    description: 'Produtos frequentes e histórico de preços',
  },
  { id: 'family', name: 'Família', path: '/familia', icon: Users, status: 'active', description: 'Integrantes e convites' },
]

export const NAV_MODULES = MODULES.filter((m) => m.status === 'active')
export const BOTTOM_MODULES = NAV_MODULES.filter((m) => m.bottomNav)
export const MORE_MODULES = NAV_MODULES.filter((m) => !m.bottomNav)

/** Atalhos de configuração que aparecem em "Mais". */
export const MORE_SETTINGS = [
  { id: 'notifications', name: 'Notificações', path: '/notificacoes', icon: Bell, description: 'Avisos e celular' },
  { id: 'categories', name: 'Categorias', path: '/categorias', icon: Tags, description: 'Categorias da família' },
  { id: 'profile', name: 'Meu perfil', path: '/perfil', icon: UserRound, description: 'Nome, foto, aparência e conta' },
] as const
