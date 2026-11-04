import { stockSync } from './stock/hooks'
import { taskSync } from './tasks/hooks'

/** Registra na fila de sincronização as operações offline de cada módulo. */
export function registerModuleSync() {
  taskSync.register()
  stockSync.register()
}
