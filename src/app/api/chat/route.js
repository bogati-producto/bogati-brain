import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import brainData from '../../../data/brain-data.json';
import { resolveQuestion, parseRouter, NO_INFORMATION } from '../../../lib/brain-context.mjs';
import { providers, queryProviders, failureReply } from '../../../lib/chat-providers.mjs';
import { plannerMessages, validatePlan } from '../../../lib/semantic-router.mjs';
import { querySales, formatSales, SALES_INDEX, SALES_SOURCE } from '../../../lib/sales-query.mjs';

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
    const planningMessages = plannerMessages(brainData.nodes, message);
    const planning = await queryProviders(planningMessages, providers(planningMessages).slice(0, 2), {
      validateReply: text => validatePlan(text, brainData.nodes),
      log: event => console.info('[BogatiBrain]', JSON.stringify({ requestId, stage: 'interpretation', ...event })),
    });
    if (!planning.reply) return NextResponse.json({ reply: `No pude interpretar la consulta con los servicios disponibles. Inténtalo de nuevo. Código de consulta: ${requestId}`, requestId }, { status: 503 });
    const plan = validatePlan(planning.reply, brainData.nodes);
    if (plan.clarification) return NextResponse.json({ reply: plan.clarification, requestId });
    if (!plan.file) return NextResponse.json({ reply: NO_INFORMATION, requestId });
    if (plan.sales) {
      const csv = brainData.nodes.find(n => n.id === SALES_SOURCE);
      if (!csv) throw new Error('Falta fuente CSV de ventas');
      const result = querySales(csv.content, plan.sales);
      const index = parseRouter(brainData.nodes.find(n => n.id === 'ROUTER.md').content).find(r => r.files.includes(SALES_INDEX));
      console.info('[BogatiBrain]', JSON.stringify({ requestId, stage: 'sales_calculation', source: SALES_SOURCE,
        records: result.count, from: result.first, to: result.last, durationMs: Date.now() - started }));
      return NextResponse.json({ reply: formatSales(result, index), requestId, model: planning.model });
    }
    const context = resolveQuestion(brainData.nodes, message, plan.file);
    if (context.reply) return NextResponse.json({ reply: context.reply });
    // Share the seven-attempt budget across interpretation and answer generation.
    const candidates = providers(context.messages).slice(0, 7 - planning.failures.length - 1);
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
