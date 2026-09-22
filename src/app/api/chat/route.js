import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ─── Cargar base de datos local en memoria ────────────────────────────────────
let allNodes = [];
let routerContent = "";
let leyesContent = "";

try {
  const dataPath = path.join(process.cwd(), 'src/data/brain-data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  allNodes = raw.nodes.filter(n => n.id !== 'BOGATI_BRAIN');

  const routerNode = allNodes.find(n => n.id.toLowerCase() === 'router.md');
  if (routerNode) routerContent = routerNode.content;

  const leyesNode = allNodes.find(n => n.id.toLowerCase() === 'leyes_supremas.md');
  if (leyesNode) leyesContent = leyesNode.content;
} catch (e) {
  console.error("Error cargando brain-data.json:", e);
}

// ─── Tabla de Rutas oficial derivada de ROUTER.md ─────────────────────────────
const ROUTER_MODULES = [
  {
    name: 'Puntos de Venta (PDVs) y Contactos',
    keywords: ['pdv', 'local', 'locales', 'directorio', 'contacto', 'contactos', 'whatsapp', 'telefono', 'teléfono', 'celular', 'franquicia', 'franquiciado', 'ciudad', 'quito', 'guayaquil', 'cuenca', 'ambato', 'direccion', 'dirección', 'correo'],
    files: ['comercial/pdvs_directorio.md']
  },
  {
    name: 'Márgenes y Rentabilidad',
    keywords: ['margen', 'rentabilidad', 'utilidad', 'ganancia', 'cuánto deja', 'cuanto deja', 'rentable'],
    files: ['finanzas/margenes_utilidad_productos.md']
  },
  {
    name: 'Fichas Técnicas de Costos y Recetas',
    keywords: ['costo', 'costos', 'receta costo', 'ingrediente', 'gramaje', 'merma', 'pvp', 'materia prima'],
    files: ['finanzas/fichas_tecnicas_costos_recetas.md']
  },
  {
    name: 'Ventas Acumuladas de Productos 2026',
    keywords: ['ventas producto', 'unidades vendidas', 'vendidos', 'ingresos producto', 'combos', 'pedidos ya', 'ranking producto'],
    files: ['ventas/ventas_productos_acumulado_2026.md']
  },
  {
    name: 'Ventas Históricas por PDV',
    keywords: ['ventas historicas', 'ventas históricas', 'histórico local', 'facturación mensual', 'ticket promedio', 'transacciones pdv'],
    files: ['ventas/ventas_por_pdv_historico.md']
  },
  {
    name: 'Menús y Precios',
    keywords: ['menú', 'menu', 'carta', 'precio', 'precios', 'pick up', 'express', 'premium'],
    files: ['marketing/menus_por_formato.md']
  },
  {
    name: 'Recetas e Instructivos',
    keywords: ['instructivo', 'mise en place', 'cortes', 'crocante', 'copa', 'postre', 'cafetería', 'masa', 'crepe', 'café', 'cafe', 'receta'],
    files: ['procesos/recetas_instructivo.md', 'procesos/recetas_copas_crocantes.md', 'procesos/recetas_postres_cafeteria_otros.md']
  },
  {
    name: 'Planta y Maquinaria',
    keywords: ['planta', 'selladora', 'envasadora', 'calibración', 'temperatura', 'mantenimiento'],
    files: ['procesos/planta/calibracion_selladora.md']
  },
  {
    name: 'Promociones y Campañas',
    keywords: ['promoción', 'promocion', 'campaña', 'campana', '2x1', 'descuento', 'gift card', 'cupón', 'cupon'],
    files: ['marketing/promociones_campanas_pdv.md']
  },
  {
    name: 'Auditoría',
    keywords: ['auditoría', 'auditoria', 'changelog', 'cambios', 'historial'],
    files: ['auditoria/CHANGELOG.md']
  }
];

/**
 * Construcción del contexto siguiendo la JERARQUÍA ESTRICTA del usuario:
 * 1. ROUTER.md
 * 2. LEYES_SUPREMAS.md
 * 3. Archivo temático correspondiente según el Router
 */
function buildContext(message, isCompact = false) {
  const lower = message.toLowerCase();
  const matchedTargetFiles = new Set();

  for (const mod of ROUTER_MODULES) {
    if (mod.keywords.some(kw => lower.includes(kw))) {
      mod.files.forEach(f => matchedTargetFiles.add(f.toLowerCase()));
    }
  }

  // Filtrar los nodos temáticos encontrados
  const topicNodes = allNodes.filter(n =>
    matchedTargetFiles.has(n.id.toLowerCase())
  );

  if (isCompact) {
    // Budget the entire context by UTF-8 bytes, not by number of lines.
    // Keep source headers and adjacent lines so excerpts retain some context.
    let compact = 'EXTRACTOS PARCIALES: no calcules totales ni rankings globales con estos fragmentos. Si falta información, indícalo.\n';
    const words = lower.split(/\s+/).filter(w => w.length > 3);
    const perFile = Math.floor(3200 / Math.max(1, topicNodes.length));
    for (const node of topicNodes) {
      const lines = node.content.split('\n');
      const indexes = new Set(lines.slice(0, 6).map((_, i) => i));
      lines.forEach((line, i) => {
        if (words.some(word => line.toLowerCase().includes(word))) {
          for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) indexes.add(j);
        }
      });
      let excerpt = `\n=== ARCHIVO: ${node.id} ===\n`;
      for (const i of [...indexes].sort((a, b) => a - b)) {
        const candidate = excerpt + lines[i] + '\n';
        if (Buffer.byteLength(candidate, 'utf8') <= perFile) excerpt = candidate;
      }
      compact += excerpt;
    }
    return compact;
  }

  let topicContent = "";
  if (topicNodes.length > 0) {
    for (const node of topicNodes) {
      if (isCompact) {
        // Para Groq (limitar tamaño): filtrar líneas que coincidan con la búsqueda
        const words = lower.split(/\s+/).filter(w => w.length > 3);
        const lines = node.content.split('\n');
        const matches = lines.filter(l => words.some(w => l.toLowerCase().includes(w)));
        const sample = matches.length > 0 ? matches.slice(0, 45).join('\n') : lines.slice(0, 50).join('\n');
        topicContent += `\n\n=== ARCHIVO TEMÁTICO: ${node.id} ===\n${sample}`;
      } else {
        // Para OpenRouter: incluir archivo temático completo
        topicContent += `\n\n=== ARCHIVO TEMÁTICO: ${node.id} ===\n${node.content}`;
      }
    }
  }

  return `=== 1. ÍNDICE MAESTRO (ROUTER.MD) ===
${routerContent}

=== 2. DIRECTIVAS Y NORMAS (LEYES_SUPREMAS.MD) ===
${leyesContent}
${topicContent}`;
}

