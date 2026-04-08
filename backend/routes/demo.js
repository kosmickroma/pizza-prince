/**
 * @file demo.js
 * @description Demo mode router. Fires pre-built fake orders through the full
 *              pipeline (save -> SSE broadcast -> Telegram) without a real phone call.
 * 
 * @requires express                     - Router
 * @requires ../services/telegram.js     - sendOrderNotification()
 * 
 * @route GET /demo/order                - Fires a random test order
 * @route GET /demo/order?customer=mikey - Fires a specific character's test order
 * @route GET /demo/clear                - (coming soon) Resets the dashboard
 * 
 * @usedby server.js - Mounted via app.use('/demo', demoRouter)
 * 
 * @warning Remove or protect this route before any real customer deployment
 */

// This route lets you trigger a fake order from a browser without making an actual phone call.
import express from 'express';
import { sendOrderNotification } from '../services/telegram.js';
import { clearOrders } from '../services/orderStore.js';
import { broadcastEvent } from '../routes/orders.js';

const router = express.Router();

// --- Test Order Templates ---------------------------------------------------------

const TEST_ORDERS = {

    leonardo: {
        customer: {
            name: 'Leo',
            phone: '717-555-0101',
            type: 'Pickup',
        },
        items: [
            { name: 'The Foot Clan', size: 'Large', modifications: [], price: 24.00 },
            { name: 'Prince Knots', size: null,     modifications: [], price: 5.99, quantity: 1 },
        ],
        total_price:       29.99,
        upsell_successful: true,
        special_instructions: null,
    },

    mikey: {
        customer: {
            name: 'Mikey',
            phone: '717-555-0102',
            type: 'Delivery',
            address: '123 Sewer Lane, Lancaster, PA 17603',
        },
        items: [
            { name: 'The Mikey',    size: 'Large', modifications: ['Extra Cheese', 'Extra Pineapple'], price: 20.00 },
            { name: 'Regular Fries', size: 'Large', modifications: [], price: 4.50 },
        ],
        total_price:       24.50,
        upsell_successful: true,
        special_instructions: 'Ring the sewer grate — front door is broken',
     },
     
    ralph: {
        customer: {
            name: 'Raph',
            phone: '717-555-0103',
            type: 'Pickup',
        },
        items: [
            { name: 'The Shredder', size: 'Large', modifications: ['Extra Jalapenos', 'Extra Hot Sauce'], price: 23.00 },
            { name: 'Wings', size: null, modifications: ['Hot'], price: 8.99, quantity: 6 },
        ],
        total_price:       71.94,
        upsell_successful: false,
        special_instructions: 'Make it as hot as possible. Seriously.',
     },

    april: {
    customer: {
      name:    'April O\'Neil',
      phone:   '717-555-0104',
      type:    'Delivery',
      address: '7 Channel 6 Plaza, Lancaster, PA 17601',
    },
    items: [
      { name: 'The April O\'Neil', size: 'Medium', modifications: [], price: 15.00 },
      { name: 'Mozzarella Sticks', size: null,     modifications: [], price: 6.99, quantity: 1 },
    ],
    total_price:       21.99,
    upsell_successful: true,
    special_instructions: null,
  },

  splinter: {
    customer: {
      name:    'Master Splinter',
      phone:   '717-555-0105',
      type:    'Delivery',
      address: '1 Ninja Dojo Rd, Lancaster, PA 17602',
    },
    items: [
      { name: 'The Splinter',    size: 'Large', modifications: [], price: 23.00 },
      { name: 'Classic Cheesesteak', size: 'Large', modifications: ['No Onions'], price: 12.50 },
      { name: 'Prince Knots',    size: null,    modifications: [], price: 5.99, quantity: 1 },
    ],
    total_price:       41.49,
    upsell_successful: true,
    special_instructions: 'Leave at the dojo entrance. Do not knock.',
  },
};

// --- Demo Order Endpoint ---------------------------------------------------------

