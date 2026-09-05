import imageCompression from 'browser-image-compression'

/**
 * Shrinks photos before upload: phones produce 4–12 MB HEIC/JPEGs and the app
 * only ever shows them at ≤1800px. Falls back to the original blob if the
 * browser can't decode it (e.g. an unsupported format).
 */
export async function compressImage(file: File | Blob, opts: { maxSize?: number; maxMB?: number } = {}): Promise<Blob> {
  const f = file instanceof File ? file : new File([file], 'image.jpg', { type: file.type || 'image/jpeg' })
  try {
    const out = await imageCompression(f, {
      maxSizeMB: opts.maxMB ?? 0.9,
      maxWidthOrHeight: opts.maxSize ?? 1800,
      useWebWorker: true,
      fileType: 'image/jpeg',
      initialQuality: 0.84,
    })
    return out
  } catch {
    return f
  }
}

export function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(url) }
    img.src = url
  })
}

export function pickFiles(accept = 'image/*', multiple = false, capture?: 'environment' | 'user'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    if (capture) input.setAttribute('capture', capture)
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    const done = (files: File[]) => { if (!settled) { settled = true; resolve(files); input.remove() } }
    input.onchange = () => done(Array.from(input.files ?? []))
    // If the user cancels the picker the change event never fires; clean up on focus return.
    window.addEventListener('focus', () => setTimeout(() => done([]), 800), { once: true })
    input.click()
  })
}
