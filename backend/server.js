/**
 * @file server.js
 * @description Express HTTP server entry point. Mounts all routes and 
 *              attatches the WebSocket server for Retell LLM integration.
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
import express from 'express'; //Express is the web framework.
import { fileURLToPath } from 'url';
import path from 'path';

// --- Path Setup --------------------------------------------

// In ES Modules (this project uses "type": "module" in package.json)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- App Setup ---------------------------------------------

// Create the Express application. 'app' is what we attatch everything to.
const app = express();

// Middleware: parse incoming JSON request bodies automatically.
app.use(express.json());

// Middleware: serve everything in the 'dashboard/' folder as static files.
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));

// --- Routes ---------------------------------------------

// Health check endpoint. Retell and other services ping this to make sure
// the server is alive. Returns a simple JSON response with status "ok".
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'pizza-prince' });
});

// TODO: We'll plug in more routes here as we build them.

// --- Start the Server -------------------------------------

// Read the PORT from our .env file. If it's not set, default to 3000.
const PORT = parseInt(process.env.PORT) || 3000;

// app.listen() starts the server and tells it to watch for incoming connections.
app.listen(PORT, () => {
    console.log(`🍕 Pizza Prince server running on port ${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   Dashboard:    http://localhost:${PORT}/dashboard`);
    console.log(`   Press Ctrl+C to stop`); 
});

