/**
 * Cloudtron OneClick — Electron Main Process (v1.4.0)
 * Author: Felipe Monroe
 * License: MIT
 */

// Captura erros de rede/porta para reutilizar servidor existente sem quebrar a UI
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn('[ELECTRON] Porta 3000 já está em uso por uma instância ativa do Cloudtron; reutilizando serviço local.');
    return;
  }
  console.error('[ELECTRON] Exceção não tratada:', err);
});

// Prioriza IPv4 para evitar timeouts de DNS/Dual-Stack no Windows
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const { app, BrowserWindow, shell, globalShortcut, Menu, MenuItem } = require('electron');
const path = require('path');

// 1. Inicializa o servidor proxy local do Cloudtron em segundo plano
const FALLBACK_BASE_PORT = 3000;
let serverReadyPromise;
try {
  const cloudtronServer = require('./server.js');
  if (cloudtronServer && cloudtronServer.ready) {
    serverReadyPromise = cloudtronServer.ready.catch((err) => {
      console.warn('[ELECTRON] Falha ao iniciar servidor local:', err.message);
      return FALLBACK_BASE_PORT;
    });
  } else {
    serverReadyPromise = Promise.resolve(FALLBACK_BASE_PORT);
  }
} catch (err) {
  console.warn('[ELECTRON] Servidor proxy já ativo ou iniciado externamente:', err.message);
  serverReadyPromise = Promise.resolve(FALLBACK_BASE_PORT);
}

let mainWindow;
let appPort = FALLBACK_BASE_PORT;

const MAX_INITIAL_RETRIES = 10;
let initialRetries = 0;
let retryTimer = null;

function getAppUrl() {
  return `http://127.0.0.1:${appPort}`;
}

// Tela local de fallback exibida quando o serviço interno não responde
function buildFallbackPage(errorDetail) {
  const retryUrl = getAppUrl();
  const safeDetail = String(errorDetail || '')
    .replace(/[<>&"']/g, '')
    .slice(0, 200);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Cloudtron OneClick</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    background: #060913;
    color: #f8fafc;
    font-family: 'Segoe UI', Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .box {
    max-width: 520px;
    margin: 24px;
    padding: 40px 32px;
    text-align: center;
    background: #0f172a;
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 16px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  }
  h1 { font-size: 20px; margin: 0 0 12px; color: #38bdf8; }
  p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 22px; }
  button {
    background: #2dd4bf;
    border: none;
    color: #04070f;
    font-weight: 700;
    font-size: 14px;
    padding: 12px 28px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s ease;
  }
  button:hover { background: #14b8a6; }
  .detail {
    font-family: Consolas, monospace;
    font-size: 11px;
    color: #64748b;
    margin-top: 18px;
    word-break: break-word;
  }
</style>
</head>
<body>
  <div class="box">
    <h1>Não foi possível conectar ao serviço local</h1>
    <p>O servidor interno do Cloudtron não respondeu. Verifique se há outro aplicativo ocupando a porta <strong>${appPort}</strong> e tente novamente.</p>
    <button onclick="window.location.href='${retryUrl}'">Tentar novamente</button>
    ${safeDetail ? `<div class="detail">${safeDetail}</div>` : ''}
  </div>
</body>
</html>`;

  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function showConnectionFallback(errorDetail) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(buildFallbackPage(errorDetail)).catch(() => {});
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Cloudtron OneClick v1.4.0',
    backgroundColor: '#131314',
    autoHideMenuBar: true, // Oculta a barra de menu padrão do Windows
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // ── Habilitação do Menu de Contexto Nativo (Edição e Seleção de Texto) ───────
  mainWindow.webContents.on('context-menu', (event, params) => {
    const hasSelection = Boolean(params.selectionText && params.selectionText.trim());

    if (!params.isEditable && !hasSelection) {
      return;
    }

    const menu = new Menu();

    if (params.isEditable) {
      menu.append(new MenuItem({
        label: 'Desfazer',
        role: 'undo',
        enabled: Boolean(params.editFlags ? params.editFlags.canUndo : true)
      }));
      menu.append(new MenuItem({
        label: 'Refazer',
        role: 'redo',
        enabled: Boolean(params.editFlags ? params.editFlags.canRedo : true)
      }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Recortar',
        role: 'cut',
        enabled: Boolean(params.editFlags ? params.editFlags.canCut : true)
      }));
      menu.append(new MenuItem({
        label: 'Copiar',
        role: 'copy',
        enabled: Boolean(params.editFlags ? params.editFlags.canCopy : true)
      }));
      menu.append(new MenuItem({
        label: 'Colar',
        role: 'paste',
        enabled: Boolean(params.editFlags ? params.editFlags.canPaste : true)
      }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Selecionar Tudo',
        role: 'selectAll',
        enabled: Boolean(params.editFlags ? params.editFlags.canSelectAll : true)
      }));
      menu.popup({ window: mainWindow });
    } else if (hasSelection) {
      menu.append(new MenuItem({
        label: 'Copiar',
        role: 'copy',
        enabled: Boolean(params.editFlags ? params.editFlags.canCopy : true)
      }));
      menu.popup({ window: mainWindow });
    }
  });

  // Carrega a interface servida pelo proxy local com retry resiliente
  const scheduleRetry = (reason) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (retryTimer) return;
    if (initialRetries >= MAX_INITIAL_RETRIES) {
      console.error('[ELECTRON] Serviço local indisponível após várias tentativas:', reason);
      showConnectionFallback('Serviço local indisponível após várias tentativas.');
      return;
    }
    initialRetries++;
    console.warn(`[ELECTRON] Servidor local ainda inicializando (tentativa ${initialRetries}/${MAX_INITIAL_RETRIES})...`, reason || '');
    retryTimer = setTimeout(() => {
      retryTimer = null;
      loadApp();
    }, 350);
  };

  const loadApp = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.loadURL(getAppUrl()).then(() => {
      initialRetries = 0;
    }).catch((err) => {
      scheduleRetry(err.message);
    });
  };

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return; // ERR_ABORTED (redirecionamentos/navegação cancelada)
    if (typeof validatedURL === 'string' && validatedURL.startsWith('data:')) return;
    scheduleRetry(`${errorDescription} (${validatedURL})`);
  });

  serverReadyPromise.then((port) => {
    appPort = port || FALLBACK_BASE_PORT;
    loadApp();
  });

  // Força links externos a abrirem no navegador padrão do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Atalho F12 para abrir/fechar Console de Desenvolvedor (útil para diagnósticos)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Inicializa a janela quando o Electron estiver pronto
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Encerra completamente o aplicativo ao fechar a janela no Windows
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
