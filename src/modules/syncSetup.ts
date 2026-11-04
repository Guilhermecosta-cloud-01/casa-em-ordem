import { eventSync } from './agenda/hooks'
import { chatSync } from './chat/hooks'
import { expenseSync } from './expenses/hooks'
import { stockSync } from './stock/hooks'
import { taskSync } from './tasks/hooks'

/** Registra na fila de sincronização as operações offline de cada módulo. */
export function registerModuleSync() {
  taskSync.register()
  stockSync.register()
  expenseSync.register()
  eventSync.register()
  chatSync.register()
}
