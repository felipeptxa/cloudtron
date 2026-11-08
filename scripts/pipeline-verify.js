#!/usr/bin/env node
/**
 * Cloudtron OneClick — Pipeline Verification Engine (v1.4.0)
 * Orquestra o ciclo contínuo: L4 (Auditoria Diff) -> L3 (Testes Unitários) -> L5 (Playwright E2E)
 * 
 * Uso:
 *   node scripts/pipeline-verify.js --stage review   (Apenas L4)
 *   node scripts/pipeline-verify.js --stage unit     (Apenas L3)
 *   node scripts/pipeline-verify.js --stage e2e      (Apenas L5)
 *   node scripts/pipeline-verify.js --all            (Pipeline completo L4 -> L3 -> L5)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const isReviewOnly = args.includes('--stage') && args.includes('review');
const isUnitOnly = args.includes('--stage') && args.includes('unit');
const isE2EOnly = args.includes('--stage') && args.includes('e2e');
const runAll = !isReviewOnly && !isUnitOnly && !isE2EOnly;

function logStep(step, message) {
  console.log(`\n\x1b[1m\x1b[36m[PIPELINE ${step}]\x1b[0m \x1b[32m${message}\x1b[0m`);
}

function logWarn(msg) {
  console.warn(`\x1b[33m⚠️  [ALERTA]\x1b[0m ${msg}`);
}

function logError(msg) {
  console.error(`\x1b[31m❌ [FALHA]\x1b[0m ${msg}`);
}

// ── L4: Revisor Cego & Auditoria Estática de Git Diff ─────────────────────────
function runL4ReviewStage() {
  logStep('L4', 'Auditoria Estática de Git Diff e Sanidade Contratual...');
  let hasErrors = false;

  // 1. Coleta arquivos modificados e não rastreados via git
  let gitStatusOutput = '';
  let gitDiffOutput = '';
  try {
    gitStatusOutput = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' });
    gitDiffOutput = execSync('git diff', { cwd: ROOT_DIR, encoding: 'utf8' });
  } catch (err) {
    logWarn(`Não foi possível executar comandos git: ${err.message}. Prosseguindo com auditoria física.`);
  }

  // 2. Detecção de arquivos temporários e lixo de build
  const JUNK_PATTERNS = [
    /\.tmp$/i,
    /\.log$/i,
    /\.bak$/i,
    /\.swp$/i,
    /Thumbs\.db$/i,
    /\.DS_Store$/i,
    /~$/
  ];

  if (gitStatusOutput) {
    const lines = gitStatusOutput.split('\n').filter(Boolean);
    console.log(`  Arquivos modificados/pendentes detectados: ${lines.length}`);
    for (const line of lines) {
      const filePath = line.slice(3).trim();
      const isJunk = JUNK_PATTERNS.some(rx => rx.test(filePath));
      if (isJunk) {
        logError(`Arquivo temporário ou resíduo de build detectado no workspace: "${filePath}"`);
        hasErrors = true;
      }
    }
  }

  // 3. Auditoria estrutural de server.js
  const serverPath = path.join(ROOT_DIR, 'server.js');
  if (fs.existsSync(serverPath)) {
    try {
      execSync(`node -c "${serverPath}"`, { stdio: 'pipe' });
      const serverContent = fs.readFileSync(serverPath, 'utf8');

      // Verifica presença de constantes vitais
      if (!serverContent.includes('CLOUDTRON_CORE_SYSTEM')) {
        logError('server.js: Constante obrigatória "CLOUDTRON_CORE_SYSTEM" não encontrada.');
        hasErrors = true;
      }
      if (!serverContent.includes('applyNeMoGuardrails')) {
        logError('server.js: Função "applyNeMoGuardrails" não encontrada.');
        hasErrors = true;
      }
      if (!serverContent.includes('/api/messages')) {
        logError('server.js: Rota vital "/api/messages" não encontrada.');
        hasErrors = true;
      }
    } catch (syntaxErr) {
      logError(`server.js: Erro de sintaxe detectado: ${syntaxErr.message}`);
      hasErrors = true;
    }
  } else {
    logError('server.js: Arquivo vital ausente na raiz do projeto.');
    hasErrors = true;
  }

  // 4. Auditoria estrutural de app.html e docs/app.html
  const htmlFiles = [path.join(ROOT_DIR, 'app.html'), path.join(ROOT_DIR, 'docs', 'app.html')];
  for (const htmlFile of htmlFiles) {
    if (!fs.existsSync(htmlFile)) continue;
    const content = fs.readFileSync(htmlFile, 'utf8');

    // Validação de profundidade de CSS (mesmo algoritmo do test/suite.js)
    const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
      const css = styleMatch[1];
      let depth = 0;
      let cssErrors = 0;
      for (let i = 0; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
          depth--;
          if (depth < 0) { cssErrors++; depth = 0; }
        }
      }
      if (depth !== 0 || cssErrors > 0) {
        logError(`${path.basename(htmlFile)}: Desbalanceamento de chaves CSS detectado (depth=${depth}, erros=${cssErrors}).`);
        hasErrors = true;
      }
    }

    // Validação de funções globais defensivas
    if (!content.includes('syncEffortUI')) {
      logError(`${path.basename(htmlFile)}: Função defensiva "syncEffortUI" ausente.`);
      hasErrors = true;
    }
    if (!content.includes('executeDirectCopy')) {
      logError(`${path.basename(htmlFile)}: Função "executeDirectCopy" ausente.`);
      hasErrors = true;
    }
    if (!content.includes('sidebar-resizer')) {
      logError(`${path.basename(htmlFile)}: Elemento vital "sidebar-resizer" não identificado.`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    logError('L4: Auditoria de integridade falhou. Corrija as inconsistências antes dos testes funcionais.');
    return false;
  }

  console.log('  ✅ L4: Auditoria estática de diff e sanidade aprovada 100%.');
  return true;
}

// ── L3: Suíte de Testes Unitários de Contrato (19 checks) ─────────────────────
function runL3UnitTestStage() {
  logStep('L3', 'Disparando Testes Unitários e de Contrato (19 checks)...');
  const result = spawnSync('node', ['test/suite.js'], { cwd: ROOT_DIR, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    logError(`L3: Falha na suíte de testes unitários (código de saída: ${result.status}).`);
    return false;
  }
  console.log('  ✅ L3: Suíte unitária e de integridade aprovada com sucesso.');
  return true;
}

// ── L5: Testes Ponta a Ponta via Playwright (Headless) ────────────────────────
function runL5E2EStage() {
  logStep('L5', 'Disparando Testes E2E com Playwright (Chromium Headless)...');
  const result = spawnSync('npx', ['playwright', 'test'], { cwd: ROOT_DIR, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    logError(`L5: Falha nos testes de ponta a ponta (E2E) com Playwright (código de saída: ${result.status}).`);
    return false;
  }
  console.log('  ✅ L5: Todos os cenários E2E validados com sucesso.');
  return true;
}

// ── Orquestração do Ciclo Completo ───────────────────────────────────────────
function main() {
  console.log('=================================================================');
  console.log('⚡ CLOUDTRON ONECLICK — PIPELINE DE VALIDAÇÃO CONTÍNUA (v1.4.0)');
  console.log('=================================================================');

  if (isReviewOnly) {
    const ok = runL4ReviewStage();
    process.exit(ok ? 0 : 1);
  }

  if (isUnitOnly) {
    const ok = runL3UnitTestStage();
    process.exit(ok ? 0 : 1);
  }

  if (isE2EOnly) {
    const ok = runL5E2EStage();
    process.exit(ok ? 0 : 1);
  }

  if (runAll) {
    // 1. L4: Revisor Cego / Auditoria Estática
    const l4Passed = runL4ReviewStage();
    if (!l4Passed) {
      logError('Interrupção precoce: O pipeline foi abortado no estágio L4.');
      process.exit(1);
    }

    // 2. L3: Testes Unitários
    const l3Passed = runL3UnitTestStage();
    if (!l3Passed) {
      logError('Interrupção precoce: O pipeline foi abortado no estágio L3.');
      process.exit(1);
    }

    // 3. L5: Validador Funcional E2E
    const l5Passed = runL5E2EStage();
    if (!l5Passed) {
      logError('Interrupção precoce: O pipeline foi abortado no estágio L5.');
      process.exit(1);
    }

    console.log('\n=================================================================');
    console.log('🎉 PIPELINE 100% APROVADO! Todos os estágios (L4 -> L3 -> L5) passaram.');
    console.log('=================================================================\n');
    process.exit(0);
  }
}

main();
