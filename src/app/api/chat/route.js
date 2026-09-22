import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// ─── Cargar todos los nodos del Brain en memoria ──────────────────────────────
let allNodes = [];
try {
  const dataPath = path.join(process.cwd(), 'src/data/brain-data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  allNodes = raw.nodes.filter(n => n.id !== 'BOGATI_BRAIN');
} catch (e) {
  console.error("Error cargando brain-data.json:", e);
}

// ─── Router inteligente: ROUTER.md define las rutas por palabras clave ────────
const ROUTING_TABLE = [
  {
    // Directorio de contactos, locales, whatsapp, direcciones
    keywords: ['whatsapp', 'contacto', 'teléfono', 'telefono', 'celular', 'directorio', 'dirección', 'direccion', 'correo', 'ubicación', 'ubicacion', 'franquicia', 'franquiciado', 'ciudad', 'quito', 'guayaquil', 'cuenca', 'ambato', 'locales'],
    files: ['comercial/pdvs_directorio.md'],
  },
  {
    // Ventas acumuladas de productos
    keywords: ['ventas producto', 'vendidos', 'ingresos producto', 'unidades', 'combos', 'pedidos ya', 'ranking producto', 'participación'],
    files: ['ventas/ventas_productos_acumulado_2026.md'],
  },
  {
    // Ventas históricas de PDV / bodegas
    keywords: ['ventas historicas', 'ventas históricas', 'histórico local', 'facturación local', 'ticket promedio', 'transacciones'],
    files: ['ventas/ventas_por_pdv_historico.md'],
  },
  {
    // Márgenes y rentabilidad
    keywords: ['margen', 'rentabilidad', 'utilidad', 'ganancia', 'cuánto deja', 'cuanto deja', 'producto más rentable', 'rentable'],
    files: ['finanzas/margenes_utilidad_productos.md'],
  },
  {
    // Costos y fichas técnicas
    keywords: ['costo', 'costos', 'receta costo', 'ingrediente', 'gramaje', 'merma', 'pvp', 'precio de venta', 'ficha técnica', 'materia prima'],
    files: ['finanzas/fichas_tecnicas_costos_recetas.md'],
  },
  {
    // Menú y formatos
    keywords: ['menú', 'menu', 'carta', 'precio', 'precios', 'waffle', 'helado', 'malteada', 'formato', 'pick up', 'express', 'premium'],
    files: ['marketing/menus_por_formato.md'],
  },
  {
    // Planta y mantenimiento
    keywords: ['planta', 'selladora', 'envasadora', 'calibración', 'temperatura', 'maquinaria', 'mantenimiento', 'falla técnica'],
    files: ['procesos/planta/calibracion_selladora.md'],
  },
  {
    // Recetas operativas
    keywords: ['instructivo', 'mise en place', 'cortes', 'crocante', 'copa', 'postre', 'cafetería', 'masa', 'crepe', 'café', 'cafe'],
    files: ['procesos/recetas_instructivo.md', 'procesos/recetas_copas_crocantes.md', 'procesos/recetas_postres_cafeteria_otros.md'],
  },
  {
    // Promociones y campañas
    keywords: ['promoción', 'promocion', 'campaña', 'campana', '2x1', 'descuento', 'gift card', 'cupón', 'cupon', 'beneficio'],
    files: ['marketing/promociones_campanas_pdv.md'],
  },
  {
    // Auditoría
    keywords: ['auditoría', 'auditoria', 'changelog', 'cambios', 'historial', 'quién subió', 'versiones', 'autor'],
    files: ['auditoria/CHANGELOG.md'],
  },
];

const ALWAYS_INCLUDE_FILES = ['LEYES_SUPREMAS.md'];

/**
 * Contexto COMPLETO para modelos con ventanas grandes (OpenRouter, Gemini)
 */
function buildSmartContext(message) {
  const lowerMsg = message.toLowerCase();

  const baseNodes = allNodes.filter(n =>
    ALWAYS_INCLUDE_FILES.some(name => n.id.toLowerCase().includes(name.toLowerCase()))
  );

  const matchedFiles = new Set();
  for (const route of ROUTING_TABLE) {
    if (route.keywords.some(kw => lowerMsg.includes(kw))) {
      route.files.forEach(f => matchedFiles.add(f.toLowerCase()));
    }
  }

  // Si no hubo match específico, buscar coincidencia parcial en nombre de archivo
  const topicNodes = allNodes.filter(n =>
    [...matchedFiles].some(f => n.id.toLowerCase().includes(f.split('/').pop().toLowerCase()))
  );

  const selected = [...new Map([...baseNodes, ...topicNodes].map(n => [n.id, n])).values()];
  return selected.map(n => `--- ARCHIVO: ${n.id} ---\n${n.content}`).join('\n\n');
}

/**
 * Contexto ULTRA-COMPACTO para Groq: filtra solo líneas o fragmentos relevantes
 * para NUNCA superar los 4,000 tokens y evitar el error 413.
 */
function buildMiniContext(message) {
  const lowerMsg = message.toLowerCase();
  const words = lowerMsg.split(/\s+/).filter(w => w.length > 3);

  const matchedFiles = new Set();
  for (const route of ROUTING_TABLE) {
    if (route.keywords.some(kw => lowerMsg.includes(kw))) {
      route.files.forEach(f => matchedFiles.add(f.toLowerCase()));
    }
  }

  const topicNodes = allNodes.filter(n =>
    [...matchedFiles].some(f => n.id.toLowerCase().includes(f.split('/').pop().toLowerCase()))
  );

  let extractedContent = "";
  if (topicNodes.length > 0) {
    for (const node of topicNodes) {
      // Filtrar líneas del archivo que contengan palabras relevantes o tomar las primeras 50 líneas
      const lines = node.content.split('\n');
      const matchingLines = lines.filter(line => 
        words.some(w => line.toLowerCase().includes(w))
      );

      if (matchingLines.length > 0) {
        extractedContent += `--- ${node.id} (Líneas coincidentes) ---\n` + matchingLines.slice(0, 40).join('\n') + '\n\n';
      } else {
        extractedContent += `--- ${node.id} ---\n` + lines.slice(0, 50).join('\n') + '\n\n';
      }
    }
  }

  // Máximo 3,000 caracteres para asegurar que Groq NUNCA de 413
  return `IDENTIDAD: Eres Bogati Brain. Responde breve y conciso con los datos siguientes.
Firma al final con [Fuente: archivo | Responsable: nombre | Actualizado: fecha].

${extractedContent.slice(0, 3500)}`;
}

// ─── Modelos Gratuitos de OpenRouter (128k a 1M tokens, Cero 413, Cero Costo) ──
const OPENROUTER_FREE_MODELS = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "deepseek/deepseek-r1:free",
  "mistralai/mistral-small-24b-instruct-2501:free"
];

