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
// Clears all demo orders from the dashboard
router.get('/clear', (req, res) => {
    // We'll implement this if needed
    res.json({ message: 'Clear endpoint coming soon. For now: restart the server.'});
});

export default router;

