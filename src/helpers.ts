import fs from 'fs'

export function isFile(path: string): boolean {
  try {
    const stats = fs.statSync(path)
    return stats.isFile()
  } catch {
    return false
  }
}
