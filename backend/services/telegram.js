/**
 * @file telegram.js
 * @description Sends a formatted order summary to the shop owner via Telegram
 *              the moment an order is confirmed by the AI.
 * 
 * @requires fetch - Built into Node 18+, no import needed
 * 
 * @env TELEGRAM_BOT_TOKEN - Bot token from BotFather
 * @env TELEGRAM_CHAT_ID   - Owner's personal Telegram chat ID
 * 
 * @usedby routes/llm.js  - Called inside executeTool() after submit_order fires
 * @usedby routes/demo.js - Called after a demo order is saved
 */
// Telegram Notification Service
// How do I get the CHAT ID? Create your bot via BotFather (/newbot) "Telegram APP"

// --- Send Order Notification ---------------------------------------------------------

export async function sendOrderNotification(order) {
    // Read credentials from environment variables
    // These come from your .env file, loaded by dotenv in server.js
    const token  = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // If either is missing, warn and bail out. Non-fatal - the order is already
    // saved and on the dashboard even if Telegram fails.
    if (!token || !chatId) {
        console.warn('⚠️  Telegram not configured - skipping notification');
        return;
    }

    // Build the message text.
    const message = formatOrderMessage(order);

    // The Telegram Bot API endpoint for sending messages
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        // fetch() makes an HTTP request. We use POST because we're sending data.
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                chat_id:    chatId,
                text:       message,
                parse_mode: 'Markdown', // Enables *bold*, `code` etc.
            }),
        });

        // Concert the response to JSON so we can check if it worked
        const data = await response.json();

        if (data.ok) {
            console.log(`📱 Telegram notification sent for ${order.order_id}`);
        } else {
            // Telegram returned an error (bad token, blocked bot, etc.)
            console.error('❌ Telegram API error:', data.description);
        }

    } catch (err) {
        // Network error, Telegram down, etc. Still non-fatal.
        console.error('❌ Failed to send Telegram notification:', err.message);
    }
}

// --- Message Formatting ---------------------------------------------------------

function formatOrderMessage(order) {
    const customer = order.customer || {};
    const items    = order.items    || [];

    // Format the time to something readable like "8:41 PM"
    const time = new Date(order.timestamp).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
    });

    // Build the items list as text lines 
    const itemsLines = items.map(item => {
        const size = item.size     ?` (${item.size})`              : '';
        const qty  = item.quantity ?` x${item.quantity}`            : '';
        const mods = item.modifications?.length
            ? `\n   - ${item.modifications.join(', ')}`
            : '';
        return `• ${qty}${item.name}${size}${mods}`;
    }).join('\n');

    // Delivery address line (only shown for delivery orders)
    const addressLine = customer.type?.toLowerCase() === 'delivery' && customer.address
        ? `\n📍 Address: ${customer.address}`
        : '';

    const notesLine = order.special_instructions
        ? `📝 Notes: ${order.special_instructions}\n`
        : '';
        
    // Template literal - builds the full message
    return `
    🍕 *NEW ORDER — ${order.order_id}*
    ⏰ ${time}

    👤 *${customer.name || 'Unknown'}*
    📞 ${customer.phone || 'No phone'}
    🚗 ${customer.type || 'Unknown'}
    ${addressLine}
    *Items:*
    ${itemsLines}

    ${notesLine}💰 *Total: $${Number(order.total_price || 0).toFixed(2)}*
    `.trim();
    }
    
