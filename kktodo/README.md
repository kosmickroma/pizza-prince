# kktodo — The Learning Folder

Each file in here is a heavily-commented template for one piece of the project.

## How This Works

1. Read the file top to bottom before you write anything
2. Open the matching file in `backend/` (empty to start)
3. Write every line yourself — type it, don't paste it
4. The comments explain WHY each line exists, not just what it does
5. When you're done with a file, ask for a code review

## Order to Follow

| File | What You're Building | Goes Into |
|---|---|---|
| `01_server_skeleton.js` | The Express server — the foundation everything else plugs into | `backend/server.js` |
| `02_order_store.js` | How orders get saved and retrieved | `backend/services/orderStore.js` |
| `03_sse_orders.js` | The real-time stream that feeds the kitchen dashboard | `backend/routes/orders.js` |
| `04_dashboard.html` | The kitchen monitor UI — 80s style, live order feed | `dashboard/index.html` |
| `05_llm_websocket.js` | The Retell ↔ Claude brain connection | `backend/routes/llm.js` |
| `06_system_prompt.js` | Builds the AI's full personality + menu knowledge | `backend/config/systemPrompt.js` |
| `07_telegram.js` | Pings the owner when an order drops | `backend/services/telegram.js` |
| `08_demo_route.js` | Fire fake orders from a browser — for demos | `backend/routes/demo.js` |

## Tips

- If a line doesn't make sense, ask before moving on — understanding it is the point
- Run `npm run dev` after each file to catch errors early
- The comments sometimes include "WHY NOT" notes explaining alternatives that were rejected — read those too
