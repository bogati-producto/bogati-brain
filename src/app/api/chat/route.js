import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// ─── Cargar base de conocimiento del Brain ────────────────────────────────────
let brainContext = "";
try {
  const dataPath = path.join(process.cwd(), 'src/data/brain-data.json');
  const fileContent = fs.readFileSync(dataPath, 'utf8');
  const brainData = JSON.parse(fileContent);
  brainContext = brainData.nodes
    .filter(n => n.id !== 'BOGATI_BRAIN')
    .map(n => `--- ARCHIVO: ${n.id} ---\n${n.content}`)
    .join('\n\n');
} catch (error) {
  console.error("Error loading brain data:", error);
}

// ─── Modelos Gemini (de mayor a menor calidad) ────────────────────────────────
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-2.5-flash",
];

const MODEL_TIMEOUT_MS = 8000;

// ─── Intentar un modelo Gemini con timeout ────────────────────────────────────
async function tryGeminiModel(genAI, modelName, prompt) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout: ${MODEL_TIMEOUT_MS}ms`)), MODEL_TIMEOUT_MS)
  );
  const generate = (async () => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    return result.response.text();
  })();
  return Promise.race([generate, timeout]);
}

// ─── Fallback: Groq con Llama 4 (gratis, servidores USA) ─────────────────────
async function tryGroq(prompt) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY no configurada");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ─── Guardar log de auditoría ─────────────────────────────────────────────────
function saveLog(query, model, durationMs, text) {
  try {
    const logDir = path.join(process.cwd(), '../auditoria');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      query,
      model,
      durationMs,
      replySnippet: text.slice(0, 150) + (text.length > 150 ? '...' : ''),
    };
    fs.appendFileSync(path.join(logDir, 'query_logs.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.error("Error guardando log:", e);
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { message } = await req.json();

    const geminiKey = process.env.GEMINI_API_KEY;
    const startTime = Date.now();

    const prompt = `Eres el "Bogati Brain", la inteligencia central de Bogati Sabor Adictivo S.A.S.
Tu objetivo es responder a las preguntas de los ejecutivos basándote ÚNICAMENTE en la siguiente base de conocimiento.
Sé directo, claro y conciso. Si la información no está en la base de conocimiento, responde educadamente que no tienes esa información en el sistema.

--- INICIO DE LA BASE DE CONOCIMIENTO BOGATI ---
${brainContext}
--- FIN DE LA BASE DE CONOCIMIENTO ---

Pregunta del usuario: ${message}
Respuesta:`;

    const errors = [];

    // 1️⃣ Intentar modelos Gemini en secuencia
    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      for (const modelName of GEMINI_MODELS) {
        try {
          console.log(`[BogatiBrain] Intentando Gemini: ${modelName}`);
          const text = await tryGeminiModel(genAI, modelName, prompt);
          const durationMs = Date.now() - startTime;
          saveLog(message, modelName, durationMs, text);
          return NextResponse.json({ reply: text, model: modelName });
        } catch (err) {
          const msg = `Gemini ${modelName}: ${err.message}`;
          errors.push(msg);
          console.warn(`[BogatiBrain] ${msg}`);
        }
      }
    } else {
      errors.push("GEMINI_API_KEY no está configurada en el entorno");
    }

    // 2️⃣ Fallback a Groq si todos los Gemini fallaron
    try {
      console.log("[BogatiBrain] Gemini fallaron → intentando Groq...");
      const text = await tryGroq(prompt);
      const durationMs = Date.now() - startTime;
      saveLog(message, "groq/llama-3.3-70b", durationMs, text);
      return NextResponse.json({ reply: text, model: "groq/llama-3.3-70b" });
    } catch (groqErr) {
      errors.push(`Groq: ${groqErr.message}`);
      console.error("[BogatiBrain] Groq también falló:", groqErr.message);
    }

    // 3️⃣ Si todo falló — mostramos errores reales para diagnóstico
    return NextResponse.json({
      reply: `⚠️ DEBUG - Errores encontrados:\n${errors.map((e, i) => `${i+1}. ${e}`).join('\n')}`,
    }, { status: 503 });

  } catch (error) {
    console.error("Error general en /api/chat:", error);
    return NextResponse.json({
      reply: "Error interno del servidor. Por favor intenta de nuevo.",
    }, { status: 500 });
  }
}
