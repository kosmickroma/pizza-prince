/**
 * @file orders.js
 * @description Express router for order intake and real-time SSE broadcasting.
 *              Saves incoming orders and pushes them to all connected dashboards.
 * 
 * @requires express                        - Router and response handling
 * @requires ../services/orderStore.js      - saveOrder(), getOrders()
 * 
 * @route GET  /orders/stream - SSE stream; dashboard connects here and stays open
 * @route POST /orders        - Accepts a new order, saves it, broadcasts to screens
 * 
 * @usedby server.js - Mounted via app.use('/orders', ordersRouter)
 * @feeds  dashboard/index.html - Every connected dashboard receives broadcasts
 */
 
import express from 'express';
import { saveOrder, getOrders } from '../services/orderStore.js';

const router  = express.Router();
const clients = new Set();

// --- Broadcast Helper ---------------------------------------------------------

// Send an order to every connected dashboard browser.
function broadcast(order) {
    const message = `data: ${JSON.stringify(order)}\n\n`;

    // Loop through every connected browser and send them the message
    for (const client of clients) {
        client.write(message);
    }
    
    console.log(`📣 Broadcasted order ${order.order_id} to ${clients.size} dashboard(s)`);
}

// --- SSE Stream Endpoint -----------------------------------------------------

// The dashboard connects here and stays connected. We keep the connection open and push new orders down as they come in.
router.get('/stream', (req, res) => {

    // These headers tell the browser "this is an SSE connection, keep it open"
    res.setHeader('Content-Type',  'text/event-stream');  // SSE content type
    res.setHeader('Cache-Control', 'no-cache');           // Don't cache this
    res.setHeader('Connection',    'keep-alive');         // Keep the connection open

    // CORS header — allows the dashboard to connect even if served from a
    // different port during development
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send all existing orders immediately when the dashboard first connects.
    const existingOrders = getOrders();
    for (const order of existingOrders) {
        res.write(`data: ${JSON.stringify(order)}\n\n`);
    }

    // Add this browser to our clients list so it receives future broadcasts
    clients.add(res);
    console.log(`📡 Dashboard connected. Total clients: ${clients.size}`);

    // Remove this client when they disconnect
    req.on('close', () => {
        clients.delete(res);
        console.log(`📴 Dashboard disconnected. Total clients: ${clients.size}`);
    });
});

// --- New Order Endpoint ---------------------------------------------------------

// POST /orders Called by the AI tool handler when claude or gemini fires the submit_order tool.
router.post('/', (req, res) => {
    const orderData = req.body;

    // Basic validation - make sure we got something
    if (!orderData || !orderData.customer) {
        return res.status(400).json({ error: 'Invalid order data' });
    }

    // Save it
    const order = saveOrder(orderData);

    // Push it to all connected dashbaords in real time
    broadcast(order);

    // Respond to the caller with the saved order
    res.status(201).json(order);
});

// Export the router so server.js can mount it
export default router;

