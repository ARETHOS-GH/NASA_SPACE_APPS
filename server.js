const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend files from your project directory
app.use(express.static(__dirname));

// Ultra-strict system directive to force crisp, concise, executive-level summaries
const SYSTEM_INSTRUCTION = `You are an elite scientific assistant for a NASA Space Apps project.
MANDATORY FORMATTING RULES:
1. **Zero Fluff:** Never use conversational openings (e.g., "Sure, I can help with that!"). Start your response immediately with the core answer.
2. **Concise Bullet Points:** Keep explanations under 4-5 bullet points maximum. Never write dense paragraphs.
3. **High-Impact Bold:** Bold all key terms, metrics, and dates so they can be scanned in 2 seconds.
4. **Structured Tables:** Use a markdown table only for direct comparisons.`;

// Chat API endpoint using OpenRouter's free tier
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, message } = req.body;

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured on Render environment variables." });
    }

    // Build the message array including the strict formatting system prompt
    let chatMessages = [
      { role: "system", content: SYSTEM_INSTRUCTION }
    ];

    if (Array.isArray(messages) && messages.length > 0) {
      chatMessages = chatMessages.concat(messages);
    } else if (message) {
      chatMessages.push({ role: "user", content: message });
    } else {
      chatMessages.push({ role: "user", content: "Hello" });
    }

    // Call OpenRouter API (OpenAI-compatible format)
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://render.com", 
        "X-Title": "NASA Space Apps Project"
      },
      body: JSON.stringify({
        model: "openrouter/free", 
        messages: chatMessages,
        temperature: 0.3 // Lower temperature makes responses more precise and less chatty
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || "OpenRouter error");
    }

    const reply = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    res.json({ reply });

  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Tropos server running at http://localhost:${PORT}`);
});