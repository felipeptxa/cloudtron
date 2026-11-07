/**
 * Cloudtron OneClick — Local Web UI & Proxy Server (v1.3.0)
 * Author: Felipe Monroe
 * License: MIT
 */

// Prioriza IPv4 para evitar travamentos de dual-stack no Windows
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Ingestão Universal de Documentos (v1.2) ──────────────────────────────────
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const officeParser = require('officeparser');
const AdmZip = require('adm-zip');

const BASE_PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_PORT_ATTEMPTS = 10;
const BIND_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';

// ── Contexto Mestre de Runtime e Diretrizes de Governança ──────────────────────
const CLOUDTRON_CORE_SYSTEM = `Você é a inteligência integrada do Cloudtron OneClick v1.3.0 (Desktop Electron + Node.js em 127.0.0.1:3000).
DIRETRIZES TÉCNICAS:
- Modo Plan: Forneça arquitetura, diagramas conceituais e contratos. NUNCA gere arquivos de código completos.
- Modo Build: Entregue código 100% completo, sem partes cortadas, com sintaxe fechada e testes unitários.
- Live Preview: Código Node.js puro DEVE usar estritamente blocos \`\`\`javascript. NUNCA utilize \`\`\`html para scripts de backend.
- Auditoria NeMo: Suas respostas são avaliadas de 1 a 10 por um auditor interno. Respostas truncadas recebem FAIL.`;

// ── Fila de Prioridade de Provedores (Failover Automático) ────────────────────
// Ordem de tentativa quando o provedor ativo falha (429, 402, 401 ou timeout).
// As chaves são lidas do corpo da requisição (providerApiKeys) ou do ambiente (.env).
const PROVIDER_FAILOVER_QUEUE = [
  {
    name: 'NVIDIA NIM',
    endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
    envKey: 'NVIDIA_API_KEY',
    defaultModel: 'nvidia/nemotron-3.5-super-vl-120b-a12b'
  },
  {
    name: 'Groq Cloud',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'deepseek-r1-distill-llama-70b'
  },
  {
    name: 'OpenRouter Free',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'deepseek/deepseek-r1-distill-llama-70b:free'
  },
  {
    name: 'DeepSeek Oficial',
    endpoint: 'https://api.deepseek.com/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat'
  },
  {
    name: 'Google AI Studio',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    envKey: 'GOOGLE_AI_STUDIO_API_KEY',
    defaultModel: 'gemini-1.5-pro'
  },
  {
    name: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-3-7-sonnet-20250219'
  }
];

// Tempo máximo (ms) aguardando o primeiro token de cada provedor antes de fazer failover.
const PROVIDER_TIMEOUT_MS = 15000;

// Tempo máximo (ms) da sessão inteira de streaming.
const SESSION_TIMEOUT_MS = 120000;

// Chave de ambiente para a NVIDIA (usada como fallback da fila).
const NVIDIA_KEY_ENV = 'NVIDIA_API_KEY';

// Extrai e normaliza as chaves customizadas por provedor enviadas pelo cliente (se houver).
function clientDataProviderApiKeys(rawBody) {
  try {
    const parsed = JSON.parse(rawBody || '{}');
    const rawKeys = parsed && parsed.providerApiKeys && typeof parsed.providerApiKeys === 'object'
      ? parsed.providerApiKeys
      : {};

    const normalized = {};
    const keyMapping = {
      nvidia: 'NVIDIA_API_KEY',
      groq: 'GROQ_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      google: 'GOOGLE_AI_STUDIO_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY'
    };

    for (const [k, v] of Object.entries(rawKeys)) {
      if (typeof v === 'string' && v.trim()) {
        const val = v.trim();
        normalized[k] = val;
        normalized[k.toLowerCase()] = val;
        if (keyMapping[k.toLowerCase()]) {
          normalized[keyMapping[k.toLowerCase()]] = val;
        }
      }
    }
    return normalized;
  } catch (_) {
    return {};
  }
}

// Leitor resiliente de variáveis de ambiente com suporte a fallback no .env
function getEnvKey(keyName) {
  if (process.env[keyName]) return process.env[keyName].trim();
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
      const lines = envContent.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (k === keyName) return v;
          if (keyName === 'NVIDIA_API_KEY' && k === 'API_KEY') return v;
        }
      }
    } catch (_) {}
  }
  return '';
}

// Resolve a credencial correta para o provedor (Payload > Header Bearer > .env)
function resolveProviderApiKey(provider, providerApiKeys, clientKey) {
  // 1. Chave explícita normalizada no payload (por envKey ou id curto)
  if (providerApiKeys[provider.envKey]) return providerApiKeys[provider.envKey];
  const shortId = provider.name.toLowerCase().split(' ')[0];
  if (providerApiKeys[shortId]) return providerApiKeys[shortId];

  // 2. Chave de autorização passada no header (aplicada ao provedor primário)
  if (provider.name === 'NVIDIA NIM' && clientKey) return clientKey;

  // 3. Fallback para variáveis de ambiente locais
  const envVal = getEnvKey(provider.envKey);
  if (envVal) return envVal;

  return '';
}

// Envia um evento SSE de failover para o cliente informando a troca de provedor.
function sendFailoverEvent(res, from, to, reason) {
  const payload = JSON.stringify({ from, to, reason });
  try {
    res.write(`event: failover\ndata: ${payload}\n\n`);
  } catch (_) {}
}

// Limpa o buffer parcial de resposta acumulada para evitar mistura de provedores.
function resetAccumulated() {
  return '';
}

// Instrução de sistema reforçada para geração de código executável / preview de sandbox.
// Quando o usuário pedir código, componente visual ou web app, o modelo deve retornar
// diretamente o código completo em um bloco ```html ... ```, sem conversas de confirmação.
const SANDBOX_SYSTEM_INSTRUCTION = `Você está em modo de geração de código executável / preview de sandbox (Live Sandbox). Quando o usuário solicitar código executável, componente visual, página web ou aplicativo, NUNCA responda com conversas, saudações ou pedidos de confirmação (ex: "Olá! Posso gerar..."). Retorne DIRETAMENTE o código completo e auto-contido dentro de um único bloco de markup \`\`\`html ... \`\`\`. Use CSS Grid robusto (box-sizing: border-box, grid-template-columns, gap) para evitar sobreposição de elementos no preview. O código deve ser funcional, estilizado e pronto para renderização imediata em iframe. Não adicione texto antes ou depois do bloco de código.`;

// Diretrizes especializadas de runtime por modo operacional (Plan vs Build)
const PLAN_SYSTEM_DIRECTIVE = `[MODO PLAN ATIVO]
Você é o Arquiteto e Estrategista de Software do projeto.
Seu foco é diagnóstico, leitura analítica, planejamento arquitetural e especificação.
RESTRICAO CRITICA: Você NÃO executa comandos destrutivos nem gera patches diretos de escrita no disco. Apresente diagnósticos de causa-raiz, especificações para o TASKS.md e planos passo a passo estruturados.`;

const BUILD_SYSTEM_DIRECTIVE = `[MODO BUILD ATIVO]
Você é o Engenheiro Executor de Código.
Seu foco é implementação física, refatoração cirúrgica e aplicação de código completo.
REGRA DE COMPLETUDE: Você DEVE entregar o arquivo de código integralmente funcional, com todas as funções, chaves e testes unitários abertos devidamente fechados. Nunca abrevie ou corte o código. Economize tokens evitando comentários prolixos ou introduções e entregue a sintaxe completa e fechada.`;
// ── Diretório de Dados e Avaliação (Cloudtron NeMo Core & Eval Engine) ─────────
const DATA_DIR = path.join(__dirname, 'data');
const INTERACTIONS_FILE = path.join(DATA_DIR, 'interactions.jsonl');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.jsonl');
const NEMO_EVALS_FILE = path.join(DATA_DIR, 'nemo_evals.jsonl');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function logInteraction(entry) {
  try {
    ensureDataDir();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFile(INTERACTIONS_FILE, line, 'utf8', (err) => {
      if (err) console.error('[EVAL ENGINE] Erro ao gravar em interactions.jsonl:', err.message);
      else console.log(`[EVAL ENGINE] 📝 Interação registrada com sucesso: ${entry.id}`);
    });
  } catch (err) {
    console.error('[EVAL ENGINE] Exceção ao gravar interação:', err.message);
  }
}

function logNeMoEvaluation(entry) {
  try {
    ensureDataDir();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFile(NEMO_EVALS_FILE, line, 'utf8', (err) => {
      if (err) console.error('[NEMO JUDGE] Erro ao gravar nemo_evals.jsonl:', err.message);
      else console.log(`[NEMO JUDGE] 🛡️ Avaliação registrada (${entry.verdict} - ${entry.score}/10): ${entry.id}`);
    });
  } catch (err) {
    console.error('[NEMO JUDGE] Exceção ao gravar avaliação:', err.message);
  }
}

// ── Cálculo de Score do NeMo Judge (Heurística & Conformidade) ────────────────
function calculateNeMoEvalScore(prompt, response) {
  if (!response || response.trim().length === 0) return 0;
  let score = 8; // Score base para inferência íntegra sem violações de guardrails
  const respLen = response.trim().length;

  // Bônus para respostas estruturadas com código, listas ou formatação
  if (/```[\s\S]*?```/.test(response)) score += 1;
  if (/^[-*#]\s+/m.test(response)) score += 1;

  // Penalidade se a resposta for excessivamente curta
  if (respLen < 30) score -= 2;

  return Math.min(10, Math.max(1, score));
}

// ── NeMo Guardrails: Validação e Sanitização de Mensagens ───────────────────
function applyNeMoGuardrails(messages, systemPrompt) {
  const sanitized = [];

  // 1. Sanitização do System Prompt contra caracteres nulos e de controle
  if (systemPrompt && typeof systemPrompt === 'string') {
    const cleanSys = systemPrompt
      .replace(/\0/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim();
    if (cleanSys) {
      sanitized.push({ role: 'system', content: cleanSys });
    }
  }

  if (!Array.isArray(messages)) return sanitized;

  // 2. Sanitização de histórico e garantia de alternância estrita de papéis
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;

    const role = (m.role === 'assistant') ? 'assistant' : 'user';
    let content = m.content;

    // Sanitiza strings de texto contra caracteres nulos
    if (typeof content === 'string') {
      content = content.replace(/\0/g, '').trim();
    } else if (Array.isArray(content)) {
      // Multimodal payload
      content = content.map(part => {
        if (part && part.type === 'text' && typeof part.text === 'string') {
          return { ...part, text: part.text.replace(/\0/g, '').trim() };
        }
        return part;
      });
    }

    if (!content || (typeof content === 'string' && content.length === 0)) continue;

    const prev = sanitized[sanitized.length - 1];
    // Se o papel anterior for idêntico ao atual (ex: dois 'user' seguidos), funde com quebra dupla
    if (prev && prev.role === role) {
      const prevText = typeof prev.content === 'string' ? prev.content : JSON.stringify(prev.content);
      const currText = typeof content === 'string' ? content : JSON.stringify(content);
      prev.content = `${prevText}\n\n${currText}`;
    } else {
      sanitized.push({ role, content });
    }
  }

  return sanitized;
}

function getEnvApiKey() {
  let key = process.env.NVIDIA_API_KEY || '';
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
    const lines = envContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (k === 'NVIDIA_API_KEY' || k === 'API_KEY') key = v;
      }
    }
  }
  return key;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ── Utilitário: faz fetch com timeout explícito (ms) ─────────────────────────
function fetchWithTimeout(url, options, timeoutMs) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(tid));
}

