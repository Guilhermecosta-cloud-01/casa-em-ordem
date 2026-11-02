import { Calculator, House, ListChecks, type LucideIcon, Package, Users } from 'lucide-react'

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
}

export const MODULES: readonly AppModule[] = [
  { id: 'home', name: 'Início', path: '/', icon: House, status: 'active', description: 'Resumo do dia' },
  {
    id: 'shopping',
    name: 'Listas',
    path: '/listas',
    icon: ListChecks,
    status: 'active',
    description: 'Listas de compras compartilhadas e histórico',
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
    id: 'catalog',
    name: 'Produtos',
    path: '/produtos',
    icon: Package,
    status: 'active',
    description: 'Produtos frequentes e histórico de preços',
  },
  { id: 'family', name: 'Família', path: '/familia', icon: Users, status: 'active', description: 'Integrantes e convites' },

  // Próximos módulos (etapa 6). Ficam registrados para planejamento, mas não
  // aparecem para as pessoas enquanto não estiverem prontos.
  { id: 'chat', name: 'Conversas', path: '/conversas', icon: Users, status: 'planned', description: 'Chat familiar' },
  { id: 'tasks', name: 'Tarefas', path: '/tarefas', icon: ListChecks, status: 'planned', description: 'Tarefas domésticas' },
  { id: 'expenses', name: 'Despesas', path: '/despesas', icon: Calculator, status: 'planned', description: 'Despesas da família' },
  { id: 'agenda', name: 'Agenda', path: '/agenda', icon: House, status: 'planned', description: 'Compromissos e lembretes' },
  { id: 'stock', name: 'Estoque', path: '/estoque', icon: Package, status: 'planned', description: 'Estoque doméstico' },
]

export const NAV_MODULES = MODULES.filter((m) => m.status === 'active')
