import { createServer } from 'node:http';
import { notebookHandler } from './api/notebook.js';
import { notebookOrigins } from './shared/notebook-origins.js';

const handle = notebookHandler(undefined, 115000, process.env, notebookOrigins);
createServer((req, res) => {
  // The CloudBase HTTP gateway supplies CORS headers for registered H5 origins.
  if (!notebookOrigins.has(req.headers.origin)) {
    res.writeHead(403).end();
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }
  void handle(req, res);
}).listen(Number(process.env.PORT || 9000), '0.0.0.0');
