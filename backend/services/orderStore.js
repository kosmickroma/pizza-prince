/**
 * @file orderStore.js
 * @description In-memory and file-based order storage service. Handles saving,
 *              retrieving, and generating IDs for all incoming orders.
 * 
 * @requires fs   - Node built-in: reads and writes the orders JSON file on disk
 * @requires path - Node built-in: builds file paths that work on any OS
 * 
 * @usedby routes/orders.js - Calls saveOrder() and getOrders() on every order
 * @usedby routes/demo.js   - Calls saveOrder() to persist demo orders
 */
 
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Path Setup --------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Path to our data file.
const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'orders.json');

// --- In-Memory Store -------------------------------------

// This array holds all orders for the current session.
let orders = [];

// --- Order ID Generator ----------------------------------

// We want IDs that look like PP-0001, PP-0042, PP-0100.
let orderCounter = 1;

function generateOrderId() {
    const id = `PP-${String(orderCounter).padStart(4, '0')}`;
    orderCounter++; // Increment so the next order gets the next number
    return id;
}

// --- Load Existing Orders on Startup -----------------------------

// When the server starts, load any previously saved orders from disk.
function loadOrdersFromDisk() {
    try {
        const raw  = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        
        // If we loaded existing orders, set the counter to continue from where we left off.
        orders       = data;
        orderCounter = data.length + 1;

        console.log(`📋 Loaded ${data.length} existing orders from disk`);
  } catch {
    // File doesn't exist yet — that's fine, we start fresh
    console.log('📋 No existing orders found, starting fresh');
  }
}

// Call it immediately when this module is first imported
loadOrdersFromDisk();

// --- Save Orders to Disk -------------------------------------

// Write the current in-memory orders array to the JSON file.
function saveOrdersToDisk() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2));
    } catch (err) {
        // Non-fatal - the order is still in memory, just warn us
        console.warn('⚠️  Could not save orders to disk:', err.message);
    }
}

// --- Public Functions -------------------------------------

// Save a new order. Called by the AI tool handler when an order is submitted.
export function saveOrder(orderData){
    const { _seed_timestamp, ...rest } = orderData;
    const order = {
        order_id:  generateOrderId(),
        timestamp: _seed_timestamp || new Date().toISOString(),
        ...rest,
    };

    // Add to in-memory array
    orders.push(order);

    // Persist to disk
    saveOrdersToDisk();

    console.log(`✅ Order saved: ${order.order_id} for ${order.customer?.name || 'unknown'}`);
    
    return order; //Return the full order so the caller can broadcast it
}

// Get all orders. Used by the SSE endpoint to send the full history to a newly connected dashboard.

export function getOrders() {
    return orders.slice().reverse();
}

// Get just the most recent N orders.
export function getRecentOrders(limit = 10) {
    return orders.slice(-limit).reverse();
}

// Wipe all orders from memory and disk. Used by the demo clear endpoint.
export function clearOrders() {
    orders = [];
    orderCounter = 1;
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
    } catch (err) {
        console.warn('⚠️  Could not clear orders file:', err.message);
    }
    console.log('🗑️  All orders cleared');
}