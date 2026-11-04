import { createContext, type ReactNode, useContext } from 'react'
import { useUnreadChatCount } from '@/modules/chat/hooks'
import { useUnreadNotificationsCount } from '@/modules/notifications/hooks'

type Badges = Record<string, number | undefined>
const BadgesContext = createContext<Badges>({})

/**
 * Contadores da navegação (mensagens e avisos não lidos), calculados uma vez
 * para todo o app. É aqui que o tempo real das conversas e dos avisos fica
 * ligado enquanto o app está aberto.
 */
export function NavBadgesProvider({ children }: { children: ReactNode }) {
  const chat = useUnreadChatCount()
  const notifications = useUnreadNotificationsCount()
  return <BadgesContext.Provider value={{ chat, notifications, more: notifications }}>{children}</BadgesContext.Provider>
}

export function useNavBadges(): Badges {
  return useContext(BadgesContext)
}
