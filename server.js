
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ------------------------------
// GEMINI CONFIGURATION
// ------------------------------

if (!process.env.GEMINI_API_KEY) {
  console.error(
    "Missing GEMINI_API_KEY. Add it to your server .env file."
  );
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Keep the model configurable through .env.
// Default matches the model in your original server.
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// ------------------------------
// HELPERS
// ------------------------------

function getMessage(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanJson(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function sendError(res, message, error) {
  console.error(message, error);

  return res.status(500).json({
    error: message,
  });
}

// Generate a Gemini response.
async function generateAI(contents, systemInstruction) {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: {
      systemInstruction,
    },
  });

  return response.text?.trim() || "";
}

// ------------------------------
// HEALTH CHECK
// ------------------------------

app.get("/", (req, res) => {
  res.json({
    message: "MamaMind AI backend is running",
    endpoints: [
      "/api/voice",
      "/api/mama-go",
      "/api/dad-coach",
      "/api/chat",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "MamaMind AI",
  });
});

// =====================================================
// 1. MAMAMIND VOICE ASSISTANT
// POST /api/voice
// Request: { "message": "Open meditation" }
// =====================================================

const VOICE_SYSTEM_PROMPT = `
You are MamaMind, a warm, supportive, voice-first AI companion
for a mother.

Your main jobs are navigation, companion support, and mother
and baby support.

AVAILABLE NAVIGATION INTENTS:
MOTHER_DASHBOARD
MEDITATION
MEDICATION
BABY_DASHBOARD
DAILY_CARE
SHARED_TASKS
COMMUNITY
BACK

For navigation requests, return:
{
  "type": "navigation",
  "intent": "INTENT_NAME",
  "wellnessSignal": null,
  "reply": "Short confirmation"
}

Examples:
"Open meditation" => MEDITATION
"Show my medicines" => MEDICATION
"Open my baby dashboard" => BABY_DASHBOARD
"Show daily care" => DAILY_CARE
"Open shared tasks" => SHARED_TASKS
"Open community" => COMMUNITY
"Go back" => BACK
"Go home" => MOTHER_DASHBOARD

For normal conversation, return:
{
  "type": "conversation",
  "intent": "COMPANION",
  "wellnessSignal": null,
  "reply": "Short supportive response"
}

For baby-care questions, use intent "BABY_SUPPORT".

Allowed wellness signals:
tired, stressed, overwhelmed, sad, happy, calm, null.

Only return a wellness signal when the user's words clearly
indicate that emotional state. Do not guess.

Offer practical, simple guidance for baby care, feeding,
burping, diapering, sleep routines, postpartum self-care,
stress, exhaustion, and asking trusted people for help.

Do not diagnose or pretend to be a doctor. For concerning
medical symptoms, recommend a qualified healthcare professional.
For emergencies or immediate danger, recommend urgent help.

Be warm, kind, practical, and non-judgmental.
Avoid repeating generic advice unnecessarily.
Keep responses reasonably short.

Return ONLY valid JSON. Do not use Markdown.
Always include type, intent, wellnessSignal, and reply.
`;

app.post("/api/voice", async (req, res) => {
  try {
    const message = getMessage(req.body?.message);

    if (!message) {
      return res.status(400).json({
        error: "Message is required",
      });
    }

    const raw = await generateAI(message, VOICE_SYSTEM_PROMPT);

    let result;

    try {
      result = JSON.parse(cleanJson(raw));
    } catch (parseError) {
      console.error("Invalid Gemini voice JSON:", raw);

      return res.json({
        type: "conversation",
        intent: "COMPANION",
        wellnessSignal: null,
        reply: raw || "I'm sorry, I couldn't prepare a response.",
      });
    }

    // Keep the response fields predictable for the app.
    return res.json({
      type: result.type || "conversation",
      intent: result.intent || "COMPANION",
      wellnessSignal: result.wellnessSignal ?? null,
      reply:
        typeof result.reply === "string"
          ? result.reply
          : "I'm here to help. Could you say that another way?",
    });
  } catch (error) {
    return sendError(
      res,
      "Failed to process voice request",
      error
    );
  }
});

// =====================================================
// 2. MAMAGO OUTING PLANNER
// POST /api/mama-go
// Request: { "request": "Going to the hospital for 3 hours" }
// =====================================================

const MAMAGO_SYSTEM_PROMPT = `
You are MamaGo, the outing-planning feature inside MamaMind.

Understand natural spoken requests from a mother and prepare
a practical packing checklist for an outing with her family and baby.

Return ONLY valid JSON in this format:
{
  "title": "Short outing title",
  "summary": "One reassuring sentence",
  "duration": "Estimated duration or unknown",
  "sections": [
    {
      "title": "Mom essentials",
      "items": [
        {
          "id": "mom-1",
          "label": "Phone",
          "essential": true
        }
      ]
    },
    {
      "title": "Baby essentials",
      "items": [
        {
          "id": "baby-1",
          "label": "Diapers",
          "essential": true
        }
      ]
    },
    {
      "title": "Outing extras",
      "items": [
        {
          "id": "extra-1",
          "label": "Water bottle",
          "essential": false
        }
      ]
    }
  ]
}

Rules:
- Infer the occasion and duration only when supported by the request.
- Never invent the baby's age.
- Use general baby essentials if the age is unknown.
- Adapt the checklist to the occasion and duration.
- Include feeding supplies when relevant; do not assume a feeding method.
- Never suggest unsafe infant sleep arrangements.
- Do not provide medical advice.
- Give every item a unique ID.
- Use short, clear labels.
- Group items into useful sections.
- Include relevant essentials and optional items.
- Return JSON only, without Markdown.
`;

app.post("/api/mama-go", async (req, res) => {
  try {
    const request = getMessage(req.body?.request);

    if (!request) {
      return res.status(400).json({
        error: "Please tell MamaGo about your outing.",
      });
    }

    const raw = await generateAI(
      request,
      MAMAGO_SYSTEM_PROMPT
    );

    let result;

    try {
      result = JSON.parse(cleanJson(raw));
    } catch (parseError) {
      console.error("Invalid MamaGo JSON:", raw);

      return res.status(502).json({
        error: "MamaGo returned an invalid checklist. Please try again.",
      });
    }

    if (
      !result.title ||
      !Array.isArray(result.sections)
    ) {
      return res.status(502).json({
        error: "MamaGo returned an incomplete checklist.",
      });
    }

    return res.json(result);
  } catch (error) {
    return sendError(
      res,
      "MamaGo could not prepare the list right now.",
      error
    );
  }
});

// =====================================================
// 3. DAD AI COACH
// POST /api/dad-coach
// Request: { "message": "How can I support Mama today?" }
// Response: { "reply": "..." }
// =====================================================


const DAD_COACH_SYSTEM_PROMPT = `
You are MamaMind Dad Coach.

Your job is to help fathers support Mama and their baby.

RESPONSE RULES:
- Use simple, everyday English.
- Keep answers short and easy to scan.
- Use 2-4 bullet points maximum.
- Each bullet should be one short sentence.
- Start with the most useful action.
- Give practical tips, not lengthy explanations.
- Avoid repeating the same advice.
- Be kind, encouraging, and non-judgmental.
- Suggest asking Mama what support she wants.
- Never assume all mothers need the same thing.
- Do not diagnose medical conditions.
- Recommend professional medical help for concerning symptoms.
- For emergencies, recommend urgent help.

FORMAT:
Here's what you can do:
- [Practical tip]
- [Practical tip]
- [Optional third tip]

End with one short encouraging sentence when useful.
Return plain text only.
`;


async function handleDadCoach(req, res) {
  try {
    const message = getMessage(req.body?.message);

    if (!message) {
      return res.status(400).json({
        error: "Please enter a question for Dad Coach.",
      });
    }

    const reply = await generateAI(
      message,
      DAD_COACH_SYSTEM_PROMPT
    );

    if (!reply) {
      return res.status(502).json({
        error: "Dad Coach received an empty response. Please try again.",
      });
    }

    return res.json({ reply });
  } catch (error) {
    return sendError(
      res,
      "Dad Coach couldn't respond right now. Please try again.",
      error
    );
  }
}

app.post("/api/dad-coach", handleDadCoach);

// Compatibility route for dashboard code that still calls /api/chat.
app.post("/api/chat", handleDadCoach);

// =====================================================
// 4. ENCOURAGE MAMA SUGGESTION
// POST /api/encourage-mama
// Request: { "message": "Mama had a difficult day" }
// Response: { "suggestion": "...", "message": "..." }
// =====================================================


const ENCOURAGE_MAMA_SYSTEM_PROMPT = `
You are MamaMind's Encourage Mama assistant.

Generate a short, personal message a father can say to Mama.

RULES:
- Use only 1-2 sentences.
- Sound loving, natural, and genuine.
- Avoid generic or repetitive quotes.
- Never guilt, pressure, or judge Mama.
- Match the message to the situation provided.
- When appropriate, suggest one small helpful action.
- Do not add explanations or bullet points.
- Return only the encouragement message.
`;


app.post("/api/encourage-mama", async (req, res) => {
  try {
    const message =
      getMessage(req.body?.message) ||
      "Give Mama a little encouragement today.";

    const suggestion = await generateAI(
      message,
      ENCOURAGE_MAMA_SYSTEM_PROMPT
    );

    if (!suggestion) {
      return res.status(502).json({
        error: "No encouragement was generated. Please try again.",
      });
    }

    return res.json({
      suggestion,
      message: suggestion,
    });
  } catch (error) {
    return sendError(
      res,
      "Could not generate an encouragement suggestion.",
      error
    );
  }
});

// =====================================================
// SERVER START
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MamaMind AI server running on port ${PORT}`);
  console.log(`Using Gemini model: ${GEMINI_MODEL}`);
});
