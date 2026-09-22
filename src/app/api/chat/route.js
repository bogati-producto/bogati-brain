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

// ─── Modelos Gemini actualizados y disponibles ────────────────────────────────
// gemini-3.6-flash es el recomendado por Google como reemplazo de 2.5-flash
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
];

// ─── Modelos Groq (fallback gratuito) ────────────────────────────────────────
const GROQ_MODELS = [
  "llama3-70b-8192",
  "mixtral-8x7b-32768",
  "llama3-8b-8192",
];

const MODEL_TIMEOUT_MS = 8000;

// ─── Intentar un modelo Gemini con timeout ────────────────────────────────────
async function tryGeminiModel(genAI, modelName, prompt) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout después de ${MODEL_TIMEOUT_MS}ms`)), MODEL_TIMEOUT_MS)
  );
  const generate = (async () => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    return result.response.text();
  })();
  return Promise.race([generate, timeout]);
}

// ─── Intentar un modelo Groq ─────────────────────────────────────────────────
async function tryGroqModel(groqKey, modelName, prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${response.status}: ${err}`);
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
    const groqKey = process.env.GROQ_API_KEY;
    const startTime = Date.now();
    const errors = [];

    const prompt = `Eres el "Bogati Brain", la inteligencia central de Bogati Sabor Adictivo S.A.S.
Tu objetivo es responder a las preguntas de los ejecutivos basándote ÚNICAMENTE en la siguiente base de conocimiento.
Sé directo, claro y conciso. Si la información no está en la base de conocimiento, responde educadamente que no tienes esa información en el sistema.

--- INICIO DE LA BASE DE CONOCIMIENTO BOGATI ---
${brainContext}
--- FIN DE LA BASE DE CONOCIMIENTO ---

Pregunta del usuario: ${message}
Respuesta:`;

    // 1️⃣ Intentar modelos Gemini — con 2 ciclos de reintentos para 503
    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);

      for (let intento = 1; intento <= 2; intento++) {
        if (intento > 1) {
          console.log(`[BogatiBrain] Reintento ${intento} con Gemini (espera 2s)...`);
          await new Promise(r => setTimeout(r, 2000));
        }

        for (const modelName of GEMINI_MODELS) {
          try {
            console.log(`[BogatiBrain] Gemini ${modelName} (intento ${intento})`);
            const text = await tryGeminiModel(genAI, modelName, prompt);
            const durationMs = Date.now() - startTime;
            saveLog(message, modelName, durationMs, text);
            console.log(`[BogatiBrain] ✅ Respondió ${modelName} en ${durationMs}ms`);
            return NextResponse.json({ reply: text, model: modelName });
          } catch (err) {
            const is503 = err.message?.includes('503');
            const msg = `Gemini ${modelName} (intento ${intento}): ${err.message?.slice(0, 120)}`;
            errors.push(msg);
            console.warn(`[BogatiBrain] ❌ ${msg}`);
            // Si no es 503 (ej: 404 deprecado), no tiene sentido reintentar este modelo
            if (!is503) break;
          }
        }
      }
    } else {
      errors.push("GEMINI_API_KEY no configurada en Vercel");
    }

    // 2️⃣ Fallback a Groq — prueba varios modelos
    if (groqKey) {
      for (const modelName of GROQ_MODELS) {
        try {
          console.log(`[BogatiBrain] Groq ${modelName}...`);
          const text = await tryGroqModel(groqKey, modelName, prompt);
          const durationMs = Date.now() - startTime;
          saveLog(message, `groq/${modelName}`, durationMs, text);
          console.log(`[BogatiBrain] ✅ Respondió Groq ${modelName} en ${durationMs}ms`);
          return NextResponse.json({ reply: text, model: `groq/${modelName}` });
        } catch (err) {
          const msg = `Groq ${modelName}: ${err.message?.slice(0, 120)}`;
          errors.push(msg);
          console.warn(`[BogatiBrain] ❌ ${msg}`);
        }
      }
    } else {
      errors.push("GROQ_API_KEY no configurada en Vercel");
    }

    // 3️⃣ Todo falló — mostrar errores para diagnóstico
    console.error("[BogatiBrain] Todos los proveedores fallaron:", errors);
    return NextResponse.json({
      reply: `⚠️ DEBUG - Errores:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`,
    }, { status: 503 });

  } catch (error) {
    console.error("Error general en /api/chat:", error);
    return NextResponse.json({
      reply: "Error interno del servidor. Por favor intenta de nuevo.",
    }, { status: 500 });
  }
}