// ─── Modelos Groq (14,400 peticiones diarias gratis con contexto mini) ────────
const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
  "allam-2-7b"
];

const MODEL_TIMEOUT = 12000;

function buildPrompt(context, message) {
  return `Eres "Bogati Brain", el cerebro central de Bogati Sabor Adictivo S.A.S.
Responde ÚNICAMENTE basándote en la base de conocimiento. Sé directo y conciso.
Si la información no está en los documentos, responde exactamente:
"No tengo esa información en Bogati Brain. Pídele al encargado del área que la suba."
Toda respuesta exitosa debe terminar con el pie de firma:
[Fuente: <archivo> | Responsable: <nombre> | Actualizado: <fecha>]

--- BASE DE CONOCIMIENTO BOGATI ---
${context}
--- FIN DE BASE DE CONOCIMIENTO ---

Pregunta: ${message}
Respuesta:`;
}

async function tryOpenAICompatible(url, apiKey, model, prompt, extraHeaders = {}) {
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
      max_tokens: 1024, 
      temperature: 0.2 
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 180)}`);
  const json = await res.json();
  return json.choices[0].message.content;
}

function saveLog(query, model, durationMs, text) {
  try {
    const dir = path.join(process.cwd(), '../auditoria');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'query_logs.jsonl'),
      JSON.stringify({ timestamp: new Date().toISOString(), query, model, durationMs, replySnippet: text.slice(0, 150) }) + '\n'
    );
  } catch (e) { console.error("Log error:", e); }
}

// ─── Handler Principal ────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { message } = await req.json();
    const startTime = Date.now();
    const errors = [];

    const fullContext = buildSmartContext(message);
    const fullPrompt  = buildPrompt(fullContext, message);
    const miniContext = buildMiniContext(message);
    const miniPrompt  = buildPrompt(miniContext, message);

    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const groqKey       = process.env.GROQ_API_KEY;
    const geminiKey     = process.env.GEMINI_API_KEY;
    const deepseekKey   = process.env.DEEPSEEK_API_KEY;

    // 1️⃣ OPENROUTER (Si está configurado: 100% GRATIS con modelos :free, contexto gigante)
    if (openrouterKey) {
      for (const m of OPENROUTER_FREE_MODELS) {
        try {
          console.log(`[Brain] Probando OpenRouter gratis: ${m}`);
          const text = await tryOpenAICompatible(
            'https://openrouter.ai/api/v1/chat/completions',
            openrouterKey,
            m,
            fullPrompt,
            { 'HTTP-Referer': 'https://bogati-brain.vercel.app', 'X-Title': 'Bogati Brain' }
          );
          saveLog(message, m, Date.now() - startTime, text);
          return NextResponse.json({ reply: text, model: m });
        } catch (e) {
          errors.push(`OpenRouter ${m}: ${e.message}`);
        }
      }
    }

    // 2️⃣ GROQ (14,400 peticiones diarias gratis con contexto ultra-compacto filtrado)
    if (groqKey) {
      for (const m of GROQ_MODELS) {
        try {
          console.log(`[Brain] Probando Groq con contexto optimizado: ${m}`);
          // Usamos miniPrompt para que NUNCA pase de 4000 tokens (evita error 413)
          const text = await tryOpenAICompatible(
            'https://api.groq.com/openai/v1/chat/completions',
            groqKey,
            m,
            miniPrompt
          );
          saveLog(message, `groq/${m}`, Date.now() - startTime, text);
          return NextResponse.json({ reply: text, model: `groq/${m}` });
        } catch (e) {
          errors.push(`Groq ${m}: ${e.message}`);
        }
      }
    } else {
      errors.push('GROQ_API_KEY no configurada');
    }

    // 3️⃣ DEEPSEEK (Si tiene saldo)
    if (deepseekKey) {
      try {
        const text = await tryOpenAICompatible(
          'https://api.deepseek.com/v1/chat/completions',
          deepseekKey,
          'deepseek-chat',
          fullPrompt
        );
        saveLog(message, 'deepseek-chat', Date.now() - startTime, text);
        return NextResponse.json({ reply: text, model: 'deepseek-chat' });
      } catch (e) {
        errors.push(`DeepSeek: ${e.message}`);
      }
    }

    // 4️⃣ GEMINI (Fallback si la cuota diaria de 20 peticiones ya se reinició)
    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });
        const result = await model.generateContent(fullPrompt);
        const text = result.response.text();
        saveLog(message, 'gemini-3.8-flash', Date.now() - startTime, text);
        return NextResponse.json({ reply: text, model: 'gemini-3.8-flash' });
      } catch (e) {
        errors.push(`Gemini: ${e.message}`);
      }
    }

    return NextResponse.json({
      reply: `⚠️ DEBUG - Errores:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`,
    }, { status: 503 });

  } catch (e) {
    console.error("Error general:", e);
    return NextResponse.json({ reply: 'Error interno del servidor.' }, { status: 500 });
  }
}
