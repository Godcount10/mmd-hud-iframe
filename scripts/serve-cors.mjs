import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = normalize(process.argv[2])
const port = Number(process.argv[3] ?? 5273)

const server = http.createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  if (request.method === 'OPTIONS') {
    response.writeHead(204)
    response.end()
    return
  }
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  const relative = pathname.replace(/^\/+/, '')
  const filePath = normalize(join(root, relative))
  if (!filePath.startsWith(root)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }
  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('Not a file')
    const contentType = extname(filePath) === '.js' ? 'application/javascript; charset=utf-8' : 'application/octet-stream'
    response.writeHead(200, { 'Content-Type': contentType })
    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404)
    response.end('Not found')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`CORS static server: http://127.0.0.1:${port}`)
})
