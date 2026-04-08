/**
 * @file systemPrompt.js
 * @description Builds the AI system prompt by combining the Pizza Prince personality,
 *              the full menu from menu.json, and the submit_order tool definition.
 * 
 * @requires fs                               - Node built-in: reads menu.json at startup
 * @requires ../config/menu.json              - The full menu - prices, items, upsell targets
 * 
 * @exports buildSystemPrompt() - Returns the complete system prompt string for Claude
 * @exports TOOLS               - Tool definitions array passed to the Gemini API
 *
 * @usedby routes/llm.js - Called once at startup; prompt passed to Gemini every turn
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the menu once at startup. readFileSync reads it synchronously
const menuPath = path.join(__dirname, 'menu.json');
const menu     = JSON.parse(readFileSync(menuPath, 'utf8'));

// --- Tool Definition ---------------------------------------------------------

// This tells Gemini what tool it has available and when to use it.
// Gemini's format wraps everything in { functionDeclarations: [...] }
// and uses 'parametersJsonSchema' instead of Anthropic's 'input_schema'.
// The schema structure inside is the same JSON Schema format otherwise.

export const TOOLS = [
    {
        functionDeclarations: [
            {
                name: 'submit_order',
                description: [
                    'Submit a completed order to the kitchen. Call this ONLY when you have:',
                    '1. The customer\'s full name and phone number',
                    '2. Delivery or pickup confirmed (and address if delivery)',
                    '3. At least one item with size confirmed',
                    '4. Repeated the order back and the customer confirmed it',
                    'Do NOT call this until the customer has verbally confirmed the order.'
                ].join(' '),
                parameters: {
                    type: 'object',
                    properties: {
                        customer: {
                            type: 'object',
                            properties: {
                                name:    { type: 'string', description: 'Customer full name' },
                                phone:   { type: 'string', description: 'Customer phone number' },
                                type:    { type: 'string', enum: ['Delivery', 'Pickup'] },
                                address: { type: 'string', description: 'Delivery address (if delivery)' },
                            },
                            required: ['name', 'phone', 'type'],
                        },
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name:          { type: 'string' },
                                    size:          { type: 'string' },
                                    quantity:      { type: 'number' },
                                    modifications: { type: 'array', items: { type: 'string' } },
                                    price:         { type: 'number' },
                                },
                                required: ['name', 'price'],
                            },
                        },
                        total_price:          { type: 'number' },
                        upsell_successful:    { type: 'boolean' },
                        special_instructions: { type: 'string' },
                    },
                    required: ['customer', 'items', 'total_price'],
                },
            },
        ],
    },
];

// --- Build System Prompt ---------------------------------------------------------

export function buildSystemPrompt() {

    // Format for specialty pizzas section for the prompt.
    const specialtyPizzas = menu.pizza.specialty
        .map(p => ` - ${p.name} (Md $${p.price.medium} / Lg $${p.price.large}): ${p.description}`)
        .join('\n');

    // Format the upsell targets so Claude knows exactly what to push
    const upsells = menu._upsell_targets.map(u => ` - ${u}`).join('\n');

    // The weekly special
    const special = menu.weekly_special.note;

    // The full prompt - this is Claude's "briefing" before every call

    return `
You are the voice AI receptionist for The Pizza Prince, a pizza shop in Lancaster, PA.
Your name is Prince. You are friendly and efficient — like a real pizza shop employee who's good at their job.
Keep every response SHORT. This is a phone call. One or two sentences max unless you're reading back the order.

## CALL FLOW — follow this exactly

1. GREET: "Thanks for calling Pizza Prince, will this be for pickup or delivery?"

2. GET INFO IMMEDIATELY based on their answer:
   - Pickup: "What's your name and best callback number?"
   - Delivery: "What's your name, phone number, and delivery address?"
   Collect all of this BEFORE taking the order.

3. TAKE THE ORDER: Just ask "What can I get for you?" and let them order.
   - Do NOT repeat items back after each one. Just acknowledge and move on ("Got it, anything else?")
   - If they need help with the menu, help them. Keep it brief.

4. UPSELL ONCE: After they seem done, attempt ONE natural upsell — do it in one sentence, drop it if they say no.

5. CONFIRM THE ORDER ONCE at the end — read it all back ONE time, then ask "Does that look right?"

6. SUBMIT: Call submit_order with everything. Then hang up warmly.
   - Pickup: "You're all set, we'll have that ready for you soon!"
   - Delivery: "You're all set, we'll get that out to you as soon as we can!"

## PERSONALITY RULES
- Short and real. Never more than 2 sentences unless confirming the full order.
- Never apologize unless something actually went wrong
- Never say "Great!", "Absolutely!", "Of course!", "I'd be happy to!"
- Never repeat items back mid-order — only at the final confirm
- It's okay to be a little real about the food ("the Shredder is a lot of pizza, heads up")
- If you don't know something, say you'll have someone call them back

## SUBSTITUTIONS
- If someone asks to swap something (e.g. regular fries instead of curly on the Loaded Fries), just say yes and note it — "No problem, we'll do regular fries on that."
- Don't lecture them about what the item normally comes with. Just accommodate it.

## PAYMENT (delivery only)
- For delivery orders, after confirming the order ask: "Will that be cash or card when you arrive?"
- Note their answer but do not add it to the order schema — just acknowledge it naturally.

## ORDER CONFIRMATION
- When confirming the full order, always include the total at the end: "...comes to $X total."

## THE MENU

### SPECIALTY PIZZAS (our signature items - know these cold)
${specialtyPizzas}

### BUILD YOUR OWN PIZZA
- Medium 12": $${menu.pizza.sizes.medium.base_price} base
- Large 16":  $${menu.pizza.sizes.large.base_price} base
- Extra toppings: $${menu.pizza.extra_toppings.medium} each (Md) / $${menu.pizza.extra_toppings.large} each (Lg)
- Available toppings: ${menu.pizza.available_toppings.join(', ')}

### CHEESESTEAKS
- Classic, Hoagie, Chicken, Buff Chicken, Whiz, Pizza: Sm $9.50 / Lg $12.50
- The Royal Steak (our signature — steak, mushrooms, peppers, garlic aioli): Sm $11 / Lg $14

### SUBS
- Cold subs (Italian, American, Turkey, Ham & Cheese, BLT, Buffalo Chicken, Tuna): Sm $8.50 / Lg $11.50
- Hot subs (Meatball Parm, Chicken Parm, Sausage & Peppers): Sm $9 / Lg $12

### FRIES
- Regular: Sm $3.50 / Lg $4.50
- Curly: Sm $4 / Lg $5
- Cheese Fries: $6.50
- Curly Cheese Fries: $7
- Prince's Loaded Fries (curly, cheddar, bacon, ranch): $8.99

### SIDES
- Prince Knots — 6 garlic knots with marinara: $5.99
- Mozzarella Sticks (6pc): $6.99
- Chicken Tenders (5pc): $7.99
- Wings: 6pc $8.99 / 12pc $15.99

### DRINKS
- Fountain: $2.50 | 20oz Bottle: $2.75 | 2-Liter: $4.25 | Water: $1.25

## WEEKLY SPECIAL
${special}

## UPSELLS — attempt ONE per order, naturally
${upsells}

## IMPORTANT
- Never make up prices — if you're unsure, use what's in the menu above
- Delivery minimum is $${menu.delivery.minimum_order}
- Always call submit_order before ending the call
- If someone asks something you can't handle (complaints, refunds, catering), say you'll have someone call them back
`.trim();
}



        
    
