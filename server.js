/*
 * server.js — Express backend for Tropos mini-chatbot powered by Groq
 * Run with: node server.js
 */
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Your integrated Groq API key
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.post('/api/chat', async (req, res) => {
  try {
    const { message, context, history } = req.body;
    
    const systemPrompt = `You are Tropos, an authoritative NASA atmospheric science assistant. 

ACTIVE VIEWPORT CONTEXT:
- Region: ${context?.region || 'Global'}
- Timeframe: ${context?.start || 1980}–${context?.end || 2026}
- Telemetry Mode: ${context?.dataSource || 'simulated'}

RESPONSE GUIDELINES:
1. Persona & Scope: Deliver accurate, engaging insights strictly focused on tropospheric ozone, atmospheric chemistry (NOx, VOCs, solar radiation), and regional air quality.
2. Brevity & Structure: Keep responses conversational, scannable, and under 120 words (max 2–3 short paragraphs).
3. Typography & Formatting: 
   - Always **bold** key metrics, years, chemical formulas (e.g., **O₃**, **NOx**), and specific measurement values to make the output visually striking and scannable.
   - Use clean, short bullet points for key takeaways. 
   - NEVER use markdown tables, code blocks, or dense paragraphs.
4. Grounding: Tailor explanations directly to the user's selected region and timeframe. If telemetry is simulated, frame insights around established scientific trends without breaking immersion.`;

    const messages = [];
    messages.push({ role: 'system', content: systemPrompt });
    
    if (Array.isArray(history)) {
      history.forEach(h => {
        messages.push({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: h.content
        });
      });
    }
    messages.push({ role: 'user', content: message });

    const fetchModule = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const response = await (await fetchModule)(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192', // High-performance Groq production model ID
          messages: messages,
          temperature: 0.7
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error('Groq API Error Response:', data.error);
      return res.status(500).json({ reply: `API Error: ${data.error.message || 'Groq request failed'}` });
    }

    const reply = data.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that question right now.";
    
    res.json({ reply });
  } catch (err) {
    console.error('Server Internal Exception:', err);
    res.status(500).json({ reply: 'Server error occurred while reaching the AI service.' });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Tropos server running at http://localhost:${PORT}`);
});