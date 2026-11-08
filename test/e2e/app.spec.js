// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Cloudtron OneClick v1.4.0 — Bateria E2E de Alta Integridade', () => {

  /**
   * Cenário 1: Conexão, Renderização e Ausência de Erros no Console
   */
  test('1. Deve carregar a interface em http://127.0.0.1:3000 sem erros no console', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');

    // Aguarda montagem dos elementos nucleares da interface
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#chatWindow')).toBeVisible();
    await expect(page.locator('#promptInput')).toBeVisible();
    await expect(page.locator('#sendBtn')).toBeVisible();

    // Filtra erros que impeçam o funcionamento da UI
    const fatalErrors = consoleErrors.filter(err => 
      err.includes('ReferenceError') || 
      err.includes('TypeError') || 
      err.includes('SyntaxError') ||
      err.includes('syncEffortUI is not defined') ||
      err.includes('effortTagToDisplay is not defined')
    );

    expect(fatalErrors, `Erros fatais detectados no Console: ${fatalErrors.join(' | ')}`).toHaveLength(0);
  });

  /**
   * Cenário 2: Redimensionamento e Persistência do Splitter da Barra Lateral
   */
  test('2. Deve redimensionar o #sidebar via arrasto e persistir a largura', async ({ page }) => {
    await page.goto('/');

    const sidebar = page.locator('#sidebar');
    const resizer = page.locator('#sidebar-resizer');

    await expect(sidebar).toBeVisible();
    await expect(resizer).toBeVisible();

    // Obtém largura inicial
    const initialBox = await sidebar.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialWidth = initialBox ? initialBox.width : 280;

    // Arrasta o divisor horizontalmente
    const resizerBox = await resizer.boundingBox();
    expect(resizerBox).not.toBeNull();

    if (resizerBox) {
      await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 100);
      await page.mouse.down();
      await page.mouse.move(resizerBox.x + 80, resizerBox.y + 100, { steps: 5 });
      await page.mouse.up();
    }

    // Verifica que a largura mudou e respeita os limites
    const newBox = await sidebar.boundingBox();
    expect(newBox).not.toBeNull();
    if (newBox) {
      expect(newBox.width).toBeGreaterThanOrEqual(170);
      expect(newBox.width).toBeLessThanOrEqual(480);
      expect(newBox.width).not.toEqual(initialWidth);
    }

    // Verifica persistência no localStorage
    const savedWidth = await page.evaluate(() => {
      return localStorage.getItem('cloudtron_sidebar_w') || localStorage.getItem('cloudtron_sidebar_width');
    });
    expect(savedWidth).not.toBeNull();

    // Recarrega a página e valida que a largura continua aplicada
    await page.reload();
    await expect(sidebar).toBeVisible();
    // Aguarda a transição CSS de width (0.22s) estabilizar antes de medir
    await page.waitForTimeout(350);
    const afterReloadBox = await sidebar.boundingBox();
    expect(afterReloadBox).not.toBeNull();
    if (afterReloadBox && newBox) {
      expect(Math.round(afterReloadBox.width)).toBeCloseTo(Math.round(newBox.width), -1);
    }
  });

  /**
   * Cenário 3: Botão de Cópia do NeMo e Payload Desacoplado de Índice
   */
  test('3. Deve validar integridade do badge NeMo e botão de cópia direta via data-payload', async ({ page }) => {
    await page.goto('/');

    // Simula injeção de mensagem com badge NeMo no DOM para validação do componente
    await page.evaluate(() => {
      const chatWin = document.getElementById('chatWindow');
      if (chatWin && typeof window.buildNemoBadgeHtml === 'function') {
        const testContainer = document.createElement('div');
        testContainer.id = 'testNemoContainer';
        testContainer.innerHTML = window.buildNemoBadgeHtml({
          score: 9,
          pass: true,
          status: 'PASS',
          feedback: 'Sintaxe e arquitetura 100% validadas pelo NeMo Judge.'
        }, 0);
        chatWin.appendChild(testContainer);
      }
    });

    const badgeContainer = page.locator('#testNemoContainer .nemo-badge');
    await expect(badgeContainer).toBeVisible();

    // Valida que o texto possui tooltip com a crítica
    const badgeLabel = badgeContainer.locator('.nemo-badge-label');
    await expect(badgeLabel).toHaveAttribute('title', /Sintaxe e arquitetura 100% validadas/);

    // Valida que o botão de cópia contém o payload exato
    const copyBtn = badgeContainer.locator('.nemo-copy-btn');
    await expect(copyBtn).toHaveAttribute('data-payload', /Feedback NeMo Judge/);
    await expect(copyBtn).toHaveAttribute('title', 'Copiar avaliação');

    // Clica no botão e valida feedback visual sem erro
    await copyBtn.click();
    await expect(copyBtn.locator('span')).toContainText('✅');
  });

  /**
   * Cenário 4: Criação de Nova Sessão e Limpeza sem ReferenceError
   */
  test('4. Deve criar nova conversa, limpar o DOM e resetar o input sem ReferenceError', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('/');

    // Digita texto de teste no input
    const promptInput = page.locator('#promptInput');
    await promptInput.fill('Texto temporário para validação de reset');
    await expect(promptInput).toHaveValue('Texto temporário para validação de reset');

    // Clica no botão de nova conversa
    const btnNewChat = page.locator('#btnNewChat');
    await btnNewChat.click();

    // Valida que o input foi limpo
    await expect(promptInput).toHaveValue('');

    // Valida que o histórico em memória foi reiniciado
    const chatHistoryLength = await page.evaluate(() => {
      return Array.isArray(window.chatHistory) ? window.chatHistory.length : 0;
    });
    expect(chatHistoryLength).toBe(0);

    // Garante que nenhum ReferenceError foi disparado na execução
    const referenceErrors = pageErrors.filter(e => e.includes('ReferenceError'));
    expect(referenceErrors).toHaveLength(0);
  });

});
