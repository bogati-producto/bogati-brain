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
// Extraído del ROUTER.md de Bogati Brain
const ROUTING_TABLE = [
  {
    keywords: ['ventas', 'vendidos', 'ingresos', 'facturación', 'unidades', 'combos', 'pedidos', 'ranking productos', 'participación', 'acumulado'],
    files: ['ventas/ventas_productos_acumulado_2026.md'],
  },
  {
    keywords: ['pdv', 'local', 'bodega', 'bodeg', 'ticket', 'transacciones', 'ventas por local', 'ventas históricas', 'histórico', 'historico'],
    files: ['ventas/ventas_por_pdv_historico.md'],
  },
  {
    keywords: ['margen', 'rentabilidad', 'utilidad', 'ganancia', 'cuánto deja', 'cuanto deja', 'producto más rentable', 'rentable'],
    files: ['finanzas/margenes_utilidad_productos.md'],
  },
  {
    keywords: ['costo', 'costos', 'receta', 'ingrediente', 'gramaje', 'merma', 'pvp', 'precio de venta', 'ficha técnica', 'materia prima'],
    files: ['finanzas/fichas_tecnicas_costos_recetas.md'],
  },
  {
    keywords: ['franquicia', 'franquiciado', 'teléfono', 'directorio', 'contacto', 'dirección', 'correo', 'ciudad', 'zona', 'locales activos'],
    files: ['comercial/pdvs_directorio.md'],
  },
  {
    keywords: ['menú', 'menu', 'carta', 'precio', 'precios', 'waffle', 'helado', 'malteada', 'formato', 'pick up', 'express', 'premium'],
    files: ['marketing/menus_por_formato.md'],
  },
  {
    keywords: ['planta', 'selladora', 'envasadora', 'calibración', 'temperatura', 'maquinaria', 'mantenimiento', 'falla técnica'],
    files: ['procesos/planta/calibracion_selladora.md'],
  },
  {
    keywords: ['instructivo', 'mise en place', 'cortes', 'crocante', 'copa', 'postre', 'cafetería', 'masa', 'crepe', 'café', 'cafe'],
    files: ['procesos/recetas_instructivo.md', 'procesos/recetas_copas_crocantes.md', 'procesos/recetas_postres_cafeteria_otros.md'],
  },
  {
    keywords: ['promoción', 'promocion', 'campaña', 'campana', '2x1', 'descuento', 'gift card', 'cupón', 'cupon', 'beneficio'],
    files: ['marketing/promociones_campanas_pdv.md'],
  },
  {
    keywords: ['auditoría', 'auditoria', 'changelog', 'cambios', 'historial', 'quién subió', 'versiones', 'autor'],
    files: ['auditoria/CHANGELOG.md'],
  },
];

// Archivos que SIEMPRE se incluyen (el índice y las leyes)
const ALWAYS_INCLUDE = ['ROUTER.md', 'LEYES_SUPREMAS.md'];

/**
 * Selecciona el contexto relevante basándose en el mensaje del usuario.
 * Siempre incluye ROUTER + LEYES. Luego agrega solo los archivos temáticos
 * que coincidan con las palabras clave de la pregunta.
 */
function buildSmartContext(message) {
  const lowerMsg = message.toLowerCase();

  // 1. Siempre incluir nodos base (ROUTER + LEYES)
  const baseNodes = allNodes.filter(n =>
    ALWAYS_INCLUDE.some(name => n.id.toLowerCase().includes(name.toLowerCase()))
  );

  // 2. Detectar archivos relevantes según keywords del ROUTER
  const matchedFiles = new Set();
  for (const route of ROUTING_TABLE) {
    if (route.keywords.some(kw => lowerMsg.includes(kw))) {
      route.files.forEach(f => matchedFiles.add(f.toLowerCase()));
    }
  }

  // 3. Cargar los nodos que coincidan con las rutas detectadas
  const topicNodes = allNodes.filter(n =>
    [...matchedFiles].some(f => n.id.toLowerCase().includes(f.split('/').pop()))
  );

  // 4. Si no detectamos tema específico, incluir solo ROUTER+LEYES
  //    (la IA le dirá al usuario a qué módulo pertenece su pregunta)
  const selected = [...baseNodes, ...topicNodes];
  const uniqueSelected = [...new Map(selected.map(n => [n.id, n])).values()];

  console.log(`[Brain] Contexto inteligente: [${uniqueSelected.map(n => n.id).join(', ')}]`);

  return uniqueSelected
    .map(n => `--- ARCHIVO: ${n.id} ---\n${n.content}`)
    .join('\n\n');
}

// ─── Modelos ──────────────────────────────────────────────────────────────────
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];
const GROQ_MODELS   = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'allam-2-7b'];
const MODEL_TIMEOUT = 10000;

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

async function tryGemini(genAI, modelName, prompt) {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout ${MODEL_TIMEOUT}ms`)), MODEL_TIMEOUT));
  const gen = (async () => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    return result.response.text();
  })();
  return Promise.race([gen, timeout]);
}

async function tryOpenAICompatible(url, apiKey, model, prompt) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024, temperature: 0.3 }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).choices[0].message.content;
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

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { message } = await req.json();
    const startTime = Date.now();
    const errors = [];

    // Construir contexto inteligente (solo archivos relevantes)
    const smartContext = buildSmartContext(message);
    const prompt = buildPrompt(smartContext, message);

    const geminiKey   = process.env.GEMINI_API_KEY;
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const groqKey     = process.env.GROQ_API_KEY;

    // 1️⃣ Gemini (2 intentos con pausa)
    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      for (let i = 1; i <= 2; i++) {
        if (i > 1) await new Promise(r => setTimeout(r, 2000));
        for (const m of GEMINI_MODELS) {
          try {
            console.log(`[Brain] Gemini ${m} (intento ${i})`);
            const text = await tryGemini(genAI, m, prompt);
            saveLog(message, m, Date.now() - startTime, text);
            return NextResponse.json({ reply: text, model: m });
          } catch (e) { errors.push(`Gemini ${m} #${i}: ${e.message}`); }
        }
      }
    }

    // 2️⃣ DeepSeek (contexto completo, ventana 64K)
    if (deepseekKey) {
      try {
        console.log('[Brain] DeepSeek deepseek-chat...');
        const text = await tryOpenAICompatible('https://api.deepseek.com/v1/chat/completions', deepseekKey, 'deepseek-chat', prompt);
        saveLog(message, 'deepseek-chat', Date.now() - startTime, text);
        return NextResponse.json({ reply: text, model: 'deepseek-chat' });
      } catch (e) { errors.push(`DeepSeek: ${e.message}`); }
    } else { errors.push('DEEPSEEK_API_KEY no configurada'); }

    // 3️⃣ Groq (contexto ya es pequeño gracias al router inteligente)
    if (groqKey) {
      for (const m of GROQ_MODELS) {
        try {
          console.log(`[Brain] Groq ${m}...`);
          const text = await tryOpenAICompatible('https://api.groq.com/openai/v1/chat/completions', groqKey, m, prompt);
          saveLog(message, `groq/${m}`, Date.now() - startTime, text);
          return NextResponse.json({ reply: text, model: `groq/${m}` });
        } catch (e) { errors.push(`Groq ${m}: ${e.message}`); }
      }
    }

    return NextResponse.json({
      reply: `⚠️ DEBUG:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`,
    }, { status: 503 });

  } catch (e) {
    console.error("Error general:", e);
    return NextResponse.json({ reply: 'Error interno. Intenta de nuevo.' }, { status: 500 });
  }
}
