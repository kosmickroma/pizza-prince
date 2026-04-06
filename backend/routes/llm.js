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
 * @listens ws://localhost:3000/llm-websocket - Retell connects here per call
 */

// This file is where Gemini and Retell talk to each other
import { WebSocketServer } from 'ws';
import { GoogleGenAI }     from '@google/genai';
import { buildSystemPrompt, TOOLS } from '../config/systemPrompt.js';
import { sendOrderNotification } from '../services/telegram.js';

// --- Gemini Client ------------------------------------------------

// One client for the whole server - created once at startup
// Reads GEMINI_API_KEY from your .env file.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Call buildSystemPrompt() to actually generate the prompt string.
// Just importing the function isn't enough — you have to call it.
const SYSTEM_PROMPT = buildSystemPrompt();

// --- Session Storage ------------------------------------------------

// Each phone call gets its own conversation history.
const sessions = new Map();

// --- Setup Function ---------------------------------------------------------

// Attach the WebSocket server to our Express HTTP server. Called once from server.js after the HTTP is created.
export function setupLLMWebSocket(httpServer) {

    const wss = new WebSocketServer({ server: httpServer, path: '/llm-websocket' });

    console.log('🤖 LLM WebSocket server ready at /llm-websocket');

    // This callback runs every time Retell opens a new WebSocket connection.
    // Each phone call = one new connection.
    wss.on('connection', (ws, req) => {
        console.log('📞 Retell connected for a new call');

        // Extract the call id from the URL query params.
        const url     = new URL(req.url, `http://localhost`);
        const callId  = url.searchParams.get('call_id') || `call_${Date.now()}`;

        // Start with an empty history for this call
        sessions.set(callId, []);
        console.log(`📞 Session started: ${callId}`);

        // --- Incoming Message Handler -------------------------------------------------

        // Runs every time Retell sends us an update during the call
        ws.on('message', async (rawData) => {
            try {
                // Retell sends JSON strings - parse to object
                const message = JSON.parse(rawData.toString());

                // We only respond to 'response_required' - that's when the caller has finished speaking and Retell needs our AI's reply.
                if (message.interaction_type !== 'response_required' &&
                    message.interaction_type !== 'reminder_required') {
                        return;
                    }    
                    
                    // Get this call's history and sync it with Retell's latest transcript
                    const history = sessions.get(callId);
                    syncHistory(history, message.transcript);

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
                // Send a safe fallback so the call doesn't go silent
                ws.send(JSON.stringify({
                    response_id:     0,
                    content:         'Sorry, I had a technical issue on my end. Let me get someone to call you right back.',
                    content_complete: true,
                    end_call:         true,
                }));
            }
        });

        // --- Cleanup on Disconnect -------------------------------------------------

        // When the call ends, delete the session to free up memory.
        ws.on('close', () => {
            sessions.delete(callId);
            console.log(`📴 Session ended: ${callId}`);
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
        const parts     = candidate.content.parts;

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

        // Destructure the function call: name = which tool, args = the data, id = unique call ID
        const { name, args, id } = functionCallPart.functionCall;
        console.log(`🔧 Tool call: ${name} (call: ${callId})`);

        // Execute the tool and get a result string
        const result = await executeTool(name, args);

        // Add the function response to history.
        history.push({
            role: 'user',
            parts: [{
                functionResponse: {
                    name,
                    id,
                    response: { result },
                },
            }],
        });

        // Loop back - Gemini will now respond knowing what the tool returned
    }
}

// --- Tool Execution ---------------------------------------------------------

// Run a tool that Gemini requested and return the result as a string.
async function executeTool(name, args) {
    try {
        if (name === 'submit_order') {
            // POST the order to our own /orders endpoint.
            const response = await fetch(`http://localhost:${process.env.PORT || 3000}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(args),
            });

            const order = await response.json();

            // Fire Telegram notification - don't await it so it doesn't slow the call.
            sendOrderNotification(order).catch(err => 
                console.warn('⚠️  Telegram notification failed:', err.message)
            );

            return `Order ${order.order_id} submitted. Kitchen dashboard updated, owner notified.`;
        }

        return `Unknown tool: ${name}`;     
    } catch (err) {
      console.error(`❌ Tool error (${name}):`, err.message);
    return `Tool failed: ${err.message}`;
    }
}