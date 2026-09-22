import { NextResponse } from 'next/server';
import brainData from '../../../data/brain-data.json';
import { resolveQuestion } from '../../../lib/brain-context.mjs';

export const maxDuration = 25;
const ATTEMPT_TIMEOUT_MS = 8000;

function providers(messages) {
  const options = [];
  // Conservative byte budget; preserve complete laws and documents.
  const groqFits = Buffer.byteLength(JSON.stringify(messages), 'utf8') <= 5800;
  if (process.env.GROQ_API_KEY && groqFits) options.push({
    url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', name: 'groq',
  });
  if (process.env.OPENROUTER_API_KEY) {
    for (const model of [process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free',
      process.env.OPENROUTER_FALLBACK_MODEL || 'nvidia/nemotron-3.5-lightning:free']) {
      options.push({ url: 'https://openrouter.ai/api/v1/chat/completions',
        key: process.env.OPENROUTER_API_KEY, model, name: 'openrouter' });
    }
  }
  return options.slice(0, 2);
}

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ reply: 'No pude leer la pregunta.' }, { status: 400 }); }
  const message = body?.message;
  if (typeof message !== 'string' || !message.trim() || Buffer.byteLength(message, 'utf8') > 1000) {
    return NextResponse.json({ reply: 'Escribe una pregunta más breve y específica.' }, { status: 400 });
  }
  const started = Date.now();
  try {
    const context = resolveQuestion(brainData.nodes, message);
    if (context.reply) return NextResponse.json({ reply: context.reply });
    const candidates = providers(context.messages);
    if (!candidates.length) {
      console.error('[BogatiBrain] No hay proveedor configurado con capacidad para los documentos seleccionados.');
      return NextResponse.json({ reply: 'No hay un servicio de IA configurado que pueda procesar esta consulta completa. Pide al administrador revisar la configuración.' }, { status: 503 });
    }
    for (const provider of candidates) {
      try {
        const response = await fetch(provider.url, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
          body: JSON.stringify({ model: provider.model, messages: context.messages, max_tokens: 900, temperature: 0.2 }),
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        });
        if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content;
        if (typeof reply !== 'string' || !reply.trim()) throw new Error('Respuesta vacía');
        console.info('[BogatiBrain]', JSON.stringify({ model: provider.model, files: context.files, durationMs: Date.now() - started }));
        return NextResponse.json({ reply, model: `${provider.name}/${provider.model}` });
      } catch (error) { console.warn('[BogatiBrain]', provider.name, provider.model, error.message); }
    }
    return NextResponse.json({ reply: 'La IA no respondió a tiempo o no está disponible. Inténtalo de nuevo en unos momentos.' }, { status: 503 });
  } catch (error) {
    console.error('[BogatiBrain] Error preparando la consulta:', error.message);
    return NextResponse.json({ reply: 'No pude consultar el índice de documentos. Pide al administrador revisar la base de conocimiento.' }, { status: 500 });
  }
}
