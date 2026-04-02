# 🍕 The Pizza Prince — Master Plan

> "Never miss another Friday night rush."
> 
> A voice AI phone receptionist for a local pizza shop. 1987 Saturday Morning Cartoon energy.
> Named after a deep-cut Ninja Turtles episode where a turtle had to work off a debt at a pizza shop.

---

## The Concept

AI answers every inbound call, takes the full order (including upsells), and streams it to a kitchen dashboard in real time. Owner gets a Telegram ping the moment an order is confirmed. No more missed calls. No more pencil-and-paper tickets.

This is a demo targeting Lancaster PA local businesses — but built like a real product.

---

## The Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Voice (STT/TTS) | Retell AI | Handles the phone call voice layer |
| Telephony | Twilio | Routes calls, user already has a number |
| LLM Brain | Claude Haiku (or Gemini Flash) | Fast + cheap for real-time voice latency |
| Backend | Node.js / Express | Handles Retell webhooks + all logic |
| Kitchen Display | Custom HTML/CSS/JS + SSE | Full aesthetic control, no Python dep |
| Owner Alerts | Telegram Bot API | Instant order pings to phone |
| Dev tunneling | ngrok | Exposes local server to Retell during dev |

> **Note on Gemini:** User has credits — worth evaluating Gemini Flash vs Claude Haiku when we get to Phase 2. Both are fast/cheap. Decide based on which handles structured tool calls better at the time.

---

## How Retell + Claude Actually Work Together

```
Phone Call
    │
    ▼
Twilio (routes call) 
    │
    ▼
Retell AI (STT: converts speech → text)
    │
    ▼  [WebSocket: sends transcript]
Express Server /llm-websocket
    │
    ▼
Claude Haiku (reads system prompt + menu, generates response + tool calls)
    │
    ├──▶ submit_order tool → logs order → SSE → Kitchen Dashboard
    │                                   └──▶ Telegram ping to owner
    │
    ▼  [WebSocket: sends response text back]
Retell AI (TTS: converts text → speech)
    │
    ▼
Caller hears the response
```

**Retell = ears and mouth. Claude = the actual employee.**

---

## The Order Schema

```json
{
  "order_id": "PP-0042",
  "timestamp": "2026-04-02T20:15:00Z",
  "customer": {
    "name": "Kory",
    "phone": "717-555-1212",
    "type": "Delivery",
    "address": "123 N Queen St, Lancaster, PA 17603"
  },
  "items": [
    {
      "name": "The Shredder",
      "size": "Large",
      "modifications": ["No Onions", "Extra Cheese"],
      "price": 22.50
    },
    {
      "name": "Prince Knots",
      "quantity": 1,
      "price": 5.99
    }
  ],
  "total_price": 28.49,
  "upsell_successful": true,
  "special_instructions": "Leave at door"
}
```

---

## Repo Structure

```
the-pizza-prince/
├── kktodo/                    # Learning templates — commented code to copy+learn from
│   ├── 01_server_skeleton.js
│   ├── 02_llm_websocket.js
│   ├── 03_order_tools.js
│   ├── 04_sse_dashboard.js
│   └── 05_telegram_notify.js
│
├── backend/
│   ├── server.js              # Express app entry point
│   ├── routes/
│   │   ├── llm.js             # Retell WebSocket endpoint (/llm-websocket)
│   │   ├── orders.js          # Order logging + SSE stream (/orders/stream)
│   │   └── demo.js            # Demo mode — trigger fake orders from browser
│   ├── services/
│   │   ├── claude.js          # Claude Haiku client + streaming
│   │   ├── telegram.js        # Telegram notification sender
│   │   └── orderStore.js      # In-memory + file persistence for orders
│   └── config/
│       ├── systemPrompt.js    # Builds the full system prompt from menu + personality
│       └── menu.json          # THE SOURCE OF TRUTH — all items, prices, upsells
│
├── dashboard/
│   └── index.html             # Kitchen monitor — 80s aesthetic, real-time SSE
│
├── docs/
│   ├── architecture.png       # System diagram for README
│   └── screenshots/           # Dashboard + demo screenshots for README
│
├── assets/
│   └── logo.png               # The sick 80s logo
│
├── .env.example               # All required env vars (no values)
├── .gitignore
├── README.md                  # Demo GIF at top, architecture, quick start
└── ARCHITECTURE.md            # Deep dive on how all the pieces connect
```

