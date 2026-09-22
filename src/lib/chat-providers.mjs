export const ATTEMPT_TIMEOUT_MS = 15000;
export const MAX_ATTEMPTS = 7;

export function providers(messages, env = process.env) {
  const options = [];
  // Eligibility heuristic, not a tokenizer or a guarantee of available quota.
  // The 9,993-byte sales request was measured at 3,536 input tokens on Groq.
  const groqFits = Buffer.byteLength(JSON.stringify(messages), 'utf8') <= 14000;
  if (env.GROQ_API_KEY && groqFits) {
    for (const model of new Set([env.GROQ_MODEL || 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'])) {
      options.push({ url: 'https://api.groq.com/openai/v1/chat/completions', key: env.GROQ_API_KEY, model, name: 'groq' });
    }
  }
  if (env.OPENROUTER_API_KEY) {
    for (const model of new Set([
      env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free',
      env.OPENROUTER_FALLBACK_MODEL || 'nvidia/nemotron-3.5-lightning:free',
      'qwen/qwen3.8-27b:free', 'liquid/lfm-2.5-2.6b:free',
      'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'poolside/laguna-xs-2.1:free',
    ])) options.push({ url: 'https://openrouter.ai/api/v1/chat/completions', key: env.OPENROUTER_API_KEY, model, name: 'openrouter' });
  }
  return options.slice(0, MAX_ATTEMPTS);
}

export async function queryProviders(messages, options, { fetchImpl = fetch, timeoutMs = ATTEMPT_TIMEOUT_MS, log = console.info, validateReply } = {}) {
  const failures = [];
  const blocked = new Set();
  for (const provider of options.slice(0, MAX_ATTEMPTS)) {
    if (blocked.has(provider.name)) continue;
    const started = Date.now();
    let status;
    try {
      const response = await fetchImpl(provider.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({ model: provider.model, messages, max_tokens: 900, temperature: 0.2 }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      const data = await response.json();
      if (!response.ok) {
        const metadata = data.error?.metadata;
        const accountRateLimit = status === 429 && provider.name === 'openrouter' && !metadata?.provider_name &&
          (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'));
        if ([401, 402, 403].includes(status) || accountRateLimit) blocked.add(provider.name);
        const failure = { provider: provider.name, model: provider.model, status,
          kind: status === 429 ? 'rate_limit' : status === 413 ? 'context_size' : 'provider_error',
          retryAfter: response.headers.get('retry-after'), accountRateLimit,
          durationMs: Date.now() - started };
        failures.push(failure);
        log(failure);
        continue;
      }
      const reply = data.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty_reply');
      if (validateReply) validateReply(reply);
      log({ provider: provider.name, model: provider.model, status, durationMs: Date.now() - started,
        inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens });
      return { reply, model: `${provider.name}/${provider.model}`, failures };
    } catch (error) {
      const failure = { provider: provider.name, model: provider.model, status,
        kind: ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'connection_or_response_error',
        durationMs: Date.now() - started };
      failures.push(failure);
      log(failure);
    }
  }
  return { failures };
}

export function failureReply(failures) {
  if (failures.some(f => f.kind === 'rate_limit')) return 'Los servicios de IA alcanzaron un límite de uso y los respaldos disponibles no pudieron responder. Inténtalo más tarde. El administrador puede revisar el detalle con el código de consulta.';
  if (failures.some(f => f.kind === 'timeout')) return 'Los servicios de IA tardaron demasiado en responder, incluso tras probar los respaldos disponibles. Inténtalo de nuevo en unos momentos.';
  return 'No pude obtener una respuesta de los servicios de IA disponibles. Pide al administrador revisar los registros con el código de consulta.';
}
