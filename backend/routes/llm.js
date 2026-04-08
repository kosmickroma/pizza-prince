/**
 * @file llm.js
 * @description Retell AI custom LLM WebSocket handler. Bridges incoming voice calls
 *              from Retell to Claude Haiku and executes the submit_order tool.
 *
 * @requires ws                             - WebSocket server (npm package)
 * @requires @anthropic-ai/sdk             - Anthropic Claude SDK
 * @requires ../config/systemPrompt.js      - buildSystemPrompt(), TOOLS
 * @requires ../services/telegram.js        - sendOrderNotification()
 *
 * @env ANTHROPIC_API_KEY - Anthropic API key
 * @env CLAUDE_MODEL      - Model ID (default: claude-haiku-4-5-20251001)
 * @env PORT              - Used to self-call POST /orders after tool execution
 *
 * @exports setupLLMWebSocket(httpServer) - Attaches WebSocket server to Express HTTP server
 *
 * @usedby server.js - Called after createServer(); shares port 3000 with HTTP
 * @listens wss://<ngrok-host>/llm-websocket/:call_id - Retell connects here per call
 */

import { WebSocketServer } from 'ws';
import Anthropic           from '@anthropic-ai/sdk';
import { buildSystemPrompt, TOOLS } from '../config/systemPrompt.js';
import { sendOrderNotification }    from '../services/telegram.js';
import { broadcastEvent }           from '../routes/orders.js';

// --- Claude Client ------------------------------------------------

const client      = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SYSTEM_PROMPT = buildSystemPrompt();

// --- Session Storage ------------------------------------------------

const sessions      = new Map(); // callId → history array
const submittedCalls = new Set(); // prevents double-submit

// --- Setup Function ---------------------------------------------------------

export function setupLLMWebSocket(httpServer) {

    const wss = new WebSocketServer({
        server: httpServer,
        verifyClient: ({ req }) => req.url.startsWith('/llm-websocket'),
    });

    console.log('🤖 LLM WebSocket server ready at /llm-websocket/:call_id');

    wss.on('connection', (ws, req) => {
        const pathParts = req.url.split('/');
        const callId    = pathParts[pathParts.length - 1] || `call_${Date.now()}`;

        sessions.set(callId, []);
        console.log(`📞 Session started: ${callId}`);
        broadcastEvent({ type: 'call_started', callId });

        // Send greeting immediately — don't wait for caller to speak first
        setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                    response_id:      0,
                    content:          "Thanks for calling Pizza Prince, is this for pickup or delivery?",
                    content_complete: true,
                    end_call:         false,
                }));
                console.log('👋 Greeting sent');
            }
        }, 500);

        // --- Incoming Message Handler -------------------------------------------------

        ws.on('message', async (rawData) => {
            try {
                const message = JSON.parse(rawData.toString());
                console.log(`📨 Retell message: interaction_type=${message.interaction_type} transcript_len=${message.transcript?.length ?? 'n/a'}`);

                const history     = sessions.get(callId);
                const isFirstTurn = message.transcript?.length === 0 ||
                    (message.transcript?.length === 1 && message.transcript[0].content === '');

                // First turn — just send the greeting, no AI needed
                if (isFirstTurn && history.length === 0) {
                    ws.send(JSON.stringify({
                        response_id:      message.response_id ?? 0,
                        content:          "Thanks for calling Pizza Prince, is this for pickup or delivery?",
                        content_complete: true,
                        end_call:         false,
                    }));
                    return;
                }

                if (message.interaction_type !== 'response_required' &&
                    message.interaction_type !== 'reminder_required') {
                    return;
                }

                syncHistory(history, message.transcript);

                if (history.length === 0) {
                    ws.send(JSON.stringify({
                        response_id:      message.response_id,
                        content:          "Thanks for calling Pizza Prince, is this for pickup or delivery?",
                        content_complete: true,
                        end_call:         false,
                    }));
                    return;
                }

                const responseText = await getClaudeResponse(callId, history);

                ws.send(JSON.stringify({
                    response_id:      message.response_id,
                    content:          responseText,
                    content_complete: true,
                    end_call:         false,
                }));

            } catch (err) {
                console.error('❌ Error handling message from Retell:', err.message);
                const orderDone = submittedCalls.has(callId);
                ws.send(JSON.stringify({
                    response_id:      0,
                    content:          orderDone
                        ? "You're all set! Have a great day!"
                        : "Sorry about that — let me get someone to call you right back.",
                    content_complete: true,
                    end_call:         true,
                }));
            }
        });

        ws.on('close', () => {
            sessions.delete(callId);
            // Delay removing from submittedCalls — in-flight requests can still
            // complete after the socket closes and we don't want a double-submit
            setTimeout(() => submittedCalls.delete(callId), 30000);
            console.log(`📴 Session ended: ${callId}`);
            broadcastEvent({ type: 'call_ended', callId });
        });
    });
}

