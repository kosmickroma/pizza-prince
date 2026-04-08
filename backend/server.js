/**
 * @file server.js
 * @description Express HTTP server entry point. Mounts all routes and 
 *              attaches the WebSocket server for Retell LLM integration.
 * 
 * @requires dotenv             - Loads environment variables from .env
 * @requires express            - HTTP framework
 * @requires ./routes/orders.js - Order logging + SSE stream
 * @requires ./routes/demo.js   - Demo mode trigger
 * @requires ./routes/llm.js    - Retell WebSocket handler
 * 
 * @listens PORT (default 3000)
 */

import 'dotenv/config';
import express    from 'express';
import { createServer } from 'http';        // Node built-in — creates the HTTP server
import { fileURLToPath } from 'url';
import path from 'path';

// Import the routes we built (each handles a different section of the API)
import ordersRouter from './routes/orders.js';  // Template 03
import demoRouter   from './routes/demo.js';    // Template 08

// Import the WebSocket setup function (Template 07)
// This is a function, not a router — it attaches to the HTTP server directly
import { setupLLMWebSocket } from './routes/llm.js';

// --- Path Setup ----------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- Express App ---------------------------------------------------------------

const app = express();

app.use(express.json());

// Serve the dashboard HTML from the dashboard/ folder
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));

// Menu pages
app.get('/menu',       (req, res) => res.sendFile(path.join(__dirname, '..', 'dashboard', 'menu.html')));
app.get('/menu/print', (req, res) => res.sendFile(path.join(__dirname, '..', 'dashboard', 'menu_print.html')));

// Serve static assets (logo, etc.) for menu page
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// --- Routes --------------------------------------------------------------------

// Health check — stays simple
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pizza-prince' });
});

// Mount the orders router at /orders
// This means:
//   GET  /orders/stream → handled by ordersRouter (SSE stream)
//   POST /orders        → handled by ordersRouter (new order)
app.use('/orders', ordersRouter);

// Mount the demo router at /demo
// This means:
//   GET /demo/order → fires a fake order through the full pipeline
//   GET /demo/clear → (coming soon) clears the dashboard
app.use('/demo', demoRouter);

// --- HTTP Server ----------------------------------------------------------------

// Create the HTTP server manually so we can share it with WebSockets.
// The Express `app` becomes the request handler for all HTTP traffic.
const server = createServer(app);

// Attach the Retell LLM WebSocket server to the SAME HTTP server.
// After this call, ws:// connections to /llm-websocket are handled by
// the WebSocket server, and http:// connections are handled by Express.
// They share port 3000 — Node figures out which is which from the protocol.
setupLLMWebSocket(server);

// --- Start Listening ------------------------------------------------------------

const PORT = parseInt(process.env.PORT) || 3000;

// Note: server.listen() instead of app.listen()
// Because we want the HTTP server (with WebSockets attached) to listen,
// not just the Express app on its own.
server.listen(PORT, () => {
  console.log('');
  console.log('🍕 ================================ 🍕');
  console.log(`   PIZZA PRINCE SERVER IS LIVE`);
  console.log('🍕 ================================ 🍕');
  console.log('');
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`   Menu:      http://localhost:${PORT}/menu`);
  console.log(`   Demo:      http://localhost:${PORT}/demo/order`);
  console.log(`   WS:        ws://localhost:${PORT}/llm-websocket`);
  console.log('');
  console.log('   Run: ngrok http 3000');
  console.log('   Then paste the ngrok URL into your Retell agent config.');
  console.log('');
});

