#!/usr/bin/env node
// Dev-only helper for manual offline tests of the mobile app (docs/TABLE-SYNC-MOBILE-TEST-GUIDE.md).
// Point the app's "Server API" to http://localhost:3100. While this script runs, the app reaches
// the local Next server on :3000; stop it (Ctrl+C) and only the mobile app goes "offline" — the web
// POS on :3000 keeps working. Start it again to bring the app back online.
//
//   node scripts/dev/mobile-offline-proxy.mjs            # listen 3100 → 127.0.0.1:3000

import http from 'node:http'

const LISTEN_PORT = Number(process.env.PROXY_PORT || 3100)
const TARGET_PORT = Number(process.env.TARGET_PORT || 3000)

const server = http.createServer((req, res) => {
  const upstream = http.request(
    { host: '127.0.0.1', port: TARGET_PORT, method: req.method, path: req.url, headers: { ...req.headers, host: `localhost:${TARGET_PORT}` } },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers)
      up.pipe(res)
    }
  )
  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(`proxy error: ${err.message}`)
  })
  req.pipe(upstream)
})

server.listen(LISTEN_PORT, () => {
  console.log(`📶 Mobile ONLINE  – proxy :${LISTEN_PORT} → :${TARGET_PORT}. Ctrl+C để giả lập mobile MẤT MẠNG.`)
})
process.on('SIGINT', () => {
  console.log('\n📵 Mobile OFFLINE – proxy đã tắt. Chạy lại lệnh để mobile có mạng trở lại.')
  process.exit(0)
})
