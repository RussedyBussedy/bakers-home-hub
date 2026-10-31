/**
 * The day a photo was taken, "YYYY-MM-DD", from its EXIF details (JPEG only), or null.
 *
 * Read it before the photo is shrunk: shrinking drops the details, location and all, which is the
 * point — only the day is kept, so a photo for the TV can come back on that day in later years.
 */
export async function takenOn(file: Blob): Promise<string | null> {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer())
    if (v.getUint16(0) !== 0xffd8) return null
    for (let o = 2; o + 10 < v.byteLength; o += 2 + v.getUint16(o + 2)) {
      if (v.getUint16(o) === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return exifDate(v, o + 10)   // APP1 "Exif"
    }
  } catch { /* not a JPEG this can read */ }
  return null
}

/** DateTimeOriginal (else DateTime) out of the TIFF block starting at t. */
function exifDate(v: DataView, t: number): string | null {
  const le = v.getUint16(t) === 0x4949
  const u16 = (o: number) => v.getUint16(o, le), u32 = (o: number) => v.getUint32(o, le)
  const entry = (ifd: number, tag: number) => {
    const n = u16(ifd)
    for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (u16(e) === tag) return e }
    return 0
  }
  const ifd0 = t + u32(t + 4), exif = entry(ifd0, 0x8769)
  const e = (exif && entry(t + u32(exif + 8), 0x9003)) || entry(ifd0, 0x0132)
  if (!e) return null
  let s = ''
  for (let i = 0, at = t + u32(e + 8); i < 10; i++) s += String.fromCharCode(v.getUint8(at + i))
  return /^\d{4}:\d{2}:\d{2}$/.test(s) && !s.startsWith('0000') ? s.replace(/:/g, '-') : null
}
