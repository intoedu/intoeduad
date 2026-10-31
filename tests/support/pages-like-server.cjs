// dist를 Cloudflare Pages처럼 서빙: _headers 적용(로컬 Supabase 주소만 connect-src에 추가), 없는 경로는 index.html(SPA)
const http = require('http'), fs = require('fs'), path = require('path')
const root = process.argv[2]
const lines = fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n').filter((l) => /^\s+\S/.test(l))
const headers = Object.fromEntries(lines.map((l) => { const [k, ...v] = l.trim().split(':'); return [k, v.join(':').trim()] }))
headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace('connect-src', 'connect-src http://127.0.0.1:54321')
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' }
http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(req.url.split('?')[0]))
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html')
  res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(p)] || 'application/octet-stream' })
  fs.createReadStream(p).pipe(res)
}).listen(4173, '127.0.0.1')