**Gitignore:** `.env`, `node_modules/`, `data/` (live order files), `*.log`, call recordings

---

## Master Roadmap / Checklist

### Phase 0 — Foundation (No Code Yet)
- [ ] Gather Lancaster PA pizza menus
- [ ] Design our own menu (names, prices, sizes, toppings, sides, weekly special)
- [ ] Sign up for Retell free trial
- [ ] Confirm Twilio number routes to Retell correctly
- [ ] Create Telegram bot via BotFather (get token + chat ID)
- [ ] Decide: Claude Haiku vs Gemini Flash for the LLM
- [ ] Sketch dashboard aesthetic (colors, fonts, layout)
- [ ] Finalize order schema (above is a starting point)
- [ ] Init git repo, push empty skeleton to GitHub

### Phase 1 — Project Skeleton
- [ ] `package.json` + install dependencies
- [ ] `.env.example` with all required keys
- [ ] Express server with health check endpoint
- [ ] Folder structure created
- [ ] `menu.json` fully populated
- [ ] README stub with concept description

### Phase 2 — Retell + AI Brain
- [ ] Custom LLM WebSocket endpoint (`/llm-websocket`)
- [ ] System prompt builder (loads menu + personality)
- [ ] Session state management (conversation history per call ID)
- [ ] LLM integration with streaming response
- [ ] `submit_order` tool definition
- [ ] `submit_order` tool handler (logs + broadcasts)
- [ ] ngrok setup + Retell agent configured to point at our server
- [ ] First live test call

### Phase 3 — Order Pipeline
- [ ] Order schema validation
- [ ] Order ID generation (PP-XXXX format)
- [ ] Write order to `data/orders.json`
- [ ] SSE broadcast on new order

### Phase 4 — Kitchen Dashboard
- [ ] Express serves `dashboard/index.html`
- [ ] SSE endpoint (`/orders/stream`)
- [ ] 80s aesthetic CSS (neon colors, dark bg, pixel/arcade font)
- [ ] Orders render as receipt-style "tickets"
- [ ] Demo mode endpoint (`POST /demo/order`) — fire fake order from browser
- [ ] "NEW ORDER" animation/sound effect

### Phase 5 — Telegram Notifications
- [ ] Telegram bot connected
- [ ] Order summary formatted nicely
- [ ] Fires on every completed `submit_order` tool call
- [ ] End-to-end test (call → order → dashboard + Telegram)

### Phase 6 — Polish + Public Repo
- [ ] Weekly special logic (easy swap in menu.json)
- [ ] Upsell tuning in system prompt
- [ ] Demo video/GIF recorded
- [ ] Architecture diagram created
- [ ] README polished with screenshots + quick start
- [ ] kktodo/ cleaned up with good comments
- [ ] Final gitignore + secrets audit before going public

---

## Design Notes — The Aesthetic

**Kitchen dashboard vibes:**
- Background: near-black (`#0a0a0a` or `#0d0d1a`)
- Accent: hot neon green (`#39ff14`) or pizza orange (`#ff6b00`)  
- Font: something pixel/arcade — Google Fonts has "Press Start 2P"
- Orders appear as glowing receipt tickets, newest at top
- A subtle "ORDER RECEIVED" flash animation when a new ticket drops
- Maybe a small 80s-style pizza sprite in the corner

**Voice personality notes (for the system prompt — to be designed):**
- Name TBD — should feel like a character, not a robot
- Lancaster PA flavor — knows the area, friendly
- Upsell natural, not pushy — "want me to upgrade that to a large, only $3 more?"
- Confirms the order back before submitting — "so that's a large Shredder, extra cheese, delivery to..."

---

## On OpenClaw

Building with OpenClaw for dev speed. The Pizza Prince is a **standalone Node.js project** — it does NOT touch the main OpenClaw agent (Flash/Rose Tattoo). 

For a real customer deployment, the plan would be to migrate off OpenClaw entirely — replace any OpenClaw-specific agent hooks with direct code. The core logic (order processing, menu, tools) is designed to be portable from day one.

**The tebori project and main agent must never be touched by this project.**

---

*Last updated: 2026-04-02*
