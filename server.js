const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend files (HTML, CSS, JS, visualization.html)
app.use(express.static(__dirname));

// Initialize Google Gen AI securely from Render's environment variables
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, message } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on Render." });
    }

    // Format incoming messages for Gemini
    let promptContents;
    if (Array.isArray(messages) && messages.length > 0) {
      // Convert standard OpenAI/Groq role format ('user'/'assistant') to Gemini format ('user'/'model')
      promptContents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
    } else {
      promptContents = message || "Hello";
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptContents
    });

    res.json({ reply: response.text || "" });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Tropos server running at http://localhost:${PORT}`);
});