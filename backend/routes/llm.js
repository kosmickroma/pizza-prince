/**
 * @file llm.js
 * @description Retell AI custom LLM WebSocket handler. Bridges incoming voice calls
 *              from Retell to Gemini Flash 2.5 and executes the submit_order tool.
 * 
 * @requires ws                             - WebSocket server (npm package)
 * @requires @google/genai                  - Google Gemini SDK
 * @requires ../config/systemPrompt.js      - buildSystemPrompt(), TOOLS
 * @requires ../services/telegram.js        - sendOrderNotification()
 * 
 * @env GEMINI_API_KEY - Google AI Studio API key
 * @env GEMINI_MODEL   - Model ID (default: gemini-2.5-flash)
 * @env PORT           - Used to sel-call POST /orders after tool execution
 * 
 * @exports setupLLMWebSocket(httpServer) - Attaches WebSocket server to Express HTTP server
 * 
 * @usedby server.js - Called after createServer(); shares port 3000 with HTTP
 * @listens wss://<ngrok-host>/llm-websocket/:call_id - Retell connects here per call
 */

// This file is where Gemini and Retell talk to each other
import { WebSocketServer } from 'ws';
import { GoogleGenAI }     from '@google/genai';
import { buildSystemPrompt, TOOLS } from '../config/systemPrompt.js';
import { sendOrderNotification } from '../services/telegram.js';
import { broadcastEvent }        from '../routes/orders.js';

// --- Gemini Client ------------------------------------------------

// One client for the whole server - created once at startup
// Reads GEMINI_API_KEY from your .env file.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Call buildSystemPrompt() to actually generate the prompt string.
// Just importing the function isn't enough — you have to call it.
const SYSTEM_PROMPT = buildSystemPrompt();

// --- Session Storage ------------------------------------------------

// Each phone call gets its own conversation history + state.
const sessions = new Map(); // callId → { history: [], orderSubmitted: false }

// Tracks which calls have already submitted an order — prevents double-submit.
const submittedCalls = new Set();

// --- Setup Function ---------------------------------------------------------

// Attach the WebSocket server to our Express HTTP server. Called once from server.js after the HTTP is created.
export function setupLLMWebSocket(httpServer) {

    // No static 'path' here — Retell connects to /llm-websocket/{call_id}
    // so we match the prefix in handleProtocols/verifyClient and extract
    // the call_id from the path segment ourselves.
    const wss = new WebSocketServer({
        server: httpServer,
        verifyClient: ({ req }) => req.url.startsWith('/llm-websocket'),
    });

    console.log('🤖 LLM WebSocket server ready at /llm-websocket/:call_id');

    // This callback runs every time Retell opens a new WebSocket connection.
    // Each phone call = one new connection.
    wss.on('connection', (ws, req) => {
        console.log('📞 Retell connected for a new call');

        // Retell sends the call_id as a path segment: /llm-websocket/{call_id}
        // e.g. req.url = "/llm-websocket/call_abc123"
        const pathParts = req.url.split('/');
        const callId    = pathParts[pathParts.length - 1] || `call_${Date.now()}`;

        // Start with an empty history for this call
        sessions.set(callId, []);
        console.log(`📞 Session started: ${callId}`);

        // Tell the dashboard a call just started
        broadcastEvent({ type: 'call_started', callId });

        // Send greeting immediately on connect — don't wait for user to speak first
        // Small delay gives the SIP/audio path time to fully establish
        setTimeout(() => {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                    response_id:      0,
                    content:          "Thanks for calling Pizza Prince — will this be for pickup or delivery?",
                    content_complete: true,
                    end_call:         false,
                }));
                console.log('👋 Greeting sent');
            }
        }, 500);

        // --- Incoming Message Handler -------------------------------------------------

        // Runs every time Retell sends us an update during the call
        ws.on('message', async (rawData) => {
            try {
                // Retell sends JSON strings - parse to object
                const message = JSON.parse(rawData.toString());

                console.log(`📨 Retell message: interaction_type=${message.interaction_type} transcript_len=${message.transcript?.length ?? 'n/a'}`);

                // First message of the call — transcript is empty, agent should greet first
                const history = sessions.get(callId);
                const isFirstTurn = message.transcript?.length === 0 ||
                    (message.transcript?.length === 1 && message.transcript[0].content === '');

                if (isFirstTurn && history.length === 0) {
                    ws.send(JSON.stringify({
                        response_id:      message.response_id ?? 0,
                        content:          "Thanks for calling Pizza Prince — will this be for pickup or delivery?",
                        content_complete: true,
                        end_call:         false,
                    }));
                    return;
                }

                // We only respond to 'response_required' - that's when the caller has finished speaking and Retell needs our AI's reply.
                if (message.interaction_type !== 'response_required' &&
                    message.interaction_type !== 'reminder_required') {
                        return;
                    }    
                    
                    // Sync history with Retell's latest transcript
                    syncHistory(history, message.transcript);

                    // If the transcript is empty this is the very first turn — send the greeting
                    // without hitting Gemini (faster, more reliable opening)
                    if (history.length === 0) {
                        ws.send(JSON.stringify({
                            response_id:      message.response_id,
                            content:          "Thanks for calling Pizza Prince — will this be for pickup or delivery?",
                            content_complete: true,
                            end_call:         false,
                        }));
                        return;
                    }

                    // Ask Gemini for a response, (handles tool calls internally)
                    const responseText = await getGeminiResponse(callId, history);

                    // Send Gemini's text back to Retell - Retell speaks it to the caller
                    ws.send(JSON.stringify({
                        response_id:        message.response_id,
                        content:            responseText,
                        content_complete: true,    // We send the full response at once (not streaming)
                        end_call:         false,   // Don't hang up - the AI says goodbye naturally 
                    }));
            } catch (err) {
                console.error('❌ Error handling message from Retell:', err.message);
                // If the order is already in, this is just a bad goodbye — send a clean one.
                // If the order was never submitted, something actually went wrong — apologize.
                const orderDone = submittedCalls.has(callId);
                ws.send(JSON.stringify({
                    response_id:      0,
                    content:          orderDone
                        ? "You're all set! Have a great day!"
                        : 'Sorry, I had a technical issue on my end. Let me get someone to call you right back.',
                    content_complete: true,
                    end_call:         true,
                }));
            }
        });

        // --- Cleanup on Disconnect -------------------------------------------------

        // When the call ends, clean up session and submitted flag.
        ws.on('close', () => {
            sessions.delete(callId);
            submittedCalls.delete(callId);
            console.log(`📴 Session ended: ${callId}`);
            broadcastEvent({ type: 'call_ended', callId });
        });
    });
}

