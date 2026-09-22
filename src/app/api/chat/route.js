import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import brainData from '../../../data/brain-data.json';
import { resolveQuestion } from '../../../lib/brain-context.mjs';
import { providers, queryProviders, failureReply } from '../../../lib/chat-providers.mjs';

// Seven 15-second attempts, with headroom for routing and response handling.
export const maxDuration = 120;

export async function POST(req) {
  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ reply: 'No pude leer la pregunta.' }, { status: 400 }); }
  const message = body?.message;
  if (typeof message !== 'string' || !message.trim() || Buffer.byteLength(message, 'utf8') > 1000) {
    return NextResponse.json({ reply: 'Escribe una pregunta más breve y específica.' }, { status: 400 });
  }
  const started = Date.now();
  const requestId = randomUUID();
  try {
    const context = resolveQuestion(brainData.nodes, message);
    if (context.reply) return NextResponse.json({ reply: context.reply });
    const candidates = providers(context.messages);
    console.info('[BogatiBrain]', JSON.stringify({ requestId, event: 'routing', files: context.files,
      inputBytes: Buffer.byteLength(JSON.stringify(context.messages)),
      providers: candidates.map(p => `${p.name}/${p.model}`), routingMs: Date.now() - started }));
    if (!candidates.length) {
      return NextResponse.json({ reply: `No hay un servicio de IA configurado que pueda procesar esta consulta completa. Pide al administrador revisar la configuración. Código de consulta: ${requestId}`, requestId }, { status: 503 });
    }
    const result = await queryProviders(context.messages, candidates, {
      log: event => console.info('[BogatiBrain]', JSON.stringify({ requestId, ...event })),
    });
    if (result.reply) return NextResponse.json({ reply: result.reply, model: result.model, requestId });
    return NextResponse.json({ reply: `${failureReply(result.failures)} Código de consulta: ${requestId}`, requestId }, { status: 503 });
  } catch (error) {
    console.error('[BogatiBrain]', JSON.stringify({ requestId, event: 'preparation_error', message: error.message }));
    return NextResponse.json({ reply: `No pude preparar la consulta. Pide al administrador revisar los registros. Código de consulta: ${requestId}`, requestId }, { status: 500 });
  }
}