// --- History Sync ----------------------------------------------

// Convert Retell's transcript into Claude's message format.
// Claude uses role: 'user' | 'assistant' and content as a plain string.

function syncHistory(history, transcript) {
    history.length = 0;
    for (const turn of transcript) {
        history.push({
            role:    turn.role === 'agent' ? 'assistant' : 'user',
            content: turn.content,
        });
    }
}

// --- Claude Response ----------------------------------------------

async function getClaudeResponse(callId, history) {

    // Loop handles tool calls — Claude may call submit_order, then we feed
    // the result back and get its final spoken response.
    while (true) {
        const response = await client.messages.create({
            model:      process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system:     SYSTEM_PROMPT,
            tools:      TOOLS,
            messages:   history,
        });

        console.log(`🧠 Claude stop_reason: ${response.stop_reason}`);

        // Add Claude's full response to history
        history.push({ role: 'assistant', content: response.content });

        // If max_tokens hit and there are orphaned tool_use blocks, clean them up
        // or they'll cause a 400 on the next call
        if (response.stop_reason === 'max_tokens') {
            const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
            if (toolUseBlocks.length > 0) {
                history.push({
                    role:    'user',
                    content: toolUseBlocks.map(tu => ({
                        type:        'tool_result',
                        tool_use_id: tu.id,
                        content:     'Truncated. Please continue.',
                    })),
                });
                continue;
            }
            const textBlock = response.content.find(b => b.type === 'text');
            return textBlock?.text?.trim() || "Got it.";
        }

        if (response.stop_reason === 'tool_use') {
            const toolUse = response.content.find(b => b.type === 'tool_use');
            const { id, name, input } = toolUse;

            console.log(`🔧 Tool call: ${name} (call: ${callId})`);

            // Block double-submit
            if (name === 'submit_order' && submittedCalls.has(callId)) {
                console.warn(`⚠️  Duplicate submit blocked for ${callId}`);
                return "You're all set — your order is already in!";
            }

            const result = await executeTool(name, input, callId);

            // Feed the tool result back to Claude
            history.push({
                role:    'user',
                content: [{ type: 'tool_result', tool_use_id: id, content: result }],
            });

            // Loop — Claude will now give its spoken response
            continue;
        }

        // Normal text response — extract and return it
        const textBlock = response.content.find(b => b.type === 'text');
        return textBlock?.text?.trim() || "Got it.";
    }
}

// --- Tool Execution ---------------------------------------------------------

async function executeTool(name, args, callId) {
    try {
        if (name === 'submit_order') {


            const response = await fetch(`http://localhost:${process.env.PORT || 3000}/orders`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(args),
            });

            const order = await response.json();
            submittedCalls.add(callId);

            sendOrderNotification(order).catch(err =>
                console.warn('⚠️  Telegram notification failed:', err.message)
            );

            return `Order ${order.order_id} confirmed. Total: $${order.total_price}. Kitchen notified.`;
        }

        return `Unknown tool: ${name}`;

    } catch (err) {
        console.error(`❌ Tool error (${name}):`, err.message);
        return `Tool failed: ${err.message}`;
    }
}
