import type { IFileSystem, IFileStat } from '../interfaces/filesystem.js'

interface DirEntry {
  name: string
  stat: IFileStat
}

export async function generateDirectoryListing(
  fs: IFileSystem,
  dirPath: string,
  urlPath: string,
): Promise<string> {
  const names = await fs.readdir(dirPath)

  const entries: DirEntry[] = []
  for (const name of names) {
    try {
      const fullPath = dirPath.endsWith('/') ? dirPath + name : dirPath + '/' + name
      const stat = await fs.stat(fullPath)
      entries.push({ name, stat })
    } catch {
      // Skip entries we can't stat
    }
  }

  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.stat.isDirectory && !b.stat.isDirectory) return -1
    if (!a.stat.isDirectory && b.stat.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })

  const displayPath = urlPath === '/' ? '/' : urlPath
  const parentLink = urlPath === '/'
    ? ''
    : `<tr><td><a href="${encodeURI(urlPath.replace(/\/[^/]*\/?$/, '/') || '/')}">../</a></td><td></td><td></td></tr>\n`

  const rows = entries.map((entry) => {
    const name = entry.stat.isDirectory ? entry.name + '/' : entry.name
    const href = encodeURI((urlPath.endsWith('/') ? urlPath : urlPath + '/') + entry.name + (entry.stat.isDirectory ? '/' : ''))
    const size = entry.stat.isDirectory ? '-' : formatSize(entry.stat.size)
    const mtime = entry.stat.mtime.toISOString().replace('T', ' ').substring(0, 19)
    return `<tr><td><a href="${href}">${escapeHtml(name)}</a></td><td>${size}</td><td>${mtime}</td></tr>`
  }).join('\n')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Index of ${escapeHtml(displayPath)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; margin: 2em; color: #333; }
  h1 { font-size: 1.2em; font-weight: normal; }
  table { border-collapse: collapse; width: 100%; max-width: 800px; }
  th, td { text-align: left; padding: 4px 16px 4px 0; }
  th { border-bottom: 1px solid #ddd; font-size: 0.85em; color: #666; }
  td:nth-child(2), th:nth-child(2) { text-align: right; }
  a { color: #0066cc; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<h1>Index of ${escapeHtml(displayPath)}</h1>
<table>
<thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead>
<tbody>
${parentLink}${rows}
</tbody>
</table>
</body>
</html>`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
