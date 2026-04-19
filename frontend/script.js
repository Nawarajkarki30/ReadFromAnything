// ============================================================
// script.js — Study From Anything Frontend Logic
// ------------------------------------------------------------
// This file handles:
//   1. PDF text extraction (using PDF.js library)
//   2. Sending text to the backend server
//   3. Displaying results (summary, flashcards, quiz)
//   4. All UI interactions (loading, errors, copy, etc.)
// ============================================================

// No BACKEND_URL needed — all requests use relative paths (/generate, /api/history)

// ---- State Variables ----
let currentMode = "";     // "summary", "flashcards", or "quiz"
let quizData = [];        // Holds quiz questions for scoring
let flashcardsData = [];  // Holds flashcard data for copying
let currentCardIndex = 0; // Tracks which flashcard is currently showing



// ============================================================
// SECTION 2: DOM References (grab HTML elements)
// ============================================================
const pdfInput     = document.getElementById("pdf-input");
const uploadArea   = document.getElementById("upload-area");
const uploadLabel  = document.getElementById("upload-label");
const pdfStatus    = document.getElementById("pdf-status");
const pdfStatusText= document.getElementById("pdf-status-text");
const textInput    = document.getElementById("text-input");
const charCount    = document.getElementById("char-count");
const inputError   = document.getElementById("input-error");
const inputErrorText = document.getElementById("input-error-text");
const loadingEl    = document.getElementById("loading");
const loadingText  = document.getElementById("loading-text");
const outputSection= document.getElementById("output-section");
const outputTitle  = document.getElementById("output-title");
const demoBadge    = document.getElementById("demo-badge");
const truncationBadge = document.getElementById("truncation-badge");

// Output containers
const summaryOutput    = document.getElementById("summary-output");
const summaryList      = document.getElementById("summary-list");
const flashcardsOutput = document.getElementById("flashcards-output");
const deckStage        = document.getElementById("deck-stage");
const deckCounter      = document.getElementById("deck-counter");
const btnPrev          = document.getElementById("btn-prev");
const btnNext          = document.getElementById("btn-next");
const quizOutput       = document.getElementById("quiz-output");
const quizContainer    = document.getElementById("quiz-container");
const quizActions      = document.getElementById("quiz-actions");
const quizScore        = document.getElementById("quiz-score");

let uploadedPdfFile = null;

// ============================================================
// SECTION 3: PDF UPLOAD HANDLING
// ============================================================
pdfInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    showInputError("Please upload a PDF file (.pdf)");
    return;
  }

  attachPDF(file);
});

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("drag-over");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");

  const file = e.dataTransfer.files[0];
  if (!file) return;

  if (file.type !== "application/pdf") {
    showInputError("Drag & drop only supports PDF files.");
    return;
  }

  attachPDF(file);
});

function attachPDF(file) {
  uploadedPdfFile = file;
  uploadLabel.hidden = true;
  pdfStatus.hidden = false;
  document.getElementById("pdf-status-text").innerHTML = `
    ✅ <strong>${file.name}</strong> attached for secure AI backend parsing.
    <button onclick="clearPdf()" style="margin-left:1rem; cursor:pointer; background:none; border:1px solid var(--border); padding:0.2rem 0.5rem; border-radius:4px; font-size:0.8rem; color:var(--coral);">Remove</button>
  `;
  hideInputError();
  
  // Disable text area when PDF is provided
  textInput.value = "";
  textInput.placeholder = "A huge PDF is securely attached for deep AI processing. Click a generation button below to start.";
  textInput.disabled = true;
  updateCharCount();
}

// Ensure this function is globally available
window.clearPdf = function() {
  uploadedPdfFile = null;
  uploadLabel.hidden = false;
  pdfStatus.hidden = true;
  pdfInput.value = ""; // Reset input
  textInput.disabled = false;
  textInput.placeholder = "Paste your notes, article, or any study material here...";
  updateCharCount();
};

// ============================================================
// SECTION 4: TEXT INPUT HANDLING
// ============================================================

// Update character count as user types
textInput.addEventListener("input", () => {
  updateCharCount();
  if (textInput.value.trim().length > 0) hideInputError();
});

function updateCharCount() {
  charCount.textContent = textInput.value.length.toLocaleString();
}

// ============================================================
// SECTION 5: MAIN GENERATE FUNCTION
// ============================================================
// This is called when the user clicks Summary, Flashcards, or Quiz
async function generate(mode) {
  // --- 1. Get the text to analyze ---
  const text = textInput.value.trim();

  // Validate: make sure there's something to work with
  if (!text && !uploadedPdfFile) {
    showInputError("Please upload a PDF or paste some text first!");
    return;
  }

  if (!uploadedPdfFile && text.length < 50) {
    showInputError("Please provide at least 50 characters of text for better results.");
    return;
  }

  // --- 2. Set up UI for loading ---
  currentMode = mode;
  hideInputError();
  hideOutput();
  showLoading(mode);
  setButtonsDisabled(true);

  try {
    // Read the depth config
    const depthSlider = document.getElementById("depth-slider");
    const depth = depthSlider ? depthSlider.value : 10;
    
    // --- 3. Build FormData ---
    const formData = new FormData();
    formData.append("mode", mode);
    formData.append("depth", depth);
    if (uploadedPdfFile) {
      formData.append("pdfFile", uploadedPdfFile);
    } else {
      formData.append("text", text);
    }

    // --- 4. Send request to our backend ---
    const response = await fetch(`/generate`, {
      method: "POST",
      body: formData,
    });

    // Handle HTTP errors gracefully
    if (!response.ok) {
      let errorMsg = `Server error: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    if (mode === "summary" && response.headers.get("content-type")?.includes("text/event-stream")) {
      hideLoading();
      outputSection.hidden = false;
      outputTitle.textContent = "📝 Summary";
      demoBadge.hidden = true;
      summaryOutput.hidden = false;
      summaryOutput.innerHTML = `<div class="markdown-body" id="summary-list"><em style="color:var(--text-muted);">Generating live...</em></div>`;
      
      const mdBody = document.getElementById("summary-list");
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (dataStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.meta) {
                if (truncationBadge) truncationBadge.hidden = !parsed.isTruncated;
                continue;
              }
              if (parsed.chunk) fullText += parsed.chunk;
            } catch (e) {
              // Only rethrow real errors, not partial-chunk JSON parse failures
              if (e.message && !e.message.includes('JSON')) throw e;
            }
          }
        }
        
        // Render incrementally
        mdBody.innerHTML = marked.parse(fullText) + '<span style="opacity: 0.5; animation: pulse 1s infinite;"> 🔵</span>';
      }
      
      // Final render
      mdBody.innerHTML = marked.parse(fullText);
    } else {
      const data = await response.json();
      hideLoading();
      displayResults(mode, data.result, data.isPlaceholder, data.isTruncated);
    }

  } catch (error) {
    console.error("Generation error:", error);
    hideLoading();

    // Check if the backend isn't running
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
      showInputError("Cannot connect to the server. Make sure you ran: cd backend && npm start");
    } else {
      showInputError("Error: " + error.message);
    }
  } finally {
    setButtonsDisabled(false);
  }
}

// ============================================================
// SECTION 6: DISPLAY RESULTS
// ============================================================
function displayResults(mode, result, isPlaceholder, isTruncated) {
  // Show the output card
  outputSection.hidden = false;

  // Show demo badge if no real API key
  demoBadge.hidden = !isPlaceholder;
  
  // Show truncation badge if text was too long
  if (truncationBadge) truncationBadge.hidden = !isTruncated;

  // Show/hide the right output section
  if (mode === "summary") {
    outputTitle.textContent = "📝 Summary";
    displaySummary(result);
  } else if (mode === "flashcards") {
    outputTitle.textContent = "🧠 Flashcards";
    displayFlashcards(result);
  } else if (mode === "quiz") {
    outputTitle.textContent = "🎯 Quiz";
    displayQuiz(result);
  }

  // Scroll to results
  outputSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- SUMMARY ----
function displaySummary(text) {
  summaryOutput.hidden = false;
  
  // Use Marked.js to parse the rich markdown
  const html = marked.parse(text);
  
  // Create a markdown container
  summaryOutput.innerHTML = `
    <div class="markdown-body" id="summary-list">
      ${html}
    </div>
  `;
}

// ---- FLASHCARDS ----
function displayFlashcards(jsonText) {
  flashcardsOutput.hidden = false;
  deckStage.innerHTML = "";
  currentCardIndex = 0;

  try {
    flashcardsData = JSON.parse(extractJSON(jsonText));
  } catch {
    deckStage.innerHTML = `<p style="color:var(--text-secondary);padding:1rem;">Error parsing AI response: ${escapeHtml(jsonText)}</p>`;
    return;
  }

  renderCurrentCard();
}

function renderCurrentCard() {
  if (flashcardsData.length === 0) return;

  const card = flashcardsData[currentCardIndex];
  
  // Render
  deckStage.innerHTML = `
    <div class="flashcard">
      <div class="flashcard-inner">
        <div class="flashcard-front">
          <span class="card-label">Question</span>
          <span class="card-text" style="font-size: 1.15rem; font-weight: 500;">${escapeHtml(card.question)}</span>
        </div>
        <div class="flashcard-back">
          <span class="card-label" style="color:var(--teal);">Answer</span>
          <span class="card-text" style="font-size: 1.05rem;">${escapeHtml(card.answer)}</span>
        </div>
      </div>
    </div>
  `;

  // Attach flip click
  const cardEl = deckStage.querySelector(".flashcard");
  cardEl.addEventListener("click", () => cardEl.classList.toggle("flipped"));

  // Update controls
  deckCounter.textContent = `${currentCardIndex + 1} / ${flashcardsData.length}`;
  btnPrev.disabled = currentCardIndex === 0;
  btnNext.disabled = currentCardIndex === flashcardsData.length - 1;
}

function prevCard() {
  if (currentCardIndex > 0) {
    currentCardIndex--;
    renderCurrentCard();
  }
}

function nextCard() {
  if (currentCardIndex < flashcardsData.length - 1) {
    currentCardIndex++;
    renderCurrentCard();
  }
}

// Global keyboard listeners for flashcards
document.addEventListener("keydown", (e) => {
  if (currentMode !== "flashcards" || flashcardsOutput.hidden || flashcardsData.length === 0) return;

  if (e.key === "ArrowLeft") {
    prevCard();
  } else if (e.key === "ArrowRight") {
    nextCard();
  } else if (e.key === " ") {
    if (e.target.tagName !== "BUTTON") {
      e.preventDefault();
      const cardEl = deckStage.querySelector(".flashcard");
      if (cardEl) cardEl.classList.toggle("flipped");
    }
  }
});

// ---- QUIZ ----
function displayQuiz(jsonText) {
  quizOutput.hidden = false;
  quizContainer.innerHTML = "";
  quizScore.hidden = true;

  try {
    quizData = JSON.parse(extractJSON(jsonText));
  } catch {
    quizContainer.innerHTML = `<p style="color:var(--text-secondary);padding:1rem;">${escapeHtml(jsonText)}</p>`;
    return;
  }

  const letters = ["A", "B", "C", "D"];

  quizData.forEach((q, qIndex) => {
    const qEl = document.createElement("div");
    qEl.className = "quiz-question";
    qEl.id = `question-${qIndex}`;

    const optionsHTML = q.options.map((opt, oIndex) => `
      <button
        class="quiz-option"
        id="q${qIndex}-opt${oIndex}"
        onclick="selectOption(${qIndex}, ${oIndex})"
        aria-label="Question ${qIndex + 1} option ${letters[oIndex]}: ${escapeHtmlAttr(opt)}"
      >
        <span class="option-letter">${letters[oIndex]}</span>
        ${escapeHtml(opt)}
      </button>
    `).join("");

    qEl.innerHTML = `
      <p class="quiz-q-text">
        <span class="quiz-q-number">Q${qIndex + 1}</span>
        ${escapeHtml(q.question)}
      </p>
      <div class="quiz-options" id="options-${qIndex}">
        ${optionsHTML}
      </div>
      <div class="quiz-explanation" id="explanation-${qIndex}" hidden style="margin-top: 1rem; padding: 0.75rem 1rem; background-color: rgba(59, 130, 246, 0.05); border-left: 4px solid var(--primary-color); border-radius: 4px; font-size: 0.95rem;">
        <strong>💡 Explanation:</strong> ${escapeHtml(q.explanation || "No explanation provided.")}
      </div>
    `;

    quizContainer.appendChild(qEl);
  });

  // Live progress tracker
  const progressEl = document.createElement("div");
  progressEl.id = "quiz-progress";
  progressEl.style.cssText = "font-size:0.82rem;color:var(--text-muted);text-align:right;margin-bottom:0.5rem;";
  progressEl.textContent = `0 / ${quizData.length} answered`;
  quizContainer.prepend(progressEl);

  // Show submit button
  quizActions.hidden = false;
}

// ============================================================
// SECTION 7: QUIZ INTERACTIONS
// ============================================================

// Track user's selected answers: { qIndex: optionIndex }
let userAnswers = {};

function selectOption(qIndex, oIndex) {
  document.querySelectorAll(`#options-${qIndex} .quiz-option`).forEach((btn) => {
    btn.classList.remove("selected");
  });

  const btn = document.getElementById(`q${qIndex}-opt${oIndex}`);
  if (btn) btn.classList.add("selected");

  userAnswers[qIndex] = oIndex;

  // Update live progress counter
  const progressEl = document.getElementById("quiz-progress");
  if (progressEl) progressEl.textContent = `${Object.keys(userAnswers).length} / ${quizData.length} answered`;
}

function submitQuiz() {
  const total = quizData.length;
  let correct = 0;

  quizData.forEach((q, qIndex) => {
    const selected = userAnswers[qIndex];
    const correctIndex = q.correct;

    // Color all options: green for correct, red for wrong selection
    document.querySelectorAll(`#options-${qIndex} .quiz-option`).forEach((btn, oIndex) => {
      btn.disabled = true; // No more changes after submit
      if (oIndex === correctIndex) {
        btn.classList.add("correct");
      } else if (oIndex === selected && oIndex !== correctIndex) {
        btn.classList.add("wrong");
      }
    });

    if (selected === correctIndex) correct++;

    // Unhide the explanation
    const explanationEl = document.getElementById(`explanation-${qIndex}`);
    if (explanationEl) {
      explanationEl.hidden = false;
      explanationEl.style.borderLeftColor = selected === correctIndex 
        ? "var(--success-color)" 
        : "var(--error-color)";
    }
  });

  // Show score
  const percent = Math.round((correct / total) * 100);
  quizScore.hidden = false;
  quizActions.hidden = true;

  let emoji, cls;
  if (percent >= 80) { emoji = "🎉 Excellent!"; cls = "great"; }
  else if (percent >= 50) { emoji = "👍 Good job!"; cls = "ok"; }
  else { emoji = "📚 Keep studying!"; cls = "low"; }

  quizScore.className = `quiz-score ${cls}`;
  quizScore.innerHTML = `${emoji} You scored <strong>${correct}/${total}</strong> (${percent}%)`;

  quizScore.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ============================================================
// SECTION 8: COPY RESULTS TO CLIPBOARD
// ============================================================
async function copyResults() {
  let textToCopy = "";

  if (currentMode === "summary") {
    // Grab the text from the markdown body
    const mdBody = document.getElementById("summary-list");
    textToCopy = mdBody ? mdBody.innerText : "";
  } else if (currentMode === "flashcards") {
    textToCopy = flashcardsData.length > 0
      ? flashcardsData.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n")
      : "Flashcards copied!";
  } else {
    textToCopy = quizData.map((q, i) =>
      `Q${i+1}: ${q.question}\n` + q.options.map((o,j) => `  ${["A","B","C","D"][j]}) ${o}`).join("\n")
    ).join("\n\n");
  }

  try {
    await navigator.clipboard.writeText(textToCopy);
    const btn = document.getElementById("copy-btn");
    btn.textContent = "✅ Copied!";
    setTimeout(() => { btn.textContent = "📋 Copy"; }, 2000);
  } catch {
    alert("Could not copy. Please select and copy manually.");
  }
}

async function exportResults() {
  if (currentMode === "flashcards" && flashcardsData.length > 0) {
    // Export Anki perfectly formatted CSV
    let csvContent = "";
    flashcardsData.forEach(card => {
      let q = card.question.replace(/"/g, '""');
      let a = card.answer.replace(/"/g, '""');
      csvContent += `"${q}","${a}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "flashcards_anki.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
  } else if (currentMode === "summary") {
    // Use native browser print targeting the output container to create a clean PDF
    window.print();
  } else {
    alert("Exporting is only heavily supported for Flashcards (CSV) and Summaries (PDF).");
  }
}

// ============================================================
// SECTION 9: HELPER FUNCTIONS
// ============================================================
let loadingInterval;

// Show loading spinner with a message
function showLoading(mode) {
  const messages = {
    summary:    "Generating your summary...",
    flashcards: "Creating flashcards...",
    quiz:       "Building your quiz...",
  };
  loadingText.textContent = messages[mode] || "Working on it...";
  loadingEl.hidden = false;

  // Reassure the user if it takes a long time (large PDFs)
  const subText = document.querySelector(".loading-sub");
  if (subText) subText.textContent = "The AI is reading your content ✨";
  
  let ticks = 0;
  loadingInterval = setInterval(() => {
    ticks++;
    if (ticks === 1 && subText) subText.textContent = "Processing the data... This can take up to 30 seconds for large PDFs. 📚";
    if (ticks === 2 && subText) subText.textContent = "Still analyzing! Deep AI thinking in progress... 🧠";
    if (ticks === 3 && subText) subText.textContent = "Almost there, putting together the final format... 📝";
  }, 7000);
}

function hideLoading() {
  loadingEl.hidden = true;
  if (loadingInterval) clearInterval(loadingInterval);
}

// Hide the results area
function hideOutput() {
  outputSection.hidden = true;
  summaryOutput.hidden = true;
  flashcardsOutput.hidden = true;
  quizOutput.hidden = true;
  deckStage.innerHTML = "";
  if(document.getElementById("summary-list")) document.getElementById("summary-list").innerHTML = "";
  quizContainer.innerHTML = "";
  quizScore.hidden = true;
  quizActions.hidden = true;
  userAnswers = {};
  flashcardsData = [];
}

// Enable or disable all action buttons
function setButtonsDisabled(disabled) {
  ["btn-summary", "btn-flashcards", "btn-quiz"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = disabled;
  });
}

// Show an error below the input area
function showInputError(message) {
  inputError.hidden = false;
  inputErrorText.textContent = message;
  inputError.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideInputError() {
  inputError.hidden = true;
}

// Safely escape HTML to prevent XSS attacks
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// For use inside HTML attribute values
function escapeHtmlAttr(str) {
  return escapeHtml(str);
}

// Extract a JSON array from AI response text
// (Sometimes the AI adds extra text around the JSON)
function extractJSON(text) {
  // Strip markdown code blocks if the AI used them
  const cleanedText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const match = cleanedText.match(/\[[\s\S]*\]/);
  return match ? match[0] : cleanedText;
}

// ============================================================
// SECTION 10: INITIALIZATION
// ============================================================
// Run when the page first loads
(function init() {
  updateCharCount();
  console.log("✅ Study From Anything v2.0 loaded!");
})();

// ============================================================
// SECTION 11: HISTORY LIBRARY DASHBOARD (Database)
// ============================================================
async function openLibrary() {
  const modal = document.getElementById("library-modal");
  const list  = document.getElementById("library-list");

  // Show modal using display flex (hidden attribute conflicts with display:flex)
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);">⏳ Loading...</div>`;

  // Use XMLHttpRequest to avoid any SSE/fetch deadlock issues
  const xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/history", true);
  xhr.timeout = 6000;

  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        const history = JSON.parse(xhr.responseText);
        if (!history || history.length === 0) {
          list.innerHTML = `
            <div style="text-align:center;padding:3rem;color:var(--text-muted);">
              <div style="font-size:2.5rem;margin-bottom:1rem;">📭</div>
              <div style="font-weight:600;margin-bottom:0.5rem;">No study sets saved yet!</div>
              <div style="font-size:0.85rem;">Generate a Summary, Flashcard set, or Quiz to populate your library.</div>
            </div>`;
          return;
        }
        const modeIcons = { summary: '📝', flashcards: '🗂️', quiz: '📋' };
        list.innerHTML = history.map(item => `
          <div style="border:1px solid var(--border);padding:1rem;border-radius:var(--radius-sm);transition:all 0.2s;margin-bottom:0.5rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;"
            onmouseover="this.style.background='rgba(108,99,255,0.04)'" onmouseout="this.style.background='white'">
            <div onclick="loadLibraryItem('${item.id}')" style="flex:1;cursor:pointer;min-width:0;">
              <div style="font-weight:600;margin-bottom:0.3rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${modeIcons[item.mode] || '📄'} ${escapeHtml(item.title)}</div>
              <div style="display:flex;gap:0.5rem;align-items:center;font-size:0.78rem;color:var(--text-secondary);">
                <span style="background:rgba(108,99,255,0.1);color:var(--purple-light);padding:0.1rem 0.4rem;border-radius:4px;font-weight:600;">${item.mode.toUpperCase()}</span>
                <span>${new Date(item.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            <button onclick="deleteLibraryItem('${item.id}', this)" title="Delete" 
              style="flex-shrink:0;background:none;border:1px solid transparent;border-radius:6px;padding:0.3rem 0.5rem;cursor:pointer;color:var(--text-muted);font-size:1rem;transition:all 0.2s;"
              onmouseover="this.style.borderColor='var(--coral)';this.style.color='var(--coral)'" 
              onmouseout="this.style.borderColor='transparent';this.style.color='var(--text-muted)'">🗑️</button>
          </div>
        `).join('');
      } catch(e) {
        list.innerHTML = `<div style="color:var(--coral);text-align:center;padding:1rem;">⚠️ Parse error: ${e.message}</div>`;
      }
    } else {
      list.innerHTML = `<div style="color:var(--coral);text-align:center;padding:1rem;">⚠️ Server error: ${xhr.status}</div>`;
    }
  };

  xhr.onerror = function() {
    list.innerHTML = `<div style="color:var(--coral);text-align:center;padding:1rem;">❌ Network error. Is the server running on port 3001?</div>`;
  };

  xhr.ontimeout = function() {
    list.innerHTML = `<div style="color:var(--coral);text-align:center;padding:1rem;">⏱️ Request timed out. Is the backend running?</div>`;
  };

  xhr.send();
}

function closeLibrary() {
  const modal = document.getElementById("library-modal");
  modal.style.display = "none";
}

async function loadLibraryItem(id) {
  closeLibrary();
  showLoading("summary");
  
  try {
    const res = await fetch(`/api/history/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const item = await res.json();
    
    currentMode = item.mode;
    hideOutput();
    hideLoading();
    
    displayResults(item.mode, item.content, false, false);
    
  } catch (e) {
    hideLoading();
    alert("Could not load study set. Error: " + e.message);
  }
}

async function deleteLibraryItem(id, btnEl) {
  if (!confirm("Delete this study set from your library?")) return;

  // Optimistically remove the row from the UI
  const row = btnEl.closest("div[style*='border:1px solid']");
  if (row) row.style.opacity = "0.3";

  try {
    const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Remove the row fully from the DOM
    if (row) row.remove();
    const list = document.getElementById("library-list");
    if (list && !list.querySelector("div[style*='border:1px solid']")) {
      list.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text-muted);">
        <div style="font-size:2.5rem;margin-bottom:1rem;">📭</div>
        <div style="font-weight:600;">No study sets saved yet!</div>
      </div>`;
    }
  } catch (e) {
    if (row) row.style.opacity = "1";
    alert("Could not delete: " + e.message);
  }
}