// --- History Sync ----------------------------------------------

// Convert Retell's transcript into Gemini's message format and sync our history.

function syncHistory(history, transcript) {
    history.length = 0; // Clear and rebuild

    for (const turn of transcript) {
        history.push({
            // Retell calls it 'agent', Gemini calls it 'model'
            role:   turn.role === 'agent' ? 'model' : 'user',
            // Gemini uses a 'parts' array, not a plain 'content' string
            parts: [{ text: turn.content }],    
        });
    }
}

// --- Gemini Response ----------------------------------------------

// Send the conversation history to Gemini and get a response.

async function getGeminiResponse(callId, history) {

    while (true) {
        const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            config: {
                // System instruction: the AI's full briefing (personality + menu)
                systemInstruction: SYSTEM_PROMPT,
                // Tools: what functions Gemini is allowed to call
                tools: TOOLS,
                // Keep responses short - this is a real-time phone call
                maxOutputTokens: 256,
            },
            contents: history,
        });

        // Get the first (and usually only) candidate from the response
        const candidate = response.candidates[0];

        // Guard: Gemini sometimes returns a candidate with no content (safety block, etc.)
        if (!candidate?.content?.parts) {
            console.warn('⚠️  Gemini returned no content. Finish reason:', candidate?.finishReason);
            return "Sorry about that, I had a hiccup. Can you repeat that?";
        }

        const parts = candidate.content.parts;

        // Add Gemini's response to history so it has context in the next loop
        history.push({ role: 'model', parts });

        // Check if Gemini wants to call a tool
        const functionCallPart = parts.find(p => p.functionCall);

        if (!functionCallPart) {
            // No tool call - Gemini gave us a text response. We're done.
            // Find the text part and return it.
            const textPart = parts.find(p => p.text);
            return textPart?.text?.trim() || 'Got it, I\'ll get that taken care of.';
        }

        // --- Tool Call Handling -------------------------------------------------

        // Destructure the function call: name = which tool, args = the data
        const { name, args } = functionCallPart.functionCall;
        console.log(`🔧 Tool call: ${name} (call: ${callId})`);

        // Block double-submission — if the order was already submitted this call, bail out
        const isOrderTool = name === 'submit_order' || name === 'SubmitOrderCustomer';
        if (isOrderTool && submittedCalls.has(callId)) {
            console.warn(`⚠️  Duplicate order tool call blocked for ${callId}`);
            return "You're all set — your order is already in. See you soon!";
        }

        // Execute the tool and get a result string
        const result = await executeTool(name, args, callId);

        // Add the function response to history (no id field — not needed in current SDK)
        history.push({
            role: 'user',
            parts: [{
                functionResponse: {
                    name,
                    response: { result },
                },
            }],
        });

        // Loop back - Gemini will now respond knowing what the tool returned
    }
}

// --- Tool Execution ---------------------------------------------------------

// Run a tool that Gemini requested and return the result as a string.
async function executeTool(name, args, callId) {
    try {
        // Handle both the correct name and Gemini's occasional hallucinated alias
        if (name === 'submit_order' || name === 'SubmitOrderCustomer') {
            // POST the order to our own /orders endpoint.
            const response = await fetch(`http://localhost:${process.env.PORT || 3000}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(args),
            });

            const order = await response.json();

            // Mark this call as submitted so we never double-submit
            submittedCalls.add(callId);

            // Fire Telegram notification - don't await it so it doesn't slow the call.
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