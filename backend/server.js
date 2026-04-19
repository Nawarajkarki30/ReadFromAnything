// ============================================================
// server.js — Study From Anything Backend
// ------------------------------------------------------------
// This is the Node.js + Express server that:
//   1. Listens for requests from the frontend
//   2. Calls the Google Gemini AI API
//   3. Sends back summaries, flashcards, or quizzes
// ============================================================

// --- Load required packages ---
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config(); // Loads your .env file (where your API key lives)
const db = require("./db"); // Local SQLite Database
const multer = require("multer");
const pdfParse = require("pdf-parse");

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // Optional: 50MB limit
});

// --- Create the Express app ---
const app = express();
const PORT = 3001; // The server will run on http://localhost:3001

// --- Middleware ---
app.use(cors());
const path = require("path");
// Serve the frontend folder as static files at http://localhost:3001
app.use(express.static(path.join(__dirname, "../frontend")));

// --- Set up Gemini AI ---
// Your API key is stored safely in the .env file as GEMINI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Basic in-memory rate limiting (bug 13)
const requestCounts = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const max = 10; // Max 10 AI requests per minute per IP
  const entry = requestCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    requestCounts.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count++;
  requestCounts.set(ip, entry);
  return entry.count > max;
}

// ============================================================
// PROMPTS — Helper to construct AI instructions
// ============================================================
function getPrompt(mode, depth) {
  if (mode === "summary") {
    return `You are a highly structured study assistant. Read the following text and generate an extremely detailed, high-yield study guide. 
Use Markdown headers (###), bold text, and bullet points to format the response beautifully.
Provide approximately ${depth} individual highlights or concepts. Organize it into:
1. Executive Summary
2. Key Concepts
3. Important Terms/Dates
Do not add conversational fluff.`;
  }
  
  if (mode === "flashcards") {
    return `You are a helpful study assistant. Read the following text and create exactly ${depth} flashcards focusing on the most important definitions, concepts, and takeaways. Format your response strictly as a JSON array of objects, where each object has a "question" and "answer" field.`;
  }
  
  if (mode === "quiz") {
    return `You are a helpful study assistant. Read the following text and create a comprehensive multiple-choice exam of exactly ${depth} questions covering the core material. Format your response strictly as a JSON array of objects, where each object has:
  - "question": the question text
  - "options": an array of exactly 4 strings
  - "correct": the integer index (0-3) of the correct answer
  - "explanation": a short sentence explaining why this answer is correct.`;
  }
}
// Helper: extract a clean, readable title from raw text
function extractTitle(text) {
  // Prefer the first non-empty sentence or line
  const firstLine = text.split(/[\n.!?]/)[0]?.trim().replace(/^#+\s*/, "") || "";
  return firstLine.length > 5 ? firstLine.substring(0, 50) : "Untitled Study Set";
}
// ============================================================
// POST /generate — Main endpoint
// ============================================================
app.post("/generate", upload.single("pdfFile"), async (req, res) => {
  // Rate limiting check (bug 13)
  const clientIp = req.ip || req.connection.remoteAddress;
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute before trying again." });
  }

  try {
    const mode = req.body.mode;
    const depth = req.body.depth || 10;
    let text = req.body.text || "";

    // If a PDF was uploaded, safely parse it entirely on the backend!
    if (req.file) {
      console.log(`[API] Native backend parsing of securely uploaded PDF: ${req.file.originalname}`);
      const pdfData = await pdfParse(req.file.buffer);
      text = pdfData.text;
    }

    // --- Basic validation ---
    if (!text || text.trim().length === 0) {
      // NOTE: We don't want to break the SSE stream headers if it fails early, but we evaluate this before headers are sent.
      return res.status(400).json({ error: "No text provided. Please upload a PDF or paste some text." });
    }

    if (!["summary", "flashcards", "quiz"].includes(mode)) {
      return res.status(400).json({ error: "Invalid mode. Choose: summary, flashcards, or quiz." });
    }

    console.log(`[API] Received request for mode: ${mode} | Text length: ${text.length} chars | Depth: ${depth}`);

    // Check if API key is set
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
      // Fix bug 14: placeholder also needs to work for streaming summary mode
      if (mode === "summary") {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(`data: ${JSON.stringify({ meta: true, isTruncated: false })}\n\n`);
        res.write(`data: ${JSON.stringify({ chunk: getPlaceholderResponse("summary") })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }
      return res.json({ result: getPlaceholderResponse(mode), isPlaceholder: true });
    }

    // --- Build the full prompt: instruction + user text ---
    const MAX_CHARS = 100000; // Increased limit to 100k chars (~25k tokens)
    const isTruncated = text.length > MAX_CHARS;
    const promptInstructions = getPrompt(mode, depth);
    const fullPrompt = `${promptInstructions}\n\n--- TEXT TO STUDY ---\n${text.substring(0, MAX_CHARS)}`;

    // --- Call Gemini AI ---
    // For summaries, we stream the response for a beautiful loading experience!
    if (mode === "summary") {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
        const resultStream = await model.generateContentStream(fullPrompt);

        // Send metadata first
        res.write(`data: ${JSON.stringify({ meta: true, isTruncated })}\n\n`);

        let fullGeneratedText = "";
        for await (const chunk of resultStream.stream) {
          const chunkText = chunk.text();
          fullGeneratedText += chunkText;
          res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
        }
        
        // Save to Database with a smart readable title
        const setId = uuidv4();
        await db.saveSet(setId, extractTitle(text), mode, fullGeneratedText);
        console.log(`[DB] Saved ${mode} set: "${extractTitle(text)}"`);

        res.write(`data: [DONE]\n\n`);
        res.end();
        return; // End execution early for streams
      } catch (err) {
        console.error("Stream error:", err);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
        return;
      }
    }

    // For flashcards/quiz, force the AI to return 100% valid JSON automatically!
    const generationConfig = { responseMimeType: "application/json" };
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig }); 
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const aiText = response.text();

    // Save to Database with a smart readable title
    const setId = uuidv4();
    await db.saveSet(setId, extractTitle(text), mode, aiText);
    console.log(`[DB] Saved ${mode} set: "${extractTitle(text)}"`);

    res.json({ result: aiText, isPlaceholder: false, isTruncated, setId });

  } catch (error) {
    console.error("❌ Error calling Gemini API:", error.message);

    // Send a friendly error message to the frontend
    res.status(500).json({
      error: "The AI service encountered an error. Please check your API key and try again.",
      details: error.message,
    });
  }
});

// ============================================================
// PLACEHOLDER RESPONSES — Used when no API key is set
// ============================================================
function getPlaceholderResponse(mode) {
  if (mode === "summary") {
    return `• This is a placeholder summary (no API key detected)
• Your uploaded text would be summarized into 5 simple bullet points
• Each bullet point covers a key idea from the content
• The AI keeps language simple and beginner-friendly
• Add your GEMINI_API_KEY to the .env file to get real results`;
  }

  if (mode === "flashcards") {
    return JSON.stringify([
      { question: "What is this app?", answer: "Study From Anything — an AI-powered study tool" },
      { question: "How does it work?", answer: "Upload a PDF or paste text, then generate summaries, flashcards, or quizzes" },
      { question: "What AI does it use?", answer: "Google Gemini AI (free tier available)" },
      { question: "How do I get real flashcards?", answer: "Add your GEMINI_API_KEY to the backend/.env file" },
      { question: "Is it mobile friendly?", answer: "Yes! The UI is fully responsive and works on all devices" },
    ]);
  }

  if (mode === "quiz") {
    return JSON.stringify([
      {
        question: "What is 'Study From Anything'?",
        options: ["A social network", "An AI study assistant", "A video platform", "A music app"],
        correct: 1,
      },
      {
        question: "Which AI model powers this app?",
        options: ["ChatGPT", "Claude", "Google Gemini", "Llama"],
        correct: 2,
      },
      {
        question: "What file format can you upload?",
        options: ["DOCX", "MP3", "PDF", "ZIP"],
        correct: 2,
      },
      {
        question: "Where should you put your API key?",
        options: ["In script.js", "In index.html", "In backend/.env", "In style.css"],
        correct: 2,
      },
      {
        question: "What does the 'Generate Summary' button do?",
        options: ["Uploads a file", "Creates bullet-point summaries", "Opens a quiz", "Deletes text"],
        correct: 1,
      },
    ]);
  }
}

// ============================================================
// Health check endpoint — visit http://localhost:3001/health
// ============================================================
app.get("/health", (req, res) => {
  res.json({ status: "✅ Server is running!", port: PORT });
});

// ============================================================
// GET /history — Fetch previously saved study sets
// ============================================================
app.get("/api/history", async (req, res) => {
  try {
    const history = await db.getAllSets();
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch history" });
  }
});

app.get("/api/history/:id", async (req, res) => {
  try {
    const set = await db.getSetById(req.params.id);
    if (!set) return res.status(404).json({ error: "Not found" });
    res.json(set);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch item" });
  }
});

// Bug 6: Delete a study set from the library
app.delete("/api/history/:id", async (req, res) => {
  try {
    await db.deleteSet(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Could not delete item" });
  }
});

// --- Start the server ---
app.listen(PORT, () => {
  console.log(`\n✅ Study From Anything backend is running!`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${process.env.GEMINI_API_KEY ? "Detected ✓" : "Not set (using placeholders)"}\n`);
});
