const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend files from your project directory
app.use(express.static(__dirname));

// System instruction to enforce clean, concise, structured formatting from the AI
const SYSTEM_INSTRUCTION = `You are an expert science communicator and technical assistant for a NASA Space Apps project.
Formatting Rules:
1. Be extremely concise, direct, and professional.
2. Avoid long, cluttered paragraphs. Use bullet points and bold text for key terms.
3. Use markdown tables when comparing data or trends.
4. Do not include chatty filler introductions; get straight to the facts.`;

// Chat API endpoint using OpenRouter's free tier
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, message } = req.body;

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured on Render environment variables." });
    }

    // Build the message array including the system prompt directive
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
        model: "openrouter/free", // Automatically selects an available free model
        messages: chatMessages
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