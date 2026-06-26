const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html>
<html style="margin:0;padding:0;height:100%">
<head><title>Nexus Production</title></head>
<body style="margin:0;padding:0;height:100%;overflow:hidden">
<iframe src="https://nexus-web-seven-psi.vercel.app${req.url === '/' ? '' : req.url}"
  style="width:100%;height:100%;border:none"
  allow="clipboard-read; clipboard-write"></iframe>
</body></html>`);
});
server.listen(3999, () => console.log('Production proxy on http://localhost:3999'));
