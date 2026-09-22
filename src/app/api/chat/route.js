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
  
  // Condense the context
  brainContext = brainData.nodes
    .filter(n => n.id !== 'BOGATI_BRAIN')
    .map(n => `--- ARCHIVO: ${n.id} ---\n${n.content}`)
    .join('\n\n');
} catch (error) {
  console.error("Error loading brain data:", error);
}

export async function POST(req) {
  try {
    const { message } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ reply: "Error: No se encontró la API Key de Gemini en el entorno." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-2.5-flash"];
    
    const prompt = `Eres el "Bogati Brain", la inteligencia central de la empresa Bogati.
Tu objetivo es responder a las preguntas de los ejecutivos basándote ÚNICAMENTE en la siguiente base de conocimiento.
Sé directo, claro y conciso. Si te preguntan algo que no está en la base de conocimiento, responde educadamente que no tienes esa información en el sistema.

--- INICIO DE LA BASE DE CONOCIMIENTO BOGATI ---
${brainContext}
--- FIN DE LA BASE DE CONOCIMIENTO ---

Pregunta del usuario: ${message}
Respuesta:`;

    let lastError = null;
    const startTime = Date.now();
    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
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
            model: modelName,
            durationMs: durationMs,
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

        return NextResponse.json({ reply: text });
      } catch (err) {
        lastError = err;
        console.warn(`Error con modelo ${modelName}, intentando siguiente...`, err.message);
      }
    }

    throw lastError;
  } catch (error) {
    console.error("Gemini API Error final:", error);
    return NextResponse.json({ 
      reply: "El servicio de IA está experimentando alta demanda momentánea. Por favor intenta de nuevo en unos segundos." 
    }, { status: 500 });
  }
}