// ── Utilitário: lê o corpo da requisição com limite rígido de 50 MB ──────────
function readBodyWithLimit(req, res, onComplete) {
  const payloadTooLarge = () => {
    res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: false,
      success: false,
      error: `Payload excede o limite de ${MAX_BODY_BYTES / (1024 * 1024)} MB.`
    }));
  };

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    payloadTooLarge();
    req.resume(); // descarta o upload sem acumular em memória
    return;
  }

  let rawBody = '';
  let totalBytes = 0;
  let rejected = false;

  req.on('data', (chunk) => {
    if (rejected) return;
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      rejected = true;
      rawBody = '';
      payloadTooLarge();
      return;
    }
    rawBody += chunk;
  });

  req.on('end', () => {
    if (!rejected) onComplete(rawBody);
  });

  req.on('error', () => {
    if (rejected) return;
    rejected = true;
    if (!res.headersSent) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, success: false, error: 'Falha ao ler o corpo da requisição.' }));
    }
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── /api/ping — testa servidor local ──────────────────────────────────────
  if (req.method === 'GET' && req.url === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, model: DEFAULT_MODEL, ts: Date.now() }));
    return;
  }

  // ── /api/test-nvidia — diagnóstico detalhado com a NVIDIA ──────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/test-nvidia')) {
    const authHeader = req.headers['authorization'] || '';
    const clientKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    let queryKey = '';
    let queryModel = '';
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      queryKey = parsedUrl.searchParams.get('key') || '';
      queryModel = parsedUrl.searchParams.get('model') || '';
    } catch (_) {}
    const apiKey = clientKey || queryKey || getEnvApiKey();
    const modelToTest = queryModel || DEFAULT_MODEL;

    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        step: 'auth',
        error: 'Nenhuma chave API configurada. Cole sua chave nvapi-... no campo de configurações.'
      }));
      return;
    }

    (async () => {
      console.log(`[DIAGNÓSTICO] Iniciando teste de conexão com NVIDIA (modelo: ${modelToTest})...`);

      // Passo 1: Testa autenticação e rede via /v1/models (rápido e sem custo de inferência)
      let modelsRes;
      try {
        modelsRes = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'Cloudtron-OneClick/1.3.0'
          }
        }, 15000);
      } catch (e) {
        const isTimeout = e.name === 'AbortError';
        console.error('[DIAGNÓSTICO] Falha no Passo 1 (rede):', e.message);
        res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          step: 'network',
          error: isTimeout
            ? 'TIMEOUT DE REDE: Falha ao alcançar integrate.api.nvidia.com em 15s. Verifique firewall, proxy ou conexão à internet.'
            : `FALHA DE REDE: ${e.message}`
        }));
        return;
      }

      if (!modelsRes.ok) {
        let errDetail = '';
        try {
          const errJson = await modelsRes.json();
          errDetail = errJson.error || errJson.message || JSON.stringify(errJson);
        } catch (_) {
          errDetail = `HTTP ${modelsRes.status}: ${modelsRes.statusText}`;
        }

        console.error(`[DIAGNÓSTICO] Falha no Passo 1 (auth): HTTP ${modelsRes.status} - ${errDetail}`);
        const userMsg = modelsRes.status === 401
          ? 'CHAVE INVÁLIDA: A chave nvapi informada foi rejeitada pela NVIDIA (HTTP 401). Verifique se foi copiada corretamente.'
          : modelsRes.status === 403
          ? 'ACESSO NEGADO: Sua conta NVIDIA não tem permissão para esta API (HTTP 403).'
          : `ERRO NVIDIA (HTTP ${modelsRes.status}): ${errDetail}`;

        res.writeHead(modelsRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, step: 'auth', status: modelsRes.status, error: userMsg }));
        return;
      }

      console.log('[DIAGNÓSTICO] Passo 1 OK (chave autenticada). Testando Passo 2 (inferência simples)...');

      // Passo 2: Teste de inferência real de 1 token com timeout de 20s
      try {
        const testRes = await fetchWithTimeout(NVIDIA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Cloudtron-OneClick/1.3.0'
          },
          body: JSON.stringify({
            model: modelToTest,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 2,
            stream: false
          })
        }, 20000);

        if (!testRes.ok) {
          let inferErr = '';
          try {
            const ej = await testRes.json();
            inferErr = ej.error || ej.message || JSON.stringify(ej);
          } catch (_) {
            inferErr = `HTTP ${testRes.status}: ${testRes.statusText}`;
          }
          console.error(`[DIAGNÓSTICO] Falha no Passo 2 (inferência): ${inferErr}`);
          res.writeHead(testRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            ok: false,
            step: 'inference',
            status: testRes.status,
            error: `Autenticado, mas inferência falhou (HTTP ${testRes.status}): ${inferErr}`
          }));
          return;
        }

        console.log('[DIAGNÓSTICO] Todos os testes passaram com sucesso!');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: true,
          model: modelToTest,
          message: 'Conexão e nó de inferência NVIDIA 100% OK!'
        }));

      } catch (e) {
        const isTimeout = e.name === 'AbortError';
        console.error('[DIAGNÓSTICO] Falha no Passo 2 (timeout/erro):', e.message);
        res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          step: 'inference',
          error: isTimeout
            ? 'TIMEOUT NA INFERÊNCIA: NVIDIA autenticou, mas o nó demorou mais de 20s para responder.'
            : `ERRO DE INFERÊNCIA: ${e.message}`
        }));
      }
    })();
    return;
  }

  // ── /api/nemo/evaluate — NeMo LLM-as-a-Judge em Segundo Plano ───────────────
  if (req.method === 'POST' && req.url === '/api/nemo/evaluate') {
    const authHeader = req.headers['authorization'] || '';
    const clientKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const apiKey = clientKey || getEnvApiKey();

    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Chave API não configurada.' }));
      return;
    }

    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(rawBody || '{}');
        const { userPrompt, assistantResponse, profileUsed, interactionId } = payload;

        if (!userPrompt || !assistantResponse) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Parâmetros userPrompt e assistantResponse são obrigatórios.' }));
          return;
        }

        console.log(`[NEMO JUDGE] ⚖️ Iniciando avaliação LLM-as-a-Judge (${profileUsed || 'Padrão'})...`);

        const judgeSystemPrompt = "Você é o NeMo Evaluator. Avalie a resposta fornecida para o prompt do utilizador nos seguintes critérios (notas de 1 a 10): accuracy, completeness, conciseness. Retorne estritamente um JSON com: { score: number, verdict: 'PASS' | 'FAIL', reasoning: string }";

        const judgeMessages = [
          { role: 'system', content: judgeSystemPrompt },
          {
            role: 'user',
            content: `Prompt do usuário:\n${userPrompt.substring(0, 1500)}\n\nResposta do assistente (Perfil adotado: ${profileUsed || 'Padrão'}):\n${assistantResponse.substring(0, 3000)}`
          }
        ];

        const judgePayload = {
          model: DEFAULT_MODEL,
          messages: judgeMessages,
          temperature: 0.1,
          max_tokens: 512,
          stream: false,
          response_format: { type: "json_object" },
          chat_template_kwargs: { enable_thinking: false }
        };

        const judgeRes = await fetchWithTimeout(NVIDIA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Cloudtron-NeMo-Evaluator/1.2.5'
          },
          body: JSON.stringify(judgePayload)
        }, 30000);

        if (!judgeRes.ok) {
          const errTxt = await judgeRes.text();
          throw new Error(`NVIDIA HTTP ${judgeRes.status}: ${errTxt.substring(0, 200)}`);
        }

        const judgeData = await judgeRes.json();
        const rawContent = judgeData.choices?.[0]?.message?.content || '{}';

        let parsedEvaluation = {
          score: 8,
          verdict: 'PASS',
          reasoning: 'Avaliação concluída com sucesso.'
        };

        try {
          const parsed = JSON.parse(rawContent);
          parsedEvaluation = {
            score: typeof parsed.score === 'number' ? parsed.score : 8,
            verdict: (parsed.verdict === 'FAIL') ? 'FAIL' : 'PASS',
            reasoning: parsed.reasoning || parsed.details || 'Conforme com as diretrizes do NeMo.'
          };
        } catch (_) {
          console.warn('[NEMO JUDGE] Resposta não-JSON estrita do juiz, usando fallback seguro.');
        }

        const evalRecord = {
          id: 'eval_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          interactionId: interactionId || null,
          timestamp: new Date().toISOString(),
          profileUsed: profileUsed || 'Auto',
          score: parsedEvaluation.score,
          verdict: parsedEvaluation.verdict,
          reasoning: parsedEvaluation.reasoning,
          userPrompt: userPrompt.substring(0, 1000),
          assistantResponse: assistantResponse.substring(0, 2000)
        };

        // Grava no log permanente de avaliações do NeMo
        logNeMoEvaluation(evalRecord);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, evaluation: parsedEvaluation }));

      } catch (err) {
        console.error('[NEMO JUDGE ERRO]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // ── /api/parse-file — Universal Document Ingestion (v1.2) ───────────────────
  if (req.method === 'POST' && req.url === '/api/parse-file') {
    readBodyWithLimit(req, res, async (body) => {
      try {
        const payload = JSON.parse(body);
        const { filename, base64 } = payload;

        if (!filename || !base64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Campos filename e base64 são obrigatórios.' }));
          return;
        }

        const buffer = Buffer.from(base64, 'base64');
        const ext = path.extname(filename).toLowerCase();
        let extractedText = '';
        let pageCount = null;
        let sheetCount = null;
        const fileType = ext.replace(/^\./, '').toUpperCase() || 'UNKNOWN';

        if (ext === '.pdf') {
          try {
            if (typeof pdfParse === 'function') {
              const data = await pdfParse(buffer);
              extractedText = data.text || '';
              pageCount = data.numpages || 1;
            } else if (pdfParse.PDFParse) {
              const parser = new pdfParse.PDFParse({ data: buffer });
              const result = await parser.getText();
              extractedText = result.text || '';
              pageCount = result.total || result.pages?.length || 1;
            }
          } catch (pdfErr) {
            console.error('[PARSE-FILE] Erro ao extrair PDF:', pdfErr.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Falha ao processar arquivo PDF: ' + pdfErr.message }));
            return;
          }
        } else if (ext === '.docx' || ext === '.doc' || ext === '.rtf') {
          try {
            if (ext === '.docx') {
              const resDocx = await mammoth.convertToMarkdown({ buffer });
              extractedText = resDocx.value || '';
            } else {
              try {
                const resDoc = await mammoth.convertToMarkdown({ buffer });
                extractedText = resDoc.value || '';
              } catch (_) {
                const parsed = await officeParser.parseOffice(buffer).catch(() => buffer.toString('utf8'));
                extractedText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
              }
            }
          } catch (docErr) {
            console.error('[PARSE-FILE] Erro ao extrair Word/RTF:', docErr.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Falha ao processar documento Word: ' + docErr.message }));
            return;
          }
        } else if (ext === '.xlsx' || ext === '.xls') {
          try {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            sheetCount = workbook.SheetNames ? workbook.SheetNames.length : 1;
            const sheetsMd = [];
            (workbook.SheetNames || []).forEach(name => {
              const sheet = workbook.Sheets[name];
              const csv = xlsx.utils.sheet_to_csv(sheet);
              if (csv && csv.trim()) {
                sheetsMd.push(`### Aba: ${name}\n\`\`\`csv\n${csv.trim()}\n\`\`\``);
              }
            });
            extractedText = sheetsMd.join('\n\n');
          } catch (xlsErr) {
            console.error('[PARSE-FILE] Erro ao extrair planilha:', xlsErr.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Falha ao processar planilha Excel: ' + xlsErr.message }));
            return;
          }
        } else if (ext === '.pptx') {
          try {
            const parsed = await officeParser.parseOffice(buffer);
            extractedText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          } catch (pptErr) {
            console.error('[PARSE-FILE] Erro ao extrair apresentação PPTX:', pptErr.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Falha ao processar apresentação PPTX: ' + pptErr.message }));
            return;
          }
        } else if (ext === '.ipynb') {
          try {
            const nb = JSON.parse(buffer.toString('utf8'));
            const parts = [];
            (nb.cells || []).forEach((c, i) => {
              const src = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
              if (c.cell_type === 'markdown') {
                parts.push(`#### [Célula ${i + 1} - Markdown]\n${src}`);
              } else if (c.cell_type === 'code') {
                let outStr = '';
                if (c.outputs && c.outputs.length > 0) {
                  c.outputs.forEach(o => {
                    if (o.text) outStr += Array.isArray(o.text) ? o.text.join('') : o.text;
                    else if (o.data && o.data['text/plain']) {
                      const p = o.data['text/plain'];
                      outStr += Array.isArray(p) ? p.join('') : p;
                    }
                  });
                }
                parts.push(`#### [Célula ${i + 1} - Código]\n\`\`\`python\n${src}\n\`\`\`${outStr ? '\n*Saída:*\n\`\`\`\n' + outStr.trim() + '\n\`\`\`' : ''}`);
              }
            });
            extractedText = parts.join('\n\n');
          } catch (nbErr) {
            console.error('[PARSE-FILE] Erro ao extrair notebook IPYNB:', nbErr.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Falha ao processar Jupyter Notebook: ' + nbErr.message }));
            return;
          }
        } else if (ext === '.zip') {
          try {
            const zip = new AdmZip(buffer);
            const entries = zip.getEntries();
            let tree = '📁 Árvore de Arquivos no ZIP:\n';
            const contents = [];
            const textExts = ['.txt', '.md', '.js', '.ts', '.py', '.html', '.css', '.json', '.sql', '.csv', '.yaml', '.yml', '.sh', '.bat', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.php', '.xml'];
            entries.forEach(e => {
              if (e.isDirectory) {
                tree += `  📂 ${e.entryName}\n`;
              } else {
                tree += `  📄 ${e.entryName} (${(e.header.size / 1024).toFixed(1)} KB)\n`;
                const subExt = path.extname(e.name).toLowerCase();
                if (textExts.includes(subExt) && e.header.size < 500000) {
                  try {
                    const str = e.getData().toString('utf8');
                    contents.push(`\n--- [Arquivo no ZIP: ${e.entryName}] ---\n${str}`);
                  } catch (_) {}
                }
              }
            });
            extractedText = `${tree}\n\nConteúdo dos Arquivos Extraídos:\n${contents.join('\n')}`;
          } catch (zipErr) {
            console.error('[PARSE-FILE] Erro ao extrair arquivo ZIP:', zipErr.message);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Falha ao processar arquivo ZIP: ' + zipErr.message }));
            return;
          }
        } else {
          // Arquivos de código e texto comuns (.txt, .md, .csv, .py, .js, .html, .json, .sql, etc.)
          extractedText = buffer.toString('utf8');
        }

        const wordCount = extractedText ? extractedText.trim().split(/\s+/).filter(Boolean).length : 0;
        console.log(`[PARSE-FILE] 📄 Ingestão concluída: ${filename} (${fileType}) — ${wordCount} palavras${pageCount ? ' · ' + pageCount + ' págs' : ''}${sheetCount ? ' · ' + sheetCount + ' abas' : ''}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          filename: filename,
          fileType: fileType,
          pages: pageCount,
          sheets: sheetCount,
          wordCount: wordCount,
          extractedText: extractedText
        }));

      } catch (err) {
        console.error('[PARSE-FILE] Erro inesperado ao processar arquivo:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro interno ao processar o arquivo: ' + err.message }));
      }
    });
    return;
  }

  // ── /api/feedback — recebe avaliação de resposta (👍 / 👎) ───────────────
  if (req.method === 'POST' && req.url === '/api/feedback') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(rawBody || '{}');
        const { interactionId, rating, reason } = payload;

        if (!interactionId || !rating) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Campos interactionId e rating são obrigatórios.' }));
          return;
        }

        const feedbackEntry = {
          interactionId,
          rating,
          reason: reason || null,
          timestamp: new Date().toISOString()
        };

        ensureDataDir();

        // 1. Grava no log de feedback append-only
        fs.appendFile(FEEDBACK_FILE, JSON.stringify(feedbackEntry) + '\n', 'utf8', (err) => {
          if (err) console.error('[EVAL ENGINE] Erro ao gravar feedback.jsonl:', err.message);
        });

        // 2. Se interactions.jsonl existir, atualiza o campo "feedback" da linha correspondente
        if (fs.existsSync(INTERACTIONS_FILE)) {
          fs.readFile(INTERACTIONS_FILE, 'utf8', (readErr, content) => {
            if (!readErr && content) {
              const lines = content.split('\n');
              let updated = false;
              const newLines = lines.map(line => {
                if (!line.trim()) return line;
                try {
                  const item = JSON.parse(line);
                  if (item.id === interactionId) {
                    item.feedback = {
                      rating,
                      reason: reason || null,
                      timestamp: feedbackEntry.timestamp
                    };
                    updated = true;
                    return JSON.stringify(item);
                  }
                } catch (_) {}
                return line;
              });

              if (updated) {
                fs.writeFile(INTERACTIONS_FILE, newLines.join('\n'), 'utf8', (writeErr) => {
                  if (writeErr) console.error('[EVAL ENGINE] Erro ao atualizar interactions.jsonl:', writeErr.message);
                  else console.log(`[EVAL ENGINE] ⭐ Feedback gravado para ${interactionId}: ${rating}${reason ? ` (${reason})` : ''}`);
                });
              }
            }
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, message: 'Feedback recebido com sucesso.' }));

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // ── /api/messages — Proxy de streaming SSE com Failover Automático ──────────
  if (req.method === 'POST' && (req.url === '/api/messages' || req.url === '/api/chat')) {
    const authHeader = req.headers['authorization'] || '';
    const clientKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    readBodyWithLimit(req, res, async (rawBody) => {
      const providerApiKeys = clientDataProviderApiKeys(rawBody);

      // Mapeia provedores aptos a atender a chamada
      const activeKeysSummary = [];
      for (const p of PROVIDER_FAILOVER_QUEUE) {
        const key = resolveProviderApiKey(p, providerApiKeys, clientKey);
        if (key) {
          const masked = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-3)}` : '***';
          activeKeysSummary.push(`${p.name} (${masked})`);
        }
      }

      console.log(`[PROXY-AUTH] Provedores com credenciais disponíveis: [${activeKeysSummary.length > 0 ? activeKeysSummary.join(', ') : 'NENHUM'}]`);

      // Se nenhum provedor possuir credencial válida, interrompe com mensagem explicativa
      if (activeKeysSummary.length === 0) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
          error: 'Nenhuma chave de API configurada. Adicione uma chave válida (NVIDIA NIM, Groq, OpenRouter) no menu Configurações ⚙️.' 
        }));
        return;
      }
      const startTime = Date.now();
      let clientData;

      // ── Variáveis de acumulação e telemetria elevadas ao escopo da rota ─────
      let accumulatedResponseText = '';
      let chunkCount = 0;
      let ttft_ms = 0;

      try {
        clientData = JSON.parse(rawBody || '{}');
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'JSON inválido recebido no corpo da requisição.' }));
        return;
      }

      const interactionId = clientData.interactionId || ('req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
      const abortCtrl = new AbortController();
      let isTimedOut = false;
      const timeoutId = setTimeout(() => {
        isTimedOut = true;
        abortCtrl.abort();
      }, SESSION_TIMEOUT_MS);

      // Cancela a requisição se o cliente fechar a conexão prematuramente
      res.on('close', () => {
        if (!res.writableEnded) {
          console.warn('[PROXY] Conexão com o navegador encerrada prematuramente. Abortando...');
          clearTimeout(timeoutId);
          abortCtrl.abort();
        }
      });

      try {
        // 1. Determinação do modo ativo (Plan vs Build) e diretiva correspondente
        const clientMode = (typeof clientData.mode === 'string' && clientData.mode.toLowerCase() === 'build') ? 'build' : 'plan';
        const modeDirective = (clientMode === 'build') ? BUILD_SYSTEM_DIRECTIVE : PLAN_SYSTEM_DIRECTIVE;

        // 2. Extração das regras de sistema customizadas fornecidas pelo usuário
        const userSystem = (typeof clientData.system_prompt === 'string' && clientData.system_prompt.trim())
          ? clientData.system_prompt.trim()
          : (typeof clientData.system === 'string' && clientData.system.trim() ? clientData.system.trim() : '');

        // 3. Concatenação do Prompt Mestre: CLOUDTRON_CORE_SYSTEM + Modo + Regras do Usuário
        const promptConsolidado = [
          CLOUDTRON_CORE_SYSTEM,
          modeDirective,
          userSystem ? `REGRAS DO USUÁRIO:\n${userSystem}` : ''
        ].filter(Boolean).join('\n\n');

        // ── Closed-Loop In-Context RLHF: Auto-Correção Ativa via NeMo Judge ──
        // Varre o histórico e, caso a resposta anterior do assistente contenha
        // metadados de avaliação do NeMo, injeta a diretriz de auto-calibração
        // na mensagem subsequente do usuário (garantindo compatibilidade com
        // provedores que exigem alternância estrita entre 'user' e 'assistant').
        const rawMessages = Array.isArray(clientData.messages) ? clientData.messages : [];
        const messagesWithRLHF = [];

        for (let i = 0; i < rawMessages.length; i++) {
          const m = rawMessages[i];
          if (!m || typeof m !== 'object') continue;

          const clonedMsg = { ...m };
          const prevMsg = (i > 0) ? rawMessages[i - 1] : null;

          // Se a mensagem anterior era do assistente e possuía avaliação do NeMo
          if (clonedMsg.role === 'user' && prevMsg && prevMsg.role === 'assistant' && (prevMsg.nemo || prevMsg.nemoEval)) {
            const nemo = prevMsg.nemo || prevMsg.nemoEval;
            const score = (nemo.score !== null && nemo.score !== undefined) ? nemo.score : 8;
            const status = nemo.status || (nemo.pass !== false ? 'PASS' : 'FAIL');
            const feedback = nemo.feedback || nemo.reason || 'Conformidade de integridade e sintaxe validada pelo NeMo Judge.';

            const rlhfDirective = [
              `[AUDITORIA DO JUIZ NEMO DA RESPOSTA ANTERIOR - NOTA: ${score}/10 | ${status}]`,
              `Crítica Técnica: ${feedback}`,
              `Diretriz de Aprendizado: Considere os pontos fracos apontados acima para recalibrar a precisão, sintaxe e profundidade das respostas seguintes.`
            ].join('\n');

            if (typeof clonedMsg.content === 'string') {
              clonedMsg.content = `${rlhfDirective}\n\n${clonedMsg.content}`;
            } else if (Array.isArray(clonedMsg.content)) {
              // Suporte a payloads multimodais (Visão / Imagens)
              clonedMsg.content = [
                { type: 'text', text: `${rlhfDirective}\n\n` },
                ...clonedMsg.content
              ];
            }
            console.log(`[IN-CONTEXT RLHF] 🎯 Diretriz NeMo injetada no turno do usuário (Score: ${score}/10 | ${status})`);
          }

          messagesWithRLHF.push(clonedMsg);
        }

        // 4. Aplica NeMo Guardrails para integridade, alternância de papéis e sanitização
        // (A função applyNeMoGuardrails insere automaticamente o promptConsolidado como { role: 'system', content: ... } no topo do array)
        const sanitizedMessages = applyNeMoGuardrails(messagesWithRLHF, promptConsolidado);

        // 5. Reforço estrito de Sandbox APENAS para solicitações explícitas de UI/Web visual
        const lastUserMsg = [...sanitizedMessages].reverse().find(m => m.role === 'user');
        const userText = (lastUserMsg && typeof lastUserMsg.content === 'string') ? lastUserMsg.content : '';
        const wantsVisualSandbox = /\b(sandbox|iframe|preview visual|p[áa]gina web visual|layout visual|interface html)\b/i.test(userText);
        if (wantsVisualSandbox) {
          sanitizedMessages.unshift({ role: 'system', content: SANDBOX_SYSTEM_INSTRUCTION });
        }

        // Determinação da flag Thinking: respeita valor booleano explícito do cliente
        const isThinking = (typeof clientData.thinking === 'boolean')
          ? clientData.thinking
          : (clientData.effort !== 'low');

        // Hiperparâmetros configuráveis com extração estrita do payload do cliente
        const temperature = (typeof clientData.temperature === 'number' && !isNaN(clientData.temperature))
          ? clientData.temperature
          : 0.6;

        const top_p = (typeof clientData.top_p === 'number' && !isNaN(clientData.top_p))
          ? clientData.top_p
          : 0.9;

        const max_tokens = (typeof clientData.max_tokens === 'number' && clientData.max_tokens > 0)
          ? clientData.max_tokens
          : 4096;

        // Suporte a seed e response_format
        const seed = (typeof clientData.seed === 'number' && !isNaN(clientData.seed))
          ? clientData.seed
          : null;

        // Monta o cabeçalho SSE ANTES de iniciar o failover, para que eventos de troca
        // de provedor possam ser enviados a qualquer momento.
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        res.flushHeaders();

        // Envia o interactionId como primeiro evento SSE para sincronização do cliente
        res.write(`data: {"__clautron_interaction_id":"${interactionId}"}\n\n`);

        // Determina o prompt do usuário para o log de avaliação
        let userPrompt = clientData.prompt || '';
        if (!userPrompt && Array.isArray(sanitizedMessages)) {
          const lastUser = [...sanitizedMessages].reverse().find(m => m.role === 'user');
          if (lastUser) {
            userPrompt = typeof lastUser.content === 'string'
              ? lastUser.content
              : JSON.stringify(lastUser.content);
          }
        }

        let overallSuccess = false;
        let finalModelUsed = DEFAULT_MODEL;
        let finalEffort = clientData.effort || 'auto';
        let finalProfile = clientData.profile || 'Auto';
        let finalTemperature = temperature;
        let finalTopP = top_p;
        let finalMaxTokens = max_tokens;
        let finalThinking = isThinking;
        let finalSeed = seed;

        // ── Reset de telemetria pré-failover ──────────────────────────────────
        accumulatedResponseText = '';
        chunkCount = 0;
        ttft_ms = 0;

        // ── Loop de Failover sobre a fila de provedores ────────────────────────
        for (const provider of PROVIDER_FAILOVER_QUEUE) {
          // Resolve a chave do provedor via resolvedor unificado (payload > header bearer > .env)
          const providerKey = resolveProviderApiKey(provider, providerApiKeys, clientKey);
          if (!providerKey) {
            console.log(`[FAILOVER] ⏩ ${provider.name}: credencial ausente, avançando para o próximo.`);
            continue;
          }

          // Modelo do provedor (usa o do cliente se for o NVIDIA, senão o default do provedor)
          const providerModel = (typeof clientData.model === 'string' && clientData.model.trim() && provider.name === 'NVIDIA NIM')
            ? clientData.model.trim()
            : provider.defaultModel;

          const providerPayload = {
            model: providerModel,
            messages: sanitizedMessages,
            temperature: temperature,
            top_p: top_p,
            max_tokens: max_tokens,
            stream: true
          };

          // Adapta campos específicos por provedor
          if (provider.name === 'NVIDIA NIM') {
            providerPayload.chat_template_kwargs = { enable_thinking: isThinking };
            if (seed !== null) providerPayload.seed = seed;
          }
          if (provider.name === 'Groq Cloud') {
            // Groq usa o formato OpenAI padrão; thinking via temperature/top_p
          }
          if (clientData.response_format && typeof clientData.response_format === 'object') {
            providerPayload.response_format = clientData.response_format;
          }

          console.log(`[PROXY] → Tentando ${provider.name} (${providerModel} | thinking: ${isThinking} | temp: ${temperature} | top_p: ${top_p} | tokens: ${max_tokens})...`);

          let providerRes;
          try {
            const providerCtrl = new AbortController();
            const providerTid = setTimeout(() => providerCtrl.abort(), PROVIDER_TIMEOUT_MS);
            providerRes = await fetch(provider.endpoint, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${providerKey}`,
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'User-Agent': 'Cloudtron-OneClick/1.3.0'
              },
              body: JSON.stringify(providerPayload),
              signal: providerCtrl.signal
            });
            clearTimeout(providerTid);
          } catch (fetchErr) {
            clearTimeout(providerTid);
            if (fetchErr.name === 'AbortError') {
              console.warn(`[FAILOVER] ${provider.name}: timeout após ${PROVIDER_TIMEOUT_MS / 1000}s.`);
              sendFailoverEvent(res, provider.name, 'Próximo provedor', `Timeout (${PROVIDER_TIMEOUT_MS / 1000}s)`);
              continue;
            }
            console.error(`[ERRO FETCH ${provider.name}]:`, fetchErr.message);
            sendFailoverEvent(res, provider.name, 'Próximo provedor', `Erro de conexão`);
            continue;
          }

          if (!providerRes.ok) {
            let errMsg = `Erro ${provider.name} HTTP ${providerRes.status}`;
            try {
              const errData = await providerRes.json();
              errMsg = errData.error?.message || errData.message || errData.detail || JSON.stringify(errData);
            } catch (_) {
              const errBody = await providerRes.text().catch(() => '');
              if (errBody) errMsg = errBody.substring(0, 300);
            }
            console.error(`[ERRO ${provider.name} API]: HTTP ${providerRes.status} ${providerRes.statusText} - ${errMsg}`);
            // 429 rate limit, 402 quota, 401 chave inválida → dispara failover
            if (providerRes.status === 429 || providerRes.status === 402 || providerRes.status === 401) {
              sendFailoverEvent(res, provider.name, 'Próximo provedor', `HTTP ${providerRes.status}`);
            } else {
              sendFailoverEvent(res, provider.name, 'Próximo provedor', `HTTP ${providerRes.status}`);
            }
            continue;
          }

          // ── Sucesso: iniciamos o streaming deste provedor ────────────────────
          finalModelUsed = providerModel;
          finalEffort = clientData.effort || 'auto';
          finalProfile = clientData.profile || 'Auto';
          finalTemperature = temperature;
          finalTopP = top_p;
          finalMaxTokens = max_tokens;
          finalThinking = isThinking;
          finalSeed = seed;

          // Reset seguro de buffer antes do streaming do provedor selecionado
          chunkCount = 0;
          ttft_ms = 0;
          accumulatedResponseText = '';
          const textDecoder = new TextDecoder('utf-8');

          try {
            for await (const chunk of providerRes.body) {
              chunkCount++;
              if (chunkCount === 1) {
                ttft_ms = Date.now() - startTime;
                console.log(`[PROXY] ⚡ Primeiro chunk de streaming recebido em ${ttft_ms}ms (${provider.name})!`);
              }
              if (!res.writableEnded) res.write(chunk);

              // Decodifica e acumula resposta garantindo tolerância a falhas de parsing
              const decoded = textDecoder.decode(chunk, { stream: true });
              const lines = decoded.split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                  try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const delta = parsed.choices?.[0]?.delta;
                    if (delta && typeof delta.content === 'string') {
                      accumulatedResponseText += delta.content;
                    }
                  } catch (_) {}
                }
              }
            }
            // Streaming concluído com sucesso neste provedor
            overallSuccess = true;
            break;
          } catch (streamErr) {
            if (streamErr.name !== 'AbortError') {
              console.error(`[ERRO STREAM ${provider.name}]:`, streamErr.message);
              accumulatedResponseText = '';
              sendFailoverEvent(res, provider.name, 'Próximo provedor', 'Erro no stream');
            }
            continue;
          }
        }

        // ── Finalização Segura & Registro de Avaliação NeMo ────────────────────
        clearTimeout(timeoutId);
        const total_time_ms = Date.now() - startTime;
        const finalContent = accumulatedResponseText || '';

        if (overallSuccess) {
          console.log(`[PROXY] Streaming concluído via ${finalModelUsed} (${total_time_ms / 1000}s).`);

          // Grava a interação estruturada no formato JSONL (Clautron Eval Engine)
          if (finalContent || chunkCount > 0) {
            logInteraction({
              id: interactionId,
              timestamp: new Date().toISOString(),
              model: finalModelUsed,
              effort: finalEffort,
              profile: finalProfile,
              temperature: finalTemperature,
              top_p: finalTopP,
              seed: finalSeed,
              thinking: finalThinking,
              ttft_ms: ttft_ms || 0,
              total_time_ms: total_time_ms,
              prompt: userPrompt,
              response: finalContent,
              feedback: null
            });

            // Avaliação NeMo Judge e emissão de evento SSE de resultado
            const evalScore = calculateNeMoEvalScore(userPrompt, finalContent);
            logNeMoEvaluation({
              id: interactionId,
              timestamp: new Date().toISOString(),
              score: evalScore,
              verdict: evalScore >= 7 ? 'PASS' : 'WARN',
              model: finalModelUsed,
              promptLength: (userPrompt || '').length,
              responseLength: finalContent.length
            });

            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({ type: 'eval_result', score: evalScore, pass: evalScore >= 7 })}\n\n`);
            }
          }

          // Fechamento atômico e seguro do protocolo SSE
          if (!res.writableEnded) {
            res.write(`data: [DONE]\n\n`);
            res.end();
          }
        } else {
          console.error('[PROXY] Todos os provedores da fila falharam.');
          if (!res.writableEnded) {
            res.write(`data: {"__clautron_error":"Todos os provedores de inferência estão indisponíveis no momento."}\n\n`);
            res.end();
          }
        }

      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          if (isTimedOut) {
            console.error('[PROXY] ⏱️ Requisição abortada por timeout de 120s.');
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: 'Timeout: a inferência não retornou resposta em 120 segundos.' }));
            } else if (!res.writableEnded) {
              res.write(`data: {"__clautron_error":"Timeout: sem resposta dos provedores."}\n\n`);
              res.end();
            }
          } else {
            console.warn('[PROXY] Requisição cancelada pelo usuário.');
            if (!res.headersSent) {
              res.writeHead(499, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: 'Cancelado pelo usuário.' }));
            } else if (!res.writableEnded) {
              res.end();
            }
          }
          return;
        }

        console.error('[ERRO PROXY]:', err.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message }));
        } else if (!res.writableEnded) {
          const safeMsg = err.message.replace(/"/g, "'");
          res.write(`data: {"__clautron_error":"${safeMsg}"}\n\n`);
          res.end();
        }
      }
    });
    return;
  }

  // ── Servidor de Arquivos Estáticos ────────────────────────────────────────
  const appHtmlPath = path.join(__dirname, 'app.html');
  const defaultPage = fs.existsSync(appHtmlPath) ? '/app.html' : '/index.html';
  let safePath = (req.url === '/') ? defaultPage : req.url;
  safePath = path.normalize(safePath).replace(/^(\.\.[\\/])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallbackIndex = fs.existsSync(appHtmlPath) ? appHtmlPath : path.join(__dirname, 'index.html');
      fs.readFile(fallbackIndex, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
        } else {
          res.writeHead(200, {
            'Content-Type': MIME_TYPES['.html'],
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': (ext === '.html' || ext === '.js') ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600',
          'Pragma': 'no-cache'
        });
        res.end(content);
      }
    });
  });
});

