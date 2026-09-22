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

// Gemini soporta contextos grandes. Groq y DeepSeek tienen límites más pequeños.
// Limitamos el contexto para proveedores con ventanas de contexto reducidas.
const CONTEXT_FULL    = brainContext;                      // ~sin límite para Gemini
const CONTEXT_SMALL   = brainContext.slice(0, 14000);      // ~3.5K tokens para Groq
const CONTEXT_MEDIUM  = brainContext.slice(0, 40000);      // ~10K tokens para DeepSeek

// ─── Modelos Gemini ───────────────────────────────────────────────────────────
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
];

// ─── Modelos Groq disponibles (verificados Sept 2026) ────────────────────────
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  "allam-2-7b",
];

const MODEL_TIMEOUT_MS = 10000;

// ─── Construir prompt con contexto variable ───────────────────────────────────
function buildPrompt(context, message) {
  return `Eres el "Bogati Brain", la inteligencia central de Bogati Sabor Adictivo S.A.S.
Tu objetivo es responder a las preguntas de los ejecutivos basándote ÚNICAMENTE en la siguiente base de conocimiento.
Sé directo, claro y conciso. Si la información no está en la base de conocimiento, dilo educadamente.

--- INICIO DE LA BASE DE CONOCIMIENTO BOGATI ---
${context}
--- FIN DE LA BASE DE CONOCIMIENTO ---

Pregunta del usuario: ${message}
Respuesta:`;
}

// ─── Intentar un modelo Gemini con timeout ────────────────────────────────────
async function tryGeminiModel(genAI, modelName, prompt) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout ${MODEL_TIMEOUT_MS}ms`)), MODEL_TIMEOUT_MS)
  );
  const generate = (async () => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    return result.response.text();
  })();
  return Promise.race([generate, timeout]);
}

// ─── Llamar a una API compatible con OpenAI (Groq / DeepSeek) ────────────────
async function tryOpenAICompatible(apiUrl, apiKey, modelName, prompt) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${response.status}: ${err.slice(0, 200)}`);
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
      query, model, durationMs,
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
    const startTime = Date.now();
    const errors = [];

    const geminiKey  = process.env.GEMINI_API_KEY;
    const groqKey    = process.env.GROQ_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;

    // ── 1️⃣ Gemini (contexto completo, 2 reintentos) ──────────────────────────
    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const prompt = buildPrompt(CONTEXT_FULL, message);

      for (let intento = 1; intento <= 2; intento++) {
        if (intento > 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
        for (const modelName of GEMINI_MODELS) {
          try {
            console.log(`[Brain] Gemini ${modelName} (intento ${intento})`);
            const text = await tryGeminiModel(genAI, modelName, prompt);
            const durationMs = Date.now() - startTime;
            saveLog(message, modelName, durationMs, text);
            console.log(`[Brain] ✅ ${modelName} OK en ${durationMs}ms`);
            return NextResponse.json({ reply: text, model: modelName });
          } catch (err) {
            const msg = `Gemini ${modelName} (intento ${intento}): ${err.message}`;
            errors.push(msg);
            console.warn(`[Brain] ❌ ${msg}`);
          }
        }
      }
    } else {
      errors.push("GEMINI_API_KEY no configurada");
    }

    // ── 2️⃣ DeepSeek (contexto medio, 64K ventana) ───────────────────────────
    if (deepseekKey) {
      const prompt = buildPrompt(CONTEXT_MEDIUM, message);
      try {
        console.log("[Brain] DeepSeek deepseek-chat...");
        const text = await tryOpenAICompatible(
          "https://api.deepseek.com/v1/chat/completions",
          deepseekKey,
          "deepseek-chat",
          prompt
        );
        const durationMs = Date.now() - startTime;
        saveLog(message, "deepseek-chat", durationMs, text);
        console.log(`[Brain] ✅ DeepSeek OK en ${durationMs}ms`);
        return NextResponse.json({ reply: text, model: "deepseek-chat" });
      } catch (err) {
        const msg = `DeepSeek: ${err.message}`;
        errors.push(msg);
        console.warn(`[Brain] ❌ ${msg}`);
      }
    } else {
      errors.push("DEEPSEEK_API_KEY no configurada en Vercel");
    }

    // ── 3️⃣ Groq (contexto reducido para no exceder límite) ───────────────────
    if (groqKey) {
      const prompt = buildPrompt(CONTEXT_SMALL, message);
      for (const modelName of GROQ_MODELS) {
        try {
          console.log(`[Brain] Groq ${modelName}...`);
          const text = await tryOpenAICompatible(
            "https://api.groq.com/openai/v1/chat/completions",
            groqKey,
            modelName,
            prompt
          );
          const durationMs = Date.now() - startTime;
          saveLog(message, `groq/${modelName}`, durationMs, text);
          console.log(`[Brain] ✅ Groq ${modelName} OK en ${durationMs}ms`);
          return NextResponse.json({ reply: text, model: `groq/${modelName}` });
        } catch (err) {
          const msg = `Groq ${modelName}: ${err.message}`;
          errors.push(msg);
          console.warn(`[Brain] ❌ ${msg}`);
        }
      }
    } else {
      errors.push("GROQ_API_KEY no configurada en Vercel");
    }

    // ── 4️⃣ Todo falló ────────────────────────────────────────────────────────
    console.error("[Brain] Todos los proveedores fallaron:", errors);
    return NextResponse.json({
      reply: `⚠️ DEBUG - Errores:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`,
    }, { status: 503 });

  } catch (error) {
    console.error("Error general en /api/chat:", error);
    return NextResponse.json({ reply: "Error interno. Intenta de nuevo." }, { status: 500 });
  }
}
