const http = require("http");
const fs = require("fs");
const path = require("path");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".mpeg": "audio/mpeg",
  // Os hinos de França e China são contêineres MP4/AAC. O tipo de vídeo é
  // o mais compatível para que o elemento de mídia extraia a faixa de áudio.
  ".mp4": "video/mp4",
  ".wav": "audio/wav"
};

const server = http.createServer((req, res) => {
  const cleanUrl = decodeURIComponent(req.url.split("?")[0]);
  const requestedPath = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const rootPath = path.join(__dirname, requestedPath);
  const publicPath = path.join(__dirname, "public", requestedPath);

  if (!rootPath.startsWith(__dirname) || !publicPath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Acesso negado");
    return;
  }

  // O Vite publica esta pasta diretamente; este servidor local reproduz o
  // mesmo comportamento para imagens e áudios funcionarem com `node server.js`.
  const filePath = fs.existsSync(rootPath) ? rootPath : publicPath;

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Arquivo nao encontrado");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(content);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`War verse rodando em http://localhost:${PORT}`);
});
