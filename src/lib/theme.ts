// Aparência: automática (segue o sistema), clara ou escura. A escolha fica
// neste aparelho.
export type ThemeChoice = 'system' | 'light' | 'dark'

const KEY = 'casa-em-ordem-theme'

export function getTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Sem armazenamento: vale até fechar o app.
  }
  applyTheme(choice)
}
