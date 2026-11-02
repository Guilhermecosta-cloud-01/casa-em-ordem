import { createBrowserRouter, type RouteObject } from 'react-router'
import { ForgotPasswordPage, ResetPasswordPage, SignInPage, SignUpPage } from '@/modules/auth/pages'
import { InvitePage } from '@/modules/family/InvitePage'
import { OnboardingPage } from '@/modules/family/OnboardingPage'
import { HomePage } from '@/modules/home/HomePage'
import { ListDetailPage } from '@/modules/shopping/pages/ListDetailPage'
import { ListsPage } from '@/modules/shopping/pages/ListsPage'
import { AppLayout } from './AppLayout'
import { RequireAuth, RequireFamily } from './guards'
import { NotFoundPage, RouteErrorPage } from './NotFound'
import { Splash } from './Splash'

// Telas principais (lista de compras) carregam junto com o app; as demais,
// sob demanda. O service worker guarda todas para uso offline.
const appRoutes: RouteObject[] = [
  { index: true, element: <HomePage /> },
  { path: 'listas', element: <ListsPage /> },
  { path: 'listas/:listId', element: <ListDetailPage /> },
  {
    path: 'historico',
    lazy: async () => ({ Component: (await import('@/modules/shopping/pages/HistoryPage')).HistoryPage }),
  },
  {
    path: 'historico/:purchaseId',
    lazy: async () => ({ Component: (await import('@/modules/shopping/pages/PurchaseDetailPage')).PurchaseDetailPage }),
  },
  {
    path: 'calculadora',
    lazy: async () => ({ Component: (await import('@/modules/calculator/pages/CalculatorPage')).CalculatorPage }),
  },
  {
    path: 'calculadora/salvas',
    lazy: async () => ({
      Component: (await import('@/modules/calculator/pages/SavedComparisonsPage')).SavedComparisonsPage,
    }),
  },
  {
    path: 'produtos',
    lazy: async () => ({ Component: (await import('@/modules/catalog/pages/ProductsPage')).ProductsPage }),
  },
  {
    path: 'produtos/:productId',
    lazy: async () => ({ Component: (await import('@/modules/catalog/pages/ProductDetailPage')).ProductDetailPage }),
  },
  {
    path: 'familia',
    lazy: async () => ({ Component: (await import('@/modules/family/FamilyPage')).FamilyPage }),
  },
  {
    path: 'perfil',
    lazy: async () => ({ Component: (await import('@/modules/profile/ProfilePage')).ProfilePage }),
  },
]

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    HydrateFallback: Splash,
    children: [
      { path: 'entrar', element: <SignInPage /> },
      { path: 'criar-conta', element: <SignUpPage /> },
      { path: 'esqueci-senha', element: <ForgotPasswordPage /> },
      { path: 'redefinir-senha', element: <ResetPasswordPage /> },
      { path: 'convite/:token', element: <InvitePage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: 'comecar', element: <OnboardingPage /> },
          {
            element: <RequireFamily />,
            children: [{ path: '/', element: <AppLayout />, children: appRoutes }],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