function buildSystemPrompt(context, message) {
  return `Eres "Bogati Brain", la inteligencia central de Bogati Sabor Adictivo S.A.S.
Sigue estrictamente el ROUTER y las LEYES SUPREMAS.
Responde ÚNICAMENTE basándote en la base de conocimiento proporcionada abajo.
Sé directo, claro y ejecutivo.
Si el dato exacto no existe en los archivos, responde:
"No tengo esa información en Bogati Brain. Pídele al encargado del área que la suba para que todos tengamos acceso a ella."

Toda respuesta exitosa debe terminar con el pie de firma:
[Fuente: <ruta/archivo> | Responsable: <nombre y cargo> | Actualizado: <fecha>]

--- BASE DE CONOCIMIENTO BOGATI ---
${context}
--- FIN DE BASE DE CONOCIMIENTO ---

Pregunta del ejecutivo: ${message}
Respuesta:`;
}

// ─── Modelos Gratuitos de OpenRouter probados y activos (262k a 1M tokens) ────
const OPENROUTER_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3.5-lightning:free",
  "liquid/lfm-2.5-2.6b:free",
  "qwen/qwen3.8-27b:free"
];

// ─── Modelos Groq de respaldo (14,400 llamadas/día gratis) ───────────────────
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b"
];

async function callChatApi(url, apiKey, model, prompt, extraHeaders = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1200,
      temperature: 0.2
    }),
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`${res.status}: ${errorText.slice(0, 160)}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('Respuesta vacía del proveedor');
  return reply;
}

function logAudit(query, model, durationMs, text) {
  try {
    const dir = path.join(process.cwd(), '../auditoria');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'query_logs.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        query,
        model,
        durationMs,
        replySnippet: text.slice(0, 150)
      }) + '\n'
    );
  } catch (e) {
    console.error("Audit log error:", e);
  }
}

// ─── Handler Principal ────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { message } = await req.json();
    if (typeof message !== 'string' || !message.trim() || Buffer.byteLength(message, 'utf8') > 1000) {
      return NextResponse.json({ reply: 'Escribe una pregunta breve (máximo 1.000 bytes de texto).' }, { status: 400 });
    }
    const startTime = Date.now();
    const errors = [];

    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    // 1️⃣ PRIMERA PRIORIDAD: OPENROUTER (100% GRATUITO, ventana de contexto gigante)
    if (openrouterKey) {
      const fullContext = buildContext(message, false);
      const fullPrompt = buildSystemPrompt(fullContext, message);

      for (const model of OPENROUTER_MODELS) {
        try {
          console.log(`[BogatiBrain] Intentando OpenRouter: ${model}`);
          const text = await callChatApi(
            'https://openrouter.ai/api/v1/chat/completions',
            openrouterKey,
            model,
            fullPrompt,
            {
              'HTTP-Referer': 'https://bogati-brain.vercel.app',
              'X-Title': 'Bogati Brain'
            }
          );
          const duration = Date.now() - startTime;
          logAudit(message, model, duration, text);
          console.log(`[BogatiBrain] ✅ Respondió OpenRouter (${model}) en ${duration}ms`);
          return NextResponse.json({ reply: text, model });
        } catch (err) {
          console.warn(`[BogatiBrain] OpenRouter ${model} falló:`, err.message);
          errors.push(`OpenRouter ${model}: ${err.message}`);
        }
      }
    } else {
      errors.push("OPENROUTER_API_KEY no configurada");
    }

    // 2️⃣ SEGUNDA PRIORIDAD: GROQ (14,400 consultas/día gratis, contexto filtrado)
    if (groqKey) {
      const compactContext = buildContext(message, true);
      const compactPrompt = buildSystemPrompt(compactContext, message);
      if (Buffer.byteLength(compactPrompt, 'utf8') > 5600) {
        return NextResponse.json({ reply: 'La consulta es demasiado extensa. Prueba con una pregunta más específica.' }, { status: 400 });
      }

      for (const model of GROQ_MODELS) {
        try {
          console.log(`[BogatiBrain] Intentando Groq Backup: ${model}`);
          const text = await callChatApi(
            'https://api.groq.com/openai/v1/chat/completions',
            groqKey,
            model,
            compactPrompt
          );
          const duration = Date.now() - startTime;
          logAudit(message, `groq/${model}`, duration, text);
          console.log(`[BogatiBrain] ✅ Respondió Groq (${model}) en ${duration}ms`);
          return NextResponse.json({ reply: text, model: `groq/${model}` });
        } catch (err) {
          console.warn(`[BogatiBrain] Groq ${model} falló:`, err.message);
          errors.push(`Groq ${model}: ${err.message}`);
        }
      }
    } else {
      errors.push("GROQ_API_KEY no configurada");
    }

    // 3️⃣ SI AMBOS FALLAN
    console.error("[BogatiBrain] Fallaron todos los proveedores:", errors);
    return NextResponse.json({
      reply: 'No pude consultar la IA en este momento. Puede deberse a disponibilidad, límites de uso o configuración del servicio. Inténtalo más tarde; si continúa, pide al administrador que revise los registros de Vercel.'
    }, { status: 503 });

  } catch (error) {
    console.error("Error general en chat:", error);
    return NextResponse.json({ reply: "Error interno en el servidor." }, { status: 500 });
  }
}
