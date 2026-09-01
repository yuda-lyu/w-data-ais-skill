//dry run 靜態服務: node srv.mjs [port]
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

let __dirname = path.dirname(fileURLToPath(import.meta.url))
let port = Number(process.argv[2] || 18090)
let fp = path.join(__dirname, 'app', 'index.html')

http.createServer((req, res) => {
    if (req.url.startsWith('/health')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ project: 'e2e-dryrun', ok: true }))
        return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(fs.readFileSync(fp))
}).listen(port, '127.0.0.1', () => {
    console.log(`dryrun listening ${port}`)
})
