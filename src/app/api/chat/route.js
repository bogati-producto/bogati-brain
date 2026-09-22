import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// Load brain data for context
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

// Modelos ordenados de mayor a menor calidad.
// Se prueban en secuencia: si uno falla (503, 404, etc.) se pasa al siguiente
// de forma inmediata. Solo pagamos por el modelo que responde exitosamente.
const CANDIDATE_MODELS = [
  "gemini-2.5-flash",       // tier alto, muy capaz
  "gemini-2.5-flash-lite",  // versión ligera, más disponible
  "gemini-2.0-flash",       // modelo estable y probado
  "gemini-2.0-flash-lite",  // versión ligera de 2.0
  "gemini-1.5-flash",       // fallback clásico
  "gemini-1.5-flash-8b",    // el más ligero — casi siempre disponible
];

// Timeout en ms para que un modelo no nos haga esperar demasiado.
// Si un modelo no responde en este tiempo, se considera error y pasamos al siguiente.
const MODEL_TIMEOUT_MS = 8000;

/**
 * Intenta llamar a un modelo Gemini específico con timeout.
 * Retorna el texto de la respuesta, o lanza un error si falla.
 */
async function tryModel(genAI, modelName, prompt) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout después de ${MODEL_TIMEOUT_MS}ms`)), MODEL_TIMEOUT_MS)
  );

  const generatePromise = (async () => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  })();

  return Promise.race([generatePromise, timeoutPromise]);
}

export async function POST(req) {
  try {
    const { message } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { reply: "Error: No se encontró la API Key de Gemini en el entorno." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const prompt = `Eres el "Bogati Brain", la inteligencia central de la empresa Bogati Sabor Adictivo S.A.S.
Tu objetivo es responder a las preguntas de los ejecutivos basándote ÚNICAMENTE en la siguiente base de conocimiento.
Sé directo, claro y conciso. Si te preguntan algo que no está en la base de conocimiento, responde educadamente que no tienes esa información en el sistema.

--- INICIO DE LA BASE DE CONOCIMIENTO BOGATI ---
${brainContext}
--- FIN DE LA BASE DE CONOCIMIENTO ---

Pregunta del usuario: ${message}
Respuesta:`;

    const startTime = Date.now();
    let lastError = null;
    let usedModel = null;

    // Secuencial con timeout: prueba modelos uno a uno hasta que uno funcione.
    // Si el error es inmediato (503, 404), pasa al siguiente sin esperar el timeout.
    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`[BogatiBrain] Intentando modelo: ${modelName}`);
        const text = await tryModel(genAI, modelName, prompt);
        usedModel = modelName;
        const durationMs = Date.now() - startTime;

        // Registrar log de auditoría
        try {
          const logDir = path.join(process.cwd(), '../auditoria');
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          const logEntry = {
            timestamp: new Date().toISOString(),
            query: message,
            model: usedModel,
            durationMs,
            replySnippet: text.slice(0, 150) + (text.length > 150 ? '...' : '')
          };
          fs.appendFileSync(
            path.join(logDir, 'query_logs.jsonl'),
            JSON.stringify(logEntry) + '\n',
            'utf8'
          );
        } catch (logErr) {
          console.error("Error guardando log de auditoría:", logErr);
        }

        return NextResponse.json({ reply: text, model: usedModel });

      } catch (err) {
        lastError = err;
        console.warn(`[BogatiBrain] Falló ${modelName}: ${err.message} — pasando al siguiente...`);
        // Si es error de red/timeout, esperamos 200ms antes del siguiente intento
        // Si es error de API (4xx/5xx), pasamos inmediatamente
        const isApiError = err.message?.includes('404') || err.message?.includes('503') || err.message?.includes('400');
        if (!isApiError) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    // Si llegamos aquí, TODOS los modelos fallaron
    console.error("[BogatiBrain] Todos los modelos fallaron.", lastError?.message);
    return NextResponse.json({
      reply: "⚠️ Todos los modelos de IA están momentáneamente ocupados. Por favor intenta de nuevo en unos segundos. (El sistema probó 6 modelos diferentes automáticamente)"
    }, { status: 503 });

  } catch (error) {
    console.error("Error general en /api/chat:", error);
    return NextResponse.json({
      reply: "Error interno del servidor. Por favor intenta de nuevo."
    }, { status: 500 });
  }
}
