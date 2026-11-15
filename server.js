const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend files (HTML, CSS, JS, visualization.html)
app.use(express.static(__dirname));

// Initialize Gemini with your environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, message } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on Render environment variables." });
    }

    // Use the reliable gemini-1.5-flash model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Extract the text prompt from either single message or array
    let promptText = message;
    if (!promptText && Array.isArray(messages) && messages.length > 0) {
      promptText = messages[messages.length - 1].content;
    }
    promptText = promptText || "Hello";

    const result = await model.generateContent(promptText);
    const response = await result.response;
    const text = response.text();

    res.json({ reply: text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Tropos server running at http://localhost:${PORT}`);
});