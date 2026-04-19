fetch("http://localhost:3001/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Test text with more than 50 characters to ensure that the backend validates it appropriately and attempts to send it to the gemini api.", mode: "summary" })
})
.then(res => res.json())
.then(data => console.log("SUCCESS:", data))
.catch(err => console.error("ERROR:", err));
