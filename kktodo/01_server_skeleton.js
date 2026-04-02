/**
 * TEMPLATE 01 — The Express Server Skeleton
 * ==========================================
 * Copy this into: backend/server.js
 *
 * WHAT IS THIS FILE?
 * This is the entry point for the entire backend. When you run `npm run dev`,
 * Node starts HERE. Every incoming request — from Retell, from the dashboard,
 * from a demo trigger — goes through this file first.
 *
 * WHAT IS EXPRESS?
 * Express is a framework for building web servers in Node.js. Without it you'd
 * have to write a LOT of low-level code to handle HTTP requests. Express gives
 * you clean, readable tools for saying "when someone hits this URL, do this."
 *
 * WHAT IS A ROUTE?
 * A route is a URL + action pair. Example: "when someone visits /health,
 * respond with { status: 'ok' }". We'll add more routes as we build each
 * piece of the project.
 */

// ─── Imports ──────────────────────────────────────────────────────────────────

// dotenv loads our .env file so process.env.PORT etc. are available.
// The { path } option tells it exactly where the .env file lives.
// We import it FIRST, before anything else, so all env vars are ready.
import 'dotenv/config';

// Express is the web framework. `express()` creates our app instance.
import express from 'express';

// `path` and `fileURLToPath` are Node built-ins for working with file paths.
// We need them to figure out where our `dashboard/` folder lives on disk
// so we can serve the HTML file from it.
import { fileURLToPath } from 'url';
import path from 'path';

// ─── Path Setup ───────────────────────────────────────────────────────────────

// In ES Modules (our project uses "type": "module" in package.json),
// the old __dirname variable doesn't exist. This is the modern way to get it.
// __filename = the full path to THIS file
// __dirname  = the folder THIS file lives in
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── App Setup ────────────────────────────────────────────────────────────────

// Create the Express application. `app` is what we attach everything to.
const app = express();

// Middleware: parse incoming JSON request bodies automatically.
// Without this, req.body would be undefined when someone POSTs JSON to us.
// Retell sends JSON when it hits our webhook endpoints.
app.use(express.json());

// Middleware: serve everything in the `dashboard/` folder as static files.
// This means visiting http://localhost:3000/dashboard/index.html works.
// path.join(__dirname, '..', 'dashboard') = go up one folder from backend/,
// then into dashboard/. The '..' is because THIS file lives in backend/.
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check endpoint. Retell and other services ping this to make sure
// the server is alive. Returns a simple JSON response with status "ok".
// app.get(url, handler) = "when someone makes a GET request to this URL, run this function"
// req = the incoming request (we don't need it here)
// res = our response object — we use it to send something back
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pizza-prince' });
});

// TODO: We'll plug in more routes here as we build them.
// They'll look like:
//   import ordersRouter from './routes/orders.js';
//   app.use('/orders', ordersRouter);

// ─── Start the Server ─────────────────────────────────────────────────────────

// Read the PORT from our .env file. If it's not set, default to 3000.
// parseInt() converts the string "3000" from .env into the number 3000.
const PORT = parseInt(process.env.PORT) || 3000;

// app.listen() starts the server and tells it to watch for incoming connections.
// The callback function runs once the server is successfully started.
app.listen(PORT, () => {
  console.log(`🍕 Pizza Prince server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Dashboard:    http://localhost:${PORT}/dashboard`);
  console.log(`   Press Ctrl+C to stop`);
});
