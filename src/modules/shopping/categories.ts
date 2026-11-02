import { normalizeText } from '@/lib/text'

export interface Category {
  id: string
  label: string
  emoji: string
}

/** Categorias na ordem aproximada dos corredores de um supermercado. */
export const CATEGORIES: readonly Category[] = [
  { id: 'hortifruti', label: 'Hortifrúti', emoji: '🥬' },
  { id: 'padaria', label: 'Padaria', emoji: '🥖' },
  { id: 'acougue', label: 'Açougue e peixaria', emoji: '🥩' },
  { id: 'frios', label: 'Frios e laticínios', emoji: '🧀' },
  { id: 'mercearia', label: 'Mercearia', emoji: '🍚' },
  { id: 'bebidas', label: 'Bebidas', emoji: '🥤' },
  { id: 'congelados', label: 'Congelados', emoji: '🧊' },
  { id: 'limpeza', label: 'Limpeza', emoji: '🧽' },
  { id: 'higiene', label: 'Higiene e beleza', emoji: '🧴' },
  { id: 'farmacia', label: 'Farmácia', emoji: '💊' },
  { id: 'bebe', label: 'Bebê', emoji: '🍼' },
  { id: 'pet', label: 'Pet', emoji: '🐾' },
  { id: 'utilidades', label: 'Utilidades', emoji: '🔧' },
  { id: 'outros', label: 'Outros', emoji: '🛒' },
]

const BY_ID = new Map(CATEGORIES.map((c, index) => [c.id, { ...c, index }]))
const FALLBACK = BY_ID.get('outros')!

export function getCategory(id: string | null | undefined): Category & { index: number } {
  return (id && BY_ID.get(id)) || FALLBACK
}

// Palavras que indicam a categoria (sem acento, minúsculas). A primeira
// categoria que tiver uma palavra no começo de alguma palavra do nome vence.
const KEYWORDS: Record<string, string[]> = {
  bebe: ['fralda', 'lenco umedecido', 'papinha', 'mamadeira', 'chupeta', 'pomada para assadura'],
  pet: ['racao', 'areia de gato', 'areia sanitaria', 'petisco', 'sache para gato', 'sache para cachorro'],
  farmacia: ['remedio', 'dipirona', 'paracetamol', 'ibuprofeno', 'vitamina', 'curativo', 'band-aid', 'soro', 'termometro', 'antialergico', 'xarope'],
  limpeza: ['detergente', 'sabao', 'amaciante', 'desinfetante', 'agua sanitaria', 'alvejante', 'esponja', 'multiuso', 'limpador', 'lustra', 'saco de lixo', 'pano de chao', 'veja', 'vassoura', 'rodo', 'cloro', 'tira manchas', 'lava roupas', 'lava loucas'],
  higiene: ['shampoo', 'xampu', 'condicionador', 'sabonete', 'creme dental', 'pasta de dente', 'escova de dente', 'fio dental', 'desodorante', 'papel higienico', 'absorvente', 'protetor solar', 'hidratante', 'barbeador', 'aparelho de barbear', 'cotonete', 'algodao', 'enxaguante'],
  congelados: ['sorvete', 'congelad', 'lasanha', 'nuggets', 'hamburguer', 'gelo', 'pizza', 'polpa', 'batata palito', 'empanado'],
  bebidas: ['agua', 'refrigerante', 'refri', 'suco', 'cerveja', 'vinho', 'coca', 'guarana', 'cha gelado', 'energetico', 'isotonico', 'espumante', 'cachaca', 'vodka', 'whisky', 'agua de coco', 'kombucha'],
  acougue: ['carne', 'frango', 'peixe', 'linguica', 'picanha', 'costela', 'patinho', 'alcatra', 'acem', 'musculo', 'file', 'coxa', 'sobrecoxa', 'asa', 'peito', 'salmao', 'tilapia', 'camarao', 'bacon', 'pernil', 'lombo', 'maminha', 'fraldinha', 'cupim', 'contrafile', 'coracao', 'moida', 'bisteca', 'sardinha fresca', 'calabresa'],
  frios: ['salsicha', 'queijo', 'presunto', 'mortadela', 'iogurte', 'leite', 'manteiga', 'requeijao', 'margarina', 'creme de leite', 'nata', 'mussarela', 'muçarela', 'peito de peru', 'salame', 'ricota', 'cream cheese', 'coalhada', 'leite fermentado'],
  padaria: ['pao', 'paes', 'bolo', 'torrada', 'bisnaguinha', 'croissant', 'rosca', 'sonho', 'baguete', 'broa', 'pao de queijo'],
  hortifruti: ['tomate', 'alface', 'banana', 'maca', 'batata', 'cebola', 'alho', 'cenoura', 'laranja', 'limao', 'fruta', 'verdura', 'legume', 'mamao', 'melancia', 'melao', 'abacaxi', 'uva', 'morango', 'abobrinha', 'abobora', 'pepino', 'pimentao', 'brocolis', 'couve', 'repolho', 'rucula', 'cheiro verde', 'salsinha', 'cebolinha', 'coentro', 'mandioca', 'aipim', 'inhame', 'beterraba', 'chuchu', 'quiabo', 'jilo', 'manga', 'abacate', 'pera', 'kiwi', 'goiaba', 'maracuja', 'tangerina', 'mexerica', 'ovos', 'ovo'],
  mercearia: ['arroz', 'feijao', 'macarrao', 'acucar', 'cafe', 'oleo', 'farinha', 'sal', 'molho', 'extrato', 'biscoito', 'bolacha', 'cereal', 'aveia', 'azeite', 'vinagre', 'milho', 'ervilha', 'atum', 'sardinha', 'fuba', 'tempero', 'maionese', 'ketchup', 'mostarda', 'achocolatado', 'leite em po', 'leite condensado', 'gelatina', 'granola', 'chocolate', 'amendoim', 'pipoca', 'lentilha', 'grao de bico', 'farofa', 'polvilho', 'fermento', 'cha', 'mel', 'geleia', 'doce de leite', 'tapioca', 'cuscuz'],
  utilidades: ['pilha', 'lampada', 'papel aluminio', 'filme plastico', 'guardanapo', 'papel toalha', 'vela', 'fosforo', 'isqueiro', 'carvao', 'copo descartavel', 'prato descartavel', 'palito', 'saco plastico', 'pote'],
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Expressões mais longas são testadas antes ("leite condensado" antes de
// "leite"). Palavras curtas (sal, mel, chá…) precisam aparecer inteiras
// (aceitando plural), para "sal" não pegar "salsicha".
const RULES: Array<{ category: string; pattern: RegExp; length: number }> = Object.entries(KEYWORDS)
  .flatMap(([category, words]) =>
    words.map((word) => {
      const keyword = normalizeText(word)
      const body = escapeRegExp(keyword)
      const pattern = keyword.length <= 3 ? new RegExp(`(^| )${body}s?( |$)`) : new RegExp(`(^| )${body}`)
      return { category, pattern, length: keyword.length }
    }),
  )
  .sort((a, b) => b.length - a.length)

/** Sugere uma categoria a partir do nome digitado ("Arroz 5 kg" → Mercearia). */
export function guessCategory(name: string): string {
  const text = normalizeText(name)
  for (const { category, pattern } of RULES) {
    if (pattern.test(text)) return category
  }
  return 'outros'
}
