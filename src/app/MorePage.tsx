import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { MORE_MODULES, MORE_SETTINGS } from '@/modules/registry'
import { PageBody, PageHeader } from './AppLayout'
import { useNavBadges } from './navBadges'

/** "Mais": os módulos que não cabem na barra inferior do celular. */
export function MorePage() {
  const badges = useNavBadges()
  return (
    <>
      <PageHeader title="Mais" />
      <PageBody className="space-y-8">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {MORE_MODULES.map((module) => (
            <li key={module.id}>
              <Link
                to={module.path}
                className="flex h-full min-h-28 flex-col gap-2 rounded-[var(--radius-panel)] bg-card p-4 ring-1 ring-line hover:ring-pen-line"
              >
                <module.icon className="size-6 text-pen" aria-hidden />
                <span className="font-semibold">{module.name}</span>
                <span className="text-sm leading-snug text-ink-2">{module.description}</span>
              </Link>
            </li>
          ))}
        </ul>

        <section aria-labelledby="mais-ajustes">
          <h2 id="mais-ajustes" className="mb-2 text-lg font-bold">
            Ajustes
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] bg-card ring-1 ring-line">
            {MORE_SETTINGS.map((item) => (
              <li key={item.id}>
                <Link to={item.path} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-paper">
                  <item.icon className="size-5 text-ink-2" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.name}</span>
                    <span className="block text-sm text-ink-2">{item.description}</span>
                  </span>
                  {item.id === 'notifications' && badges.notifications ? (
                    <span className="rounded-full bg-alert px-2 text-xs font-bold leading-5 text-white">
                      {badges.notifications}
                      <span className="sr-only"> não lidas</span>
                    </span>
                  ) : null}
                  <ChevronRight className="size-5 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </>
  )
}
