# ⚡ Study From Anything

> Upload any PDF or paste text → Get AI-powered summaries, flashcards & quizzes instantly.

---

## 🗂️ Project Structure

```
Study From Anything/
├── frontend/
│   ├── index.html     ← The web page
│   ├── style.css      ← All the styling
│   └── script.js      ← Frontend logic (PDF reading + API calls)
│
├── backend/
│   ├── server.js      ← Express server + Gemini AI integration
│   ├── package.json   ← Node.js dependencies
│   └── .env           ← Your secret API key (never share this!)
│
└── README.md          ← This file
```

---

## 🚀 How to Run Locally

### Step 1 — Add your Gemini API key

1. Go to https://aistudio.google.com/app/apikey
2. Click **Create API Key** (it's free!)
3. Open `backend/.env` and replace:
   ```
   GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
   ```
   with your actual key.

### Step 2 — Start the backend server

Open a terminal and run:
```bash
cd backend
npm start
```

You should see:
```
✅ Study From Anything backend is running!
🌐 URL: http://localhost:3001
🔑 API Key: Detected ✓
```

### Step 3 — Open the frontend

Open `frontend/index.html` in your browser.

> 💡 Tip: Use VS Code's **Live Server** extension for the best experience.
> Or simply double-click the `index.html` file.

---

## 🌐 Free Deployment

### Frontend → Netlify (free)
1. Go to https://netlify.com
2. Drag & drop your `frontend/` folder
3. Done! You get a live URL.

### Backend → Render (free)
1. Push your code to GitHub
2. Go to https://render.com
3. Create a new **Web Service**
4. Select your repo, set root to `backend/`
5. Add environment variable: `GEMINI_API_KEY=your_key`
6. Deploy!

> ⚠️ After deploying the backend, update `BACKEND_URL` in `frontend/script.js` to your Render URL.

---

## 🛠️ Tech Stack

| Layer    | Technology              |
|----------|-------------------------|
| Frontend | HTML, CSS, JavaScript   |
| PDF Read | PDF.js (in-browser)     |
| Backend  | Node.js + Express       |
| AI       | Google Gemini 1.5 Flash |

---

## 💡 Features

- 📄 Upload any PDF — text extracted instantly in-browser
- ✏️ Paste text directly into the text area
- 📝 **Summary** — 5 key bullet points
- 🧠 **Flashcards** — 5 flip cards (click to reveal answer)
- 🎯 **Quiz** — 5 MCQs with instant scoring
- 🌙 Dark mode UI with smooth animations
- 📱 Fully mobile responsive
