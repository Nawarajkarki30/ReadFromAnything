require("dotenv").config();
const key = process.env.GEMINI_API_KEY;

fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  .then(r => r.json())
  .then(data => {
    if (data.error) {
      console.error("API ERROR:", data.error);
    } else {
      console.log("AVAILABLE MODELS:", data.models?.map(m => m.name));
    }
  })
  .catch(console.error);