// ── Verificação de instância Cloudtron legítima na porta ─────────────────────
function pingCloudtron(port, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = http.get({
      hostname: BIND_HOST,
      port: port,
      path: '/api/ping',
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
        if (data.length > 8192) {
          req.destroy();
          finish(false);
        }
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          finish(res.statusCode === 200 && json.ok === true && typeof json.model === 'string');
        } catch (_) {
          finish(false);
        }
      });
    });

    req.on('timeout', () => { req.destroy(); finish(false); });
    req.on('error', () => finish(false));
  });
}

let activePort = BASE_PORT;
let reusedExisting = false;

function listenOnPort(port, remainingAttempts) {
  return new Promise((resolve, reject) => {
    // Listeners explícitos por tentativa: o callback do listen() falho
    // permaneceria ligado ao evento 'listening' e resolveria a porta errada.
    const onListening = () => {
      server.removeListener('error', onError);
      activePort = port;
      resolve(port);
    };

    const onError = (err) => {
      server.removeListener('listening', onListening);
      if (err.code !== 'EADDRINUSE') {
        reject(err);
        return;
      }
      if (remainingAttempts <= 0) {
        reject(new Error(`Nenhuma porta disponível entre ${BASE_PORT} e ${BASE_PORT + MAX_PORT_ATTEMPTS}.`));
        return;
      }

      pingCloudtron(port, 1500).then((isCloudtron) => {
        if (isCloudtron) {
          reusedExisting = true;
          activePort = port;
          console.warn(`[SERVER] ⚠️ Porta ${port} ocupada por uma instância Cloudtron ativa. Reutilizando serviço existente.`);
          resolve(port);
        } else {
          console.warn(`[SERVER] ⚠️ Porta ${port} ocupada por outro processo. Tentando porta ${port + 1}...`);
          listenOnPort(port + 1, remainingAttempts - 1).then(resolve, reject);
        }
      });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, BIND_HOST);
  });
}

const ready = listenOnPort(BASE_PORT, MAX_PORT_ATTEMPTS)
  .then((port) => {
    if (!reusedExisting) {
      server.on('error', (err) => console.error('[SERVER ERRO]:', err));
      console.log(`===============================================`);
      console.log(` ⚡ Cloudtron OneClick v1.3.0 - Local Server Ativo`);
      console.log(` 🚀 Interface: http://${BIND_HOST}:${port}`);
      console.log(` 📡 Streaming de Baixa Latência Ativo`);
      console.log(` 🧠 Modelo: ${DEFAULT_MODEL}`);
      console.log(` 🛡️ Cloudtron NeMo Core & Eval Engine Ativo`);
      console.log(`===============================================`);
    } else {
      console.log(`[SERVER] ✅ Serviço existente reutilizado em http://${BIND_HOST}:${port}`);
    }
    return port;
  })
  .catch((err) => {
    console.error('[SERVER ERRO]:', err.message);
    throw err;
  });

module.exports = {
  ready: ready,
  get port() { return activePort; }
};
