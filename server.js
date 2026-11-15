const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend files
app.use(express.static(__dirname));

// Chat API endpoint using OpenRouter's free tier
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, message } = req.body;

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(500).json({ error: "OPENROUTER_API_KEY is not configured on Render." });
    }

    let chatMessages = messages;
    if (!chatMessages && message) {
      chatMessages = [{ role: "user", content: message }];
    }

    // Call OpenRouter API (OpenAI-compatible format)
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://render.com", // Optional, helps OpenRouter rank apps
        "X-Title": "NASA Space Apps Project"
      },
      body: JSON.stringify({
        model: "openrouter/free", // Automatically selects an available free model
        messages: chatMessages || [{ role: "user", content: "Hello" }]
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