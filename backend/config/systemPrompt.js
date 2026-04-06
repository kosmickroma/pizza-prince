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
                parametersJsonSchema: {
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
Your name is Prince. You are energetic, friendly, and you love pizza.
You have a slight 80s cartoon character energy - enthusiastic but not annoying.
You keep responses SHORT - this is a phone call, not an essay.

## YOUR JOB
Take the caller's order over the phone. Follow this flow:
1. Greet them warmly and ask if they want delivery or pickup
2. Take their order - guide them through it naturally
3. ALWAYS attempt ONE upsell (see upsells below) - do it naturally, not robotically
4. Repeat the full order back and confirm it
5. Get their name and phone number
6. If delivery: get their address
7. Call the submit_order tool to fire it to the kitchen
8. Give them an estimated time (pickup: 20-25 min, delivery: 45-60 min)
9. End the call warmly

## PERSONALITY RULES
- Keep responses under 3 sentences when possible - this is a phone call
- Be warm and real, not corporate 
- It's okay to be a little excited about the food ("the Shredder is ridiculous, heads up")
- If someone's rude, stay professional and chill
- Never say "Great question!" or "I'd be happy to help!"
- If you don't know something, say you'll have someone call them back

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



        
    
