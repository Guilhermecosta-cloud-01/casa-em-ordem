import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from 'react-router/dom'
import { ConfirmProvider } from '@/components/ui/Confirm'
import { ToastProvider } from '@/components/ui/Toast'
import { env } from '@/lib/env'
import { persistOptions, queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/modules/auth/AuthProvider'
import { FamilyProvider } from '@/modules/family/FamilyProvider'
import { UpdatePrompt } from '@/pwa/UpdatePrompt'
import { router } from './router'
import { ConfigMissing } from './Splash'

export function App() {
  if (!env.configured) return <ConfigMissing />
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // O cache do aparelho aparece na hora, mas é sempre conferido com o
      // servidor logo depois (nunca é tratado como atualizado só por ser recente).
      onSuccess={() => {
        if (navigator.onLine) void queryClient.invalidateQueries()
      }}
    >
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <FamilyProvider>
              <RouterProvider router={router} />
              <UpdatePrompt />
            </FamilyProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </PersistQueryClientProvider>
  )
}