// GET /demo/order
// GET /demo/order?customer=mikey
router.get('/order', async (req, res) => {

    // Check if a specific customer was requested via query param
    const customerKey = req.query.customer?.toLowerCase();

    let orderData;

    if (customerKey && TEST_ORDERS[customerKey]) {
        // Use the requested test order
        orderData = TEST_ORDERS[customerKey];
    } else {
      // Pick a random one from the list
        const keys = Object.keys(TEST_ORDERS);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        orderData = TEST_ORDERS[randomKey];
    }

    // POST to our own /orders endpoint — it saves the order AND broadcasts via SSE.
    // We get the saved order (with its ID) back from the response.
    let order;
    try {
        const response = await fetch(`http://localhost:${process.env.PORT || 3000}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(orderData),
        });
        order = await response.json();
    } catch (err) {
        console.warn('Demo broadcast warning:', err.message);
        return res.status(500).json({ error: 'Demo order failed — is the server running?' });
    }

    // Also fire the Telegram notification so the full demo works end-to-end
    sendOrderNotification(order).catch(err =>
        console.warn('Demo Telegram notification failed:', err.message)
    );

    // Respond with the order so you can see it in the browser too
    res.json({
        message: `Demo order fired for ${order.customer.name}!`,
        order,
        tip: 'Check the dashboard at http://localhost:3000/dashboard',  
    });
});

// GET /demo/clear
// Wipes all orders from memory + disk, tells every connected dashboard to clear itself
router.get('/clear', (req, res) => {
    clearOrders();
    broadcastEvent({ type: 'orders_cleared' });
    res.json({ message: 'All orders cleared. Dashboard reset.' });
});

// GET /demo/seed
// Loads two pre-built orders for the demo — one done, one in-progress
// Hit this once after /demo/clear before you start filming
router.get('/seed', async (req, res) => {
    const now = Date.now();

    const seedOrders = [
        {
            // John — Delivery — DONE (came in 34 minutes ago)
            customer: {
                name:    'John',
                phone:   '717-291-4883',
                type:    'Delivery',
                address: '412 E Chestnut St, Lancaster, PA 17602',
            },
            items: [
                { name: 'Cheese Pizza',    size: 'Large',  quantity: 1, modifications: [],            price: 16.00 },
                { name: 'Italian Sub',     size: 'Large',  quantity: 1, modifications: [],            price: 11.50 },
                { name: 'Meatball Parm',   size: 'Small',  quantity: 1, modifications: [],            price:  9.00 },
                { name: 'Curly Fries',     size: 'Large',  quantity: 1, modifications: [],            price:  5.00 },
            ],
            total_price:       41.50,
            upsell_successful: false,
            special_instructions: null,
            _seed_timestamp:   new Date(now - 34 * 60 * 1000).toISOString(),
            demo_state:        'done',
        },
        {
            // Marcus — Pickup — IN PROGRESS (came in 11 minutes ago)
            customer: {
                name:    'Marcus',
                phone:   '717-390-7741',
                type:    'Pickup',
            },
            items: [
                { name: 'The Turtle Tracks', size: 'Large',  quantity: 1, modifications: [],                        price: 22.00 },
                { name: 'Wings',             size: null,     quantity: 1, modifications: ['12pc', 'BBQ'],            price: 15.99 },
                { name: 'Prince Knots',      size: null,     quantity: 1, modifications: [],                        price:  5.99 },
                { name: 'Curly Cheese Fries',size: null,     quantity: 1, modifications: [],                        price:  7.00 },
            ],
            total_price:       50.98,
            upsell_successful: true,
            special_instructions: null,
            _seed_timestamp:   new Date(now - 11 * 60 * 1000).toISOString(),
            demo_state:        'in-progress',
        },
    ];

    const saved = [];
    for (const orderData of seedOrders) {
        try {
            const response = await fetch(`http://localhost:${process.env.PORT || 3000}/orders`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(orderData),
            });
            saved.push(await response.json());
        } catch (err) {
            return res.status(500).json({ error: 'Seed failed: ' + err.message });
        }
    }

    res.json({ message: 'Demo seeded — 2 orders loaded.', orders: saved.map(o => o.order_id) });
});

export default router;

