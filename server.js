const express = require('express');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend files from your project folder (HTML, CSS, JS, visualization.html)
app.use(express.static(__dirname));

// Initialize the Groq SDK securely using Render's environment variables
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, message } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server environment variables." });
    }

    // Support both array of messages or single message payloads from frontend
    let chatMessages = messages;
    if (!chatMessages && message) {
      chatMessages = [{ role: "user", content: message }];
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", // Active, supported production model
      messages: chatMessages || [{ role: "user", content: "Hello" }]
    });

    res.json({ reply: completion.choices[0]?.message?.content || "" });
  } catch (error) {
    console.error("Groq API Error Response:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Tropos server running at http://localhost:${PORT}`);
});