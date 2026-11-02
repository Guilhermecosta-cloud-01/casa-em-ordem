/**
 * Reduz a foto escolhida para um quadrado de 192 px em JPEG (~10–25 KB).
 * Ela fica guardada no perfil e é protegida pelas mesmas regras de acesso.
 */
export async function resizeAvatar(file: File, size = 192): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.')
  if (file.size > 15 * 1024 * 1024) throw new Error('A imagem é grande demais (máximo 15 MB).')
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Não foi possível abrir esta imagem.'))
      img.src = url
    })
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    const sx = (image.naturalWidth - side) / 2
    const sy = (image.naturalHeight - side) / 2
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size)
    let quality = 0.85
    let data = canvas.toDataURL('image/jpeg', quality)
    while (data.length > 140_000 && quality > 0.4) {
      quality -= 0.15
      data = canvas.toDataURL('image/jpeg', quality)
    }
    return data
  } finally {
    URL.revokeObjectURL(url)
  }
}
