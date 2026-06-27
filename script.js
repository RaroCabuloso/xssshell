(function (FILES) {
  const terminal  = document.getElementById("terminal");
  const output    = document.getElementById("output");
  const promptTop = document.getElementById("promptTop");
  const promptEl  = document.getElementById("prompt");
  const cmdInput  = document.getElementById("cmd");

  const USER = "raro";
  const HOST = "localhost";
  let isLoggedIn = false;

  // ── FILESYSTEM REAL (OneCompiler storage + API) ────────────────────────────
  let fileTree = {};
  let currentPath = [];
  let currentDir = "/";

  // Controle de fonte de dados
  let useApiSource = false;

  // ── Sistema de comandos modulares ──────────────────────────────────────────
  const commands = {};
  const customCommandRegistryKey = "sharpShell_custom_commands";
  let customCommandRegistry = [];

  function buildTreeFromFiles(fileList) {
    const root = { type: "dir", children: {} };
    
    if (!fileList || !Array.isArray(fileList)) return root;
    
    for (const fileObj of fileList) {
      const parts = fileObj.name.split("/");
      let current = root;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        
        if (isLast) {
          current.children[part] = {
            type: "file",
            content: fileObj.content || "",
            name: fileObj.name
          };
        } else {
          if (!current.children[part]) {
            current.children[part] = { type: "dir", children: {} };
          }
          current = current.children[part];
        }
      }
    }
    
    return root;
  }

  function refreshFilesystem() {
    if (useApiSource && window.API_CONFIG && window.API_CONFIG.ready) {
      // API mode: filesystem será atualizado sob demanda
      return;
    }
    fileTree = buildTreeFromFiles(FILES);
  }

  function createCommandModule(source) {
    const body = String(source || '').trim();
    return new Function('ctx', 'input', `return (async () => { ${body} })();`);
  }

  async function executeCommandModule(commandModule, ctx) {
    if (typeof commandModule !== 'function') return null;

    const subcommands = new Map();

    ctx.addSubcommand = function (name, handler) {
      if (typeof handler === 'function') {
        subcommands.set(String(name || '').trim(), handler);
      }
      return ctx;
    };

    ctx.runSubcommand = async function (name, args = []) {
      const handler = subcommands.get(String(name || '').trim());
      if (typeof handler !== 'function') return null;
      return await handler(ctx, Array.isArray(args) ? args : [args]);
    };

    const result = await commandModule(ctx, (promptText = '') => requestTerminalInput(promptText));

    const firstArg = Array.isArray(ctx.args) ? ctx.args[0] : null;
    if (firstArg && subcommands.has(String(firstArg))) {
      return await ctx.runSubcommand(firstArg, ctx.args.slice(1));
    }

    return result;
  }

  // ── Carregamento automático de comandos ────────────────────────────────────

  function loadCommands() {
    const commandFiles = FILES.filter(f => f.name.startsWith("commands/") && f.name.endsWith(".js"));
    
    console.log(`[CommandLoader] Carregando ${commandFiles.length} comandos...`);
    
    for (const file of commandFiles) {
      try {
        const fileName = file.name.replace("commands/", "").replace(".js", "");
        const commandModule = createCommandModule(file.content);
        commands[fileName] = commandModule;
        console.log(`[CommandLoader] ✓ Comando carregado: ${fileName}`);
      } catch (error) {
        console.error(`[CommandLoader] ✗ Erro ao carregar ${file.name}:`, error);
      }
    }
    
    console.log(`[CommandLoader] Total: ${Object.keys(commands).length} comandos registrados`);
  }

  function loadCustomCommandRegistry() {
    try {
      const saved = localStorage.getItem(customCommandRegistryKey);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('[CommandLoader] Falha ao carregar registry persistido:', error);
      return [];
    }
  }

  function saveCustomCommandRegistry() {
    localStorage.setItem(customCommandRegistryKey, JSON.stringify(customCommandRegistry));
  }

  function normalizeCommandSource(source) {
    const raw = String(source || '').trim();
    if (!raw) return raw;

    const objectMatch = raw.match(/content\s*:\s*`/);
    if (!objectMatch) return raw;

    const markerIndex = raw.indexOf('`', objectMatch.index + objectMatch[0].length - 1);
    if (markerIndex < 0) return raw;

    let cursor = markerIndex + 1;
    let escaped = false;
    while (cursor < raw.length) {
      const char = raw[cursor];
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '`') {
        return raw.slice(markerIndex + 1, cursor);
      }
      cursor += 1;
    }

    return raw;
  }

  function normalizeFSPath(inputPath) {
    const raw = String(inputPath || '').trim();
    if (!raw) return '';
    if (raw.startsWith('/')) return raw.replace(/^\/+/, '');
    if (raw.startsWith('./')) return raw.slice(2);
    if (raw.includes('/')) {
      const parts = raw.split('/').filter(Boolean);
      const first = parts[0];
      if (first === '.' || first === '..') {
        return parts.join('/');
      }
    }
    if (currentDir === '/') return raw;
    return `${currentDir.replace(/^\/+|\/+$/g, '')}/${raw}`.replace(/\/+/g, '/');
  }

  function resolveShellPath(filePath) {
    const raw = String(filePath || '').trim();
    if (!raw) return '';
    const withoutLeadingSlash = raw.startsWith('/') ? raw.slice(1) : raw;
    if (withoutLeadingSlash.startsWith('./')) {
      return normalizePath(withoutLeadingSlash.slice(2));
    }
    if (currentDir === '/') {
      return normalizePath(withoutLeadingSlash);
    }
    return normalizePath(`${currentDir.replace(/^\/+|\/+$/g, '')}/${withoutLeadingSlash}`);
  }

  function getFileEntryFromList(path) {
    const normalizedPath = normalizePath(path);
    return FILES.find(file => normalizePath(file.name) === normalizedPath) || null;
  }

  async function registerCommandFromFile(inputPath, options = {}) {
    const resolvedPath = normalizeFSPath(inputPath);
    const content = await readFileContent(resolvedPath);
    if (!content) {
      throw new Error(`arquivo não encontrado ou vazio: ${inputPath}`);
    }

    const commandName = options.name || resolvedPath.split('/').pop().replace(/\.js$/i, '');
    if (!/^[a-zA-Z0-9_-]+$/.test(commandName)) {
      throw new Error('nome de comando inválido');
    }

    const normalizedContent = normalizeCommandSource(content);
    const existingIndex = customCommandRegistry.findIndex(entry => entry.name === commandName);
    const entry = { name: commandName, path: resolvedPath, content: normalizedContent, createdAt: new Date().toISOString() };

    try {
      const commandModule = createCommandModule(normalizedContent);
      commands[commandName] = commandModule;
    } catch (error) {
      throw new Error(`conteúdo inválido para o comando: ${error.message}`);
    }

    if (existingIndex >= 0) {
      customCommandRegistry[existingIndex] = entry;
    } else {
      customCommandRegistry.push(entry);
    }

    saveCustomCommandRegistry();
    return entry;
  }

  async function registerCommandsFromFolder(folderPath) {
    const resolvedPath = normalizeFSPath(folderPath);
    let entries = [];

    if (useApiSource && window.API_CONFIG?.ready) {
      const result = await window.apiListFolder(resolvedPath || '');
      if (result?.success && Array.isArray(result.data?.items)) {
        entries = result.data.items
          .filter(item => item.type === 'file' && item.name.endsWith('.js'))
          .map(item => ({ name: item.name, path: item.path }));
      }
    } else {
      entries = FILES
        .filter(file => file.name.startsWith(`${resolvedPath}/`) && file.name.endsWith('.js'))
        .map(file => ({ name: file.name.split('/').pop(), path: file.name }));
    }

    if (!entries.length) {
      throw new Error(`nenhum arquivo .js encontrado em: ${folderPath}`);
    }

    const registered = [];
    for (const entry of entries) {
      const content = await readFileContent(entry.path);
      if (!content) continue;
      const commandName = entry.name.replace(/\.js$/i, '');
      const moduleEntry = await registerCommandFromFile(entry.path, { name: commandName, allowOverwrite: true });
      registered.push(moduleEntry);
    }

    return registered;
  }

  function listCustomCommands() {
    return customCommandRegistry.slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function removeCustomCommand(commandName) {
    const target = String(commandName || '').trim();
    if (!target) return false;

    const index = customCommandRegistry.findIndex(entry => entry.name === target);
    if (index < 0) return false;

    customCommandRegistry.splice(index, 1);
    delete commands[target];
    saveCustomCommandRegistry();
    return true;
  }

  async function runScriptFile(inputPath, ctx) {
    const rawPath = String(inputPath || '').trim();
    const candidates = [];
    const direct = normalizeFSPath(rawPath);
    if (direct) candidates.push(direct);
    if (!direct.startsWith('/')) candidates.push(`/${direct}`);
    if (rawPath && !rawPath.startsWith('/')) candidates.push(rawPath);
    if (rawPath && !rawPath.startsWith('/')) candidates.push(`/${rawPath}`);

    let content = '';
    let resolvedPath = '';
    for (const candidate of candidates) {
      const candidateContent = await readFileContent(candidate);
      if (candidateContent) {
        content = candidateContent;
        resolvedPath = candidate;
        break;
      }
    }

    if (!content) {
      throw new Error(`script não encontrado: ${inputPath}`);
    }

    try {
      const runner = new Function('ctx', 'input', `return (async () => { ${content} })();`);
      return await runner(ctx, (promptText = "") => requestTerminalInput(promptText));
    } catch (error) {
      throw new Error(`erro de sintaxe no script: ${error.message}`);
    }
  }

  function restoreCustomCommands() {
    customCommandRegistry = loadCustomCommandRegistry();
    for (const entry of customCommandRegistry) {
      try {
        commands[entry.name] = createCommandModule(entry.content);
      } catch (error) {
        console.warn(`[CommandLoader] Falha ao restaurar comando ${entry.name}:`, error);
      }
    }
  }

  // ── command history ────────────────────────────────────────────────────────
  const cmdHistory = [];
  let histIdx = -1;
  let terminalNanoState = null;
  let pendingInputResolver = null;
  let pendingInputPrompt = "";

  // ── helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function whtml(html) {
    output.innerHTML += html;
    terminal.scrollTop = terminal.scrollHeight;
  }

  function w(text)   { whtml(esc(text)); }
  function werr(msg) { whtml(`<span class="err">${esc(msg)}</span>`); }

  function getCurrentNode() {
    if (useApiSource) {
      // Retorna promessa ou null para indicar modo async
      return null;
    }

    if (currentPath.length === 0) return fileTree;

    let node = fileTree;
    for (const segment of currentPath) {
      if (!node.children || !node.children[segment]) return null;
      node = node.children[segment];
      if (node.type !== "dir") return null;
    }
    return node;
  }

  function getNodeByPath(path) {
    const normalized = normalizePath(String(path || "").trim());
    if (!normalized) return fileTree;
    const parts = normalized.split('/').filter(Boolean);
    let node = fileTree;
    for (const part of parts) {
      if (!node || node.type !== 'dir' || !node.children || !node.children[part]) {
        return null;
      }
      node = node.children[part];
    }
    return node;
  }

  function normalizeShellPath(inputPath) {
    const raw = String(inputPath || '').trim();
    const current = currentDir === '/' ? [] : currentDir.replace(/^\/+/g, '').replace(/\/+$/g, '').split('/').filter(Boolean);
    if (!raw) return current.join('/');

    const absolute = raw.startsWith('/');
    const parts = raw.split('/').filter(Boolean);
    const stack = absolute ? [] : [...current];

    for (const part of parts) {
      if (part === '.' || part === '') continue;
      if (part === '..') {
        if (stack.length > 0) stack.pop();
      } else {
        stack.push(part);
      }
    }

    return stack.join('/');
  }

  function getPathString(pathArray) {
    if (!pathArray || pathArray.length === 0) return "/";
    return "/" + pathArray.join("/");
  }

  function wPrompt(cmd) {
    whtml(
      `<span class="p-line1">┌──(<span class="p-user">${esc(USER)}㉿${esc(HOST)}</span>)` +
      `-[<span class="p-path">${esc(currentDir)}</span>]</span>\n` +
      `<span class="p-arrow">└─❯❯ </span><span class="p-cmd">${esc(cmd)}</span>\n`
    );
  }

  function updatePrompt() {
    promptTop.innerHTML =
      `┌──(<span class="p-user">${esc(USER)}㉿${esc(HOST)}</span>)` +
      `-[<span class="p-path">${esc(currentDir)}</span>]`;
    promptEl.textContent = "└─❯❯ ";
  }

  function requestTerminalInput(promptText = "") {
    return new Promise((resolve) => {
      pendingInputResolver = resolve;
      pendingInputPrompt = promptText;
      cmdInput.value = "";
      cmdInput.placeholder = promptText || "input";
      cmdInput.focus();
      if (promptText) {
        whtml(`<span class="p-arrow">${esc(promptText)}</span>`);
      }
      terminal.scrollTop = terminal.scrollHeight;
    });
  }

  function clearPendingInput() {
    pendingInputResolver = null;
    pendingInputPrompt = "";
    cmdInput.placeholder = "";
  }

  // ── Salvamento de sessão ───────────────────────────────────────────────────

  function saveSession() {
    localStorage.setItem("sharpShell_session", JSON.stringify({
      isLoggedIn: isLoggedIn,
      currentPath: currentPath,
      currentDir: currentDir,
      useApiSource: useApiSource,
      timestamp: new Date().toISOString()
    }));
  }

  function loadSession() {
    const saved = localStorage.getItem("sharpShell_session");
    if (saved) {
      try {
        const session = JSON.parse(saved);
        return session;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function setCookie(name, value, days = 7) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expires}; SameSite=Lax`;
  }

  function getCookie(name) {
    return document.cookie.split('; ').reduce((acc, cookie) => {
      const [key, val] = cookie.split('=');
      if (key === name) return decodeURIComponent(val || '');
      return acc;
    }, '');
  }

  function deleteCookie(name) {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }

  function persistNetworkSetup(method, token = null) {
    if (method) {
      setCookie('api_method', method, 365);
      localStorage.setItem('sharpShell_network_method', method);
    }
    if (token) {
      setCookie('api_token', token, 365);
      localStorage.setItem('sharpShell_network_token', token);
    }
    localStorage.setItem('sharpShell_network_setup', '1');
  }

  function restoreNetworkSetup() {
    const savedMethod = getCookie('api_method') || localStorage.getItem('sharpShell_network_method');
    const savedToken = getCookie('api_token') || localStorage.getItem('sharpShell_network_token');
    return { savedMethod, savedToken };
  }

  function persistLoginState(username) {
    setCookie('sharpShell_logged_in', 'true', 365);
    setCookie('sharpShell_user', username || USER, 365);
  }

  function isPersistedLoginActive() {
    const savedToken = getCookie('api_token');
    const savedMethod = getCookie('api_method');
    return getCookie('sharpShell_logged_in') === 'true' && !!savedToken && !!savedMethod;
  }

  function isMobileDevice() {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function normalizePath(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    return raw.replace(/^\/+/, '').replace(/\/+/g, '/');
  }

  function getLocalFileKey(path) {
    return `sharpShell_file:${normalizePath(path)}`;
  }

  function getPathCandidates(inputPath) {
    const raw = String(inputPath || '').trim();
    if (!raw) return [];

    const base = normalizePath(raw);
    const withoutLeading = base.replace(/^\/+/, '');
    const withLeading = withoutLeading ? `/${withoutLeading}` : '/';
    const fromCurrent = currentDir === '/'
      ? withoutLeading
      : `${currentDir.replace(/^\/+|\/+$/g, '')}/${withoutLeading}`.replace(/\/+/, '/');

    const candidates = new Set([
      raw,
      base,
      withoutLeading,
      withLeading,
      normalizePath(withLeading),
      normalizePath(fromCurrent),
      normalizePath(`/${fromCurrent}`)
    ]);

    return Array.from(candidates).filter(Boolean);
  }

  async function readFileContent(path) {
    const candidates = getPathCandidates(path);

    for (const candidate of candidates) {
      try {
        if (window.API_CONFIG?.ready && typeof window.apiReadFile === 'function') {
          const result = await window.apiReadFile(candidate.startsWith('/') ? candidate : `/${candidate}`);
          if (result?.success && result?.data) {
            const content = result.data.content ?? '';
            if (content !== undefined && content !== null) {
              return String(content);
            }
          }
        }
      } catch (e) {
        console.warn('[fs] API read failed, trying local fallback', e);
      }
    }

    for (const candidate of candidates) {
      const fromStorage = localStorage.getItem(getLocalFileKey(candidate));
      if (fromStorage !== null) {
        return fromStorage;
      }
    }

    for (const candidate of candidates) {
      const entry = getFileEntryFromList(candidate);
      if (entry?.content !== undefined) {
        return entry.content;
      }
    }

    return '';
  }

  async function writeFileContent(path, content) {
    const canonicalPath = normalizePath(path);
    const candidates = getPathCandidates(path);
    const apiPaths = candidates.map(candidate => candidate.startsWith('/') ? candidate : `/${candidate}`);
    let usedApi = false;

    try {
      if (window.API_CONFIG?.ready && typeof window.apiCreateFile === 'function') {
        for (const apiPath of apiPaths) {
          try {
            const createResult = await window.apiCreateFile(apiPath, content);
            if (createResult?.success) {
              usedApi = true;
              break;
            }
          } catch (e) {
            console.warn('[fs] API create failed for', apiPath, e);
          }
        }
      }

      if (!usedApi && window.API_CONFIG?.ready && typeof window.apiUpdateFile === 'function') {
        for (const apiPath of apiPaths) {
          try {
            const updateResult = await window.apiUpdateFile(apiPath, content);
            if (updateResult?.success) {
              usedApi = true;
              break;
            }
          } catch (e) {
            console.warn('[fs] API update failed for', apiPath, e);
          }
        }
      }
    } catch (e) {
      console.warn('[fs] API write failed, using local storage fallback', e);
    }

    const entry = getFileEntryFromList(canonicalPath);
    if (entry) {
      entry.content = content;
    } else {
      FILES.push({ name: canonicalPath, content });
    }

    for (const candidate of candidates) {
      localStorage.setItem(getLocalFileKey(candidate), content);
    }

    refreshFilesystem();
    return { success: true, source: usedApi ? 'api' : 'local' };
  }

  function openProgramWindow(title, htmlContent, options = {}) {
    const isMobile = isMobileDevice();
    const windowId = `app-window-${Date.now()}`;

    const sharedStyle = `
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; background: #030303; color: #f5f7ff; font-family: Inter, "Segoe UI", sans-serif; }
      .app-window-header { position: relative; background: rgba(0,0,0,0.7); border-bottom: 1px solid rgba(255,255,255,0.08); color: #f5f7ff; padding: 12px 16px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; }
      .app-window-content { padding: 16px; background: rgba(3,3,3,0.9); }
      .app-window-button { border: none; background: #ffffff; color: #000; padding: 10px 14px; cursor: pointer; margin-right: 8px; border-radius: 10px; font-weight: 700; }
      .app-window-button:hover { transform: translateY(-1px); box-shadow: 0 0 20px white; }
      textarea { width: 100%; min-height: 360px; background: #111; border: none; color: #f5f7ff; padding: 12px; font-family: monospace; font-size: 13px; line-height: 1.4; resize: vertical; border-radius: 10px; }
      .app-status { margin-top: 12px; color: #8fd4ff; font-size: 13px; }
      input[type="file"] { color: #f5f7ff; background: #111; border: none; border-radius: 10px; padding: 10px; width: 100%; }
    `;

    if (!isMobile) {
      const win = window.open('about:blank', windowId, 'width=920,height=620,resizable=yes,scrollbars=yes');
      if (!win) {
        alert('Falha ao abrir janela. Desative o bloqueador de pop-ups.');
        return null;
      }

      win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>${sharedStyle}</style></head><body><div class="app-window-header">${title}</div><div class="app-window-content">${htmlContent}</div></body></html>`);
      win.document.close();
      if (typeof options.onReady === 'function') {
        setTimeout(() => options.onReady(win), 150);
      }
      return win;
    }

    const modal = document.createElement('div');
    modal.className = 'app-modal';
    modal.innerHTML = `
      <div class="app-window" id="${windowId}">
        <div class="app-window-header">
          <span class="app-window-title">${title}</span>
        </div>
        <div class="app-window-content">${htmlContent}</div>
      </div>
    `;

    document.body.appendChild(modal);
    const windowEl = modal.querySelector('.app-window');
    const header = modal.querySelector('.app-window-header');

    const focusModal = () => { modal.style.display = 'flex'; };
    focusModal();

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header?.addEventListener('pointerdown', (event) => {
      dragging = true;
      offsetX = event.clientX - (windowEl?.getBoundingClientRect().left || 0);
      offsetY = event.clientY - (windowEl?.getBoundingClientRect().top || 0);
      header.setPointerCapture(event.pointerId);
    });

    header?.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      windowEl.style.left = `${event.clientX - offsetX}px`;
      windowEl.style.top = `${event.clientY - offsetY}px`;
      windowEl.style.position = 'fixed';
    });

    header?.addEventListener('pointerup', (event) => {
      dragging = false;
      header.releasePointerCapture(event.pointerId);
    });

    if (typeof options.onReady === 'function') {
      setTimeout(() => options.onReady(modal), 150);
    }

    return modal;
  }

  async function openEditorWindow(filePath, useWindow = false) {
    const resolvedPath = resolveShellPath(filePath);
    const title = `nano - ${resolvedPath}`;
    const contentHtml = `
      <div>
        <div style="margin-bottom: 10px; color: #88ff88;">Editando: ${esc(resolvedPath)}</div>
        <textarea id="nanoEditor"></textarea>
        <div style="margin-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
          <button id="nanoSave" class="app-window-button">Salvar</button>
          <button id="nanoClose" class="app-window-button">Fechar</button>
          <span id="nanoStatus" class="app-status"></span>
        </div>
      </div>
    `;

    if (!useWindow) {
      await openTerminalEditor(resolvedPath);
      return;
    }

    const instance = openProgramWindow(title, contentHtml, {
      onReady: async (container) => {
        const root = container.document ? container.document : container;
        const textarea = root.getElementById ? root.getElementById('nanoEditor') : container.querySelector('#nanoEditor');
        const saveButton = root.getElementById ? root.getElementById('nanoSave') : container.querySelector('#nanoSave');
        const closeButton = root.getElementById ? root.getElementById('nanoClose') : container.querySelector('#nanoClose');
        const status = root.getElementById ? root.getElementById('nanoStatus') : container.querySelector('#nanoStatus');

        async function loadContent() {
          if (!status || !textarea) return;
          status.textContent = 'Carregando...';
          try {
            const content = await readFileContent(resolvedPath);
            textarea.value = content;
            status.textContent = 'Arquivo carregado.';
          } catch (e) {
            textarea.value = '';
            status.textContent = 'Erro ao carregar arquivo.';
          }
        }

        async function saveFile() {
          if (!status || !textarea) return;
          status.textContent = 'Salvando...';
          try {
            const result = await writeFileContent(resolvedPath, textarea.value);
            if (result?.success) {
              status.textContent = 'Salvo com sucesso.';
            } else {
              status.textContent = 'Erro ao salvar arquivo.';
            }
          } catch (e) {
            status.textContent = 'Erro ao salvar arquivo.';
          }
        }

        saveButton?.addEventListener('click', saveFile);
        closeButton?.addEventListener('click', () => {
          if (container.close) return container.close();
          if (container.remove) container.remove();
        });

        await loadContent();
      }
    });

    if (!instance) {
      werr('nano: falha ao abrir editor.\n');
    }
  }

  async function openTerminalEditor(filePath) {
    const normalizedPath = resolveShellPath(filePath);
    let content = '';

    try {
      content = await readFileContent(normalizedPath);
    } catch (e) {
      content = '';
    }

    terminalNanoState = {
      filePath: normalizedPath,
      content: content.split(/\r?\n/),
      dirty: false
    };

    output.innerHTML = '';
    whtml(`<span style="color:#77ff77">[nano] Modo terminal ativo</span>\n`);
    w(`Arquivo: ${normalizedPath}\n`);
    w(`Digite as linhas. Use :w para salvar, :wq para salvar e sair, :q para sair.\n`);
    if (terminalNanoState.content.length && terminalNanoState.content[0] !== '') {
      for (const line of terminalNanoState.content) {
        w(`${line}\n`);
      }
    }
    w(`\n`);
    promptEl.textContent = 'nano> ';
    cmdInput.value = '';
    cmdInput.focus();
  }

  async function saveTerminalEditor(quitAfterSave = false) {
    if (!terminalNanoState) return;
    const content = terminalNanoState.content.join('\n');
    try {
      const result = await writeFileContent(terminalNanoState.filePath, content);
      if (result?.success) {
        whtml(`<span style="color:#77ff77">[nano] Arquivo salvo: ${esc(terminalNanoState.filePath)}</span>\n`);
        terminalNanoState.dirty = false;
        if (quitAfterSave) {
          exitTerminalEditor();
        }
      } else {
        werr('[nano] Falha ao salvar.\n');
      }
    } catch (e) {
      werr(`[nano] Falha ao salvar: ${e.message}\n`);
    }
  }

  function exitTerminalEditor() {
    if (!terminalNanoState) return;
    terminalNanoState = null;
    promptEl.textContent = '└─❯❯ ';
    cmdInput.value = '';
    cmdInput.focus();
  }

  function clearSession() {
    localStorage.removeItem("sharpShell_session");
    deleteCookie("api_token");
    deleteCookie("sharpShell_logged_in");
    deleteCookie("sharpShell_user");
  }

  // ── Tela de Configuração de Ambiente ───────────────────────────────────────

  async function showEnvironmentSetup() {
    document.querySelector(".prompt-top").style.display = "none";
    document.querySelector(".input-line").style.display = "none";
    
    output.style.display = "";
    output.innerHTML = "";

    whtml(`
<span style="color:#00ccff">
   _____ __                     _____ __           __ 
  / ___// /_  ____ __________  / ___// /_  ___    / / 
  \\__ \\/ __ \\/ __ \`/ ___/ __ \\ \\__ \\/ __ \\/ _ \\  / /  
 ___/ / / / / /_/ / /  / /_/ /___/ / / / /  __/ / /___
/____/_/ /_/\\__,_/_/   \\____//____/_/ /_/\\___/ /_____/
</span>

<span style="color:#00ccff">Sharp Shell OS v0.9</span>
<span style="color:#555">───────────────────────────────────────────────</span>
<span style="color:#ffcc44">⚙ Configurando ambiente de rede...</span>
<span style="color:#555">───────────────────────────────────────────────</span>
`);

    await sleep(800);

    const { savedMethod, savedToken } = restoreNetworkSetup();

    if (savedMethod) {
      whtml(`<span style="color:#888">Método salvo encontrado: ${savedMethod}</span>\n`);
      window.API_CONFIG.method = savedMethod;
      window.API_CONFIG.token = savedToken || null;
      window.API_CONFIG.ready = true;
      useApiSource = true;

      if (savedToken) {
        whtml(`<span style="color:#66ff99">✓ Sessão API restaurada</span>\n\n`);
        await sleep(700);
        try {
          await window.apiListFolder('');
          whtml(`<span style="color:#66ff99">✓ Conexão com API verificada</span>\n\n`);
        } catch (e) {
          whtml(`<span style="color:#ffcc44">⚠ Sessão pode ter expirado</span>\n\n`);
          window.API_CONFIG.ready = false;
          window.API_CONFIG.token = null;
          useApiSource = false;
          await sleep(500);
        }
      }
    }

    if (!window.API_CONFIG.ready) {
      const method = await window.runConnectionTests((msg) => {
        whtml(`<span style="color:#888">${msg}</span>\n`);
      });

      if (method) {
        window.API_CONFIG.method = method;
        window.API_CONFIG.ready = true;
        useApiSource = true;
        persistNetworkSetup(method);
        whtml(`\n<span style="color:#66ff99">✓ Ambiente configurado com sucesso!</span>\n`);
        whtml(`<span style="color:#888">Método: ${method}</span>\n\n`);
      } else {
        whtml(`\n<span style="color:#ff4444">✗ API indisponível. Recarregue a página para tentar novamente.</span>\n`);
        return;
      }
    }

    showLoginScreen();
  }

  function showLoginScreen() {
    document.querySelector(".prompt-top").style.display = "none";
    document.querySelector(".input-line").style.display = "none";
    output.style.display = "none";

    const oldLogin = document.getElementById("loginScreen");
    if (oldLogin) oldLogin.remove();

    const loginHTML = `
      <div id="loginScreen" class="login-screen">
        <canvas id="rain"></canvas>
        <div id="lightning"></div>

        <div class="login">
          <div class="logo-wrap">
            <div class="logo" id="logo">
              <img src="https://lmpure.netlify.app/i/1600/Hermes-GERXMVP_-Song-Lyrics-Music-Videos-Concerts.jpeg" alt="Logo" />
            </div>
          </div>

          <h2>LOGIN</h2>

          <input id="loginUser" placeholder="Usuário" />
          <input id="loginPassword" placeholder="Senha" type="password" />
          <button id="loginBtn">Entrar</button>
          <div id="loginError" class="login-error">Credenciais inválidas</div>
          <div id="loginLoading" class="login-loading">Conectando à API...</div>
        </div>
      </div>
    `;

    terminal.insertAdjacentHTML("beforeend", loginHTML);

    const loginUser = document.getElementById("loginUser");
    const loginPassword = document.getElementById("loginPassword");
    const loginError = document.getElementById("loginError");
    const loginLoading = document.getElementById("loginLoading");
    const canvas = document.getElementById("rain");
    const ctx = canvas?.getContext("2d");
    const flash = document.getElementById("lightning");
    const logo = document.getElementById("logo");

    document.addEventListener("contextmenu", (event) => event.preventDefault());

    if (canvas && ctx) {
      function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      resize();
      window.addEventListener("resize", resize);

      let drops = [];
      for (let i = 0; i < 500; i++) {
        drops.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          l: 10 + Math.random() * 20,
          v: 6 + Math.random() * 10
        });
      }

      function rain() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "rgba(180,220,255,.35)";
        ctx.lineWidth = 1;

        for (const d of drops) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 2, d.y + d.l);
          ctx.stroke();

          d.y += d.v;
          if (d.y > window.innerHeight) {
            d.y = -20;
            d.x = Math.random() * window.innerWidth;
          }
        }

        requestAnimationFrame(rain);
      }
      rain();
    }

    if (flash) {
      setInterval(() => {
        if (Math.random() < 0.3) {
          flash.style.opacity = 0.9;
          setTimeout(() => {
            flash.style.opacity = 0;
          }, 80);
        }
      }, 2500);
    }

    if (logo) {
      let dragging = false;
      let rotX = 0;
      let rotY = 0;
      let targetX = 0;
      let targetY = 0;
      let lastX = 0;
      let lastY = 0;

      logo.addEventListener("dragstart", (event) => event.preventDefault());
      logo.addEventListener("pointerdown", (event) => {
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        logo.setPointerCapture(event.pointerId);
      });
      logo.addEventListener("pointermove", (event) => {
        if (!dragging) return;

        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;

        lastX = event.clientX;
        lastY = event.clientY;

        targetY += dx * 0.6;
        targetX -= dy * 0.6;
      });
      logo.addEventListener("pointerup", () => {
        dragging = false;
      });

      function animate() {
        rotX += (targetX - rotX) * 0.12;
        rotY += (targetY - rotY) * 0.12;
        logo.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        requestAnimationFrame(animate);
      }
      animate();
    }

    async function attemptLogin() {
      const user = loginUser.value.trim();
      const pass = loginPassword.value;

      loginError.style.display = "none";
      loginLoading.style.display = "none";

      if (!user || !pass) {
        loginError.textContent = "Usuário e senha são obrigatórios.";
        loginError.style.display = "block";
        loginError.style.animation = "none";
        loginError.offsetHeight;
        loginError.style.animation = "shake 0.4s ease-in-out";
        loginPassword.focus();
        return;
      }

      loginLoading.style.display = "block";
      const apiResult = await window.apiLogin(user, pass);
      loginLoading.style.display = "none";

      if (!apiResult.success) {
        loginError.textContent = apiResult.error || 'Falha na autenticação';
        loginError.style.display = "block";
        loginPassword.value = "";
        loginPassword.focus();
        return;
      }

      setCookie('api_token', apiResult.token, 365);
      if (window.API_CONFIG.method) {
        setCookie('api_method', window.API_CONFIG.method, 365);
        persistNetworkSetup(window.API_CONFIG.method, apiResult.token);
      }
      persistLoginState(user);

      useApiSource = true;
      hideLoginScreen();
      isLoggedIn = true;
      output.style.display = "";
      document.querySelector(".prompt-top").style.display = "";
      document.querySelector(".input-line").style.display = "";

      output.style.animation = "fadeIn 0.5s ease-in-out";
      document.querySelector(".prompt-top").style.animation = "fadeIn 0.5s ease-in-out";
      document.querySelector(".input-line").style.animation = "fadeIn 0.5s ease-in-out";

      whtml(
        `<span style="color:#8fd4ff">Bem-vindo de volta, ${esc(user)}!</span>\n` +
        `<span style="color:#8aa2c1">Último login: ${new Date().toLocaleString()}</span>\n` +
        `<span style="color:#888">Fonte: API (Telegram) · ${Object.keys(commands).length} comandos</span>\n\n`
      );

      saveSession();
      updatePrompt();
      cmdInput.focus();

      setTimeout(() => {
        output.style.animation = "";
        document.querySelector(".prompt-top").style.animation = "";
        document.querySelector(".input-line").style.animation = "";
      }, 500);
    }

    document.getElementById("loginBtn").addEventListener("click", attemptLogin);

    loginUser.addEventListener("keydown", function(e) {
      if (e.key === "Enter") attemptLogin();
    });

    loginPassword.addEventListener("keydown", function(e) {
      if (e.key === "Enter") attemptLogin();
    });

    setTimeout(() => {
      const firstInput = document.getElementById("apiUser") || loginUser;
      if (firstInput) firstInput.focus();
    }, 100);
  }

  function hideLoginScreen() {
    const loginScreen = document.getElementById("loginScreen");
    if (loginScreen) loginScreen.style.display = "none";
  }

  async function openUploadWindow(mode = 'file') {
    const title = mode === 'folder' ? 'upload -p' : 'upload -f';
    const contentHtml = `
      <div>
        <div style="margin-bottom: 10px; color: #ff8a8a;">Diretório atual: ${esc(currentDir)}</div>
        <div style="margin-bottom: 8px; color: #aaa; font-size: 12px;">${mode === 'folder' ? 'Selecione uma pasta inteira para enviar.' : 'Selecione um ou mais arquivos para enviar.'}</div>
        <input id="uploadInput" type="file" multiple ${mode === 'folder' ? 'webkitdirectory directory' : ''} style="margin-bottom: 10px;" />
        <div style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <button id="uploadStart" class="app-window-button">Enviar</button>
          <span id="uploadStatus" class="app-status">${mode === 'folder' ? 'Escolha uma pasta.' : 'Escolha um ou mais arquivos.'}</span>
        </div>
      </div>
    `;

    const instance = openProgramWindow(title, contentHtml, {
      onReady: async (container) => {
        const root = container.document ? container.document : container;
        const input = root.getElementById ? root.getElementById('uploadInput') : container.querySelector('#uploadInput');
        const button = root.getElementById ? root.getElementById('uploadStart') : container.querySelector('#uploadStart');
        const status = root.getElementById ? root.getElementById('uploadStatus') : container.querySelector('#uploadStatus');

        button?.addEventListener('click', async () => {
          const files = input?.files;
          if (!files || files.length === 0) {
            status.textContent = 'Nenhum arquivo selecionado.';
            return;
          }

          status.textContent = 'Enviando...';
          let count = 0;
          try {
            for (const file of files) {
              const relativePath = file.webkitRelativePath
                ? file.webkitRelativePath.split('/').slice(1).join('/')
                : file.name;
              const fullPath = normalizePath(`${currentDir === '/' ? '' : currentDir.replace(/^\//, '')}/${relativePath}`);
              const content = await file.text();
              await writeFileContent(fullPath, content);
              count += 1;
            }
            status.textContent = `${count} item(ns) enviado(s) para ${currentDir}.`;
          } catch (e) {
            status.textContent = `Erro no upload: ${e.message}`;
          }
        });
      }
    });

    if (!instance) {
      werr('upload: falha ao abrir janela.\n');
    }
  }

  // ── comandos de filesystem (modo local) ────────────────────────────────────

  async function doMount() {
      if (!useApiSource || !window.API_CONFIG.ready) {
        werr('Storage não suportado. Faça login na API.\n');
        return;
      }

      w(`Storage: API Raro (Telegram)\n`);
      w(`Endpoint: ${window.API_CONFIG.baseUrl}\n`);
      w(`Método: ${window.API_CONFIG.method}\n`);
      
      try {
        const result = await window.apiListFolder('');
        if (result.success && result.data && result.data.items) {
          w(`\nConteúdo remoto:\n`);
          for (const item of result.data.items) {
            const icon = item.type === 'folder' ? '📁' : '📄';
            whtml(`${icon} <span class="${item.type === 'folder' ? 'ls-dir' : 'ls-file'}">${esc(item.name)}</span>\n`);
          }
        }
      } catch (e) {
        werr(`Erro ao listar API: ${e.message}\n`);
      }
  }

  async function doLs(args) {
    const targetArg = args && args[0] ? args[0] : '.';
    const resolvedPath = normalizeShellPath(targetArg);

    if (useApiSource && window.API_CONFIG.ready) {
      try {
        const pathQuery = resolvedPath || '';
        const result = await window.apiListFolder(pathQuery);

        if (result.success && result.data && result.data.items) {
          const items = result.data.items;
          if (items.length === 0) {
            w("(diretório vazio)\n");
            return;
          }

          const dirs = [], files = [];
          for (const item of items) {
            if (item.type === 'folder') {
              dirs.push(`<span class="ls-dir">${esc(item.name)}/</span>`);
            } else {
              const ext = item.name.split(".").pop();
              const isScript = ["js", "sh", "py", "rb"].includes(ext || "");
              files.push(
                isScript 
                  ? `<span class="ls-exe">${esc(item.name)}*</span>` 
                  : `<span class="ls-file">${esc(item.name)}</span>`
              );
            }
          }

          dirs.sort();
          files.sort();
          const all = [...dirs, ...files];
          whtml(all.join("  ") + "\n");
        } else {
          werr(`ls: erro ao listar diretório\n`);
        }
      } catch (e) {
        werr(`ls: ${e.message}\n`);
      }
      return;
    }

    try {
      const node = getNodeByPath(resolvedPath);
      if (!node) {
        werr(`ls: ${targetArg}: não encontrado\n`);
        return;
      }

      if (node.type === 'file') {
        w(`${targetArg}\n`);
        return;
      }

      const children = Object.entries(node.children || {});
      if (children.length === 0) {
        w("(diretório vazio)\n");
        return;
      }

      const dirs = [], files = [];
      for (const [name, child] of children) {
        if (child.type === 'dir') {
          dirs.push(`<span class="ls-dir">${esc(name)}/</span>`);
        } else {
          const ext = name.split('.').pop();
          const isScript = ["js", "sh", "py", "rb"].includes(ext || "");
          files.push(
            isScript 
              ? `<span class="ls-exe">${esc(name)}*</span>`
              : `<span class="ls-file">${esc(name)}</span>`
          );
        }
      }

      dirs.sort();
      files.sort();
      const all = [...dirs, ...files];
      whtml(all.join("  ") + "\n");
    } catch (e) {
      werr(`ls: ${e.message}\n`);
    }
  }

  async function doCd(target) {
    if (!target || target === "/") {
      currentPath = [];
      currentDir = "/";
      updatePrompt();
      saveSession();
      return;
    }

    if (target === ".") return;

    if (target === "..") {
      if (currentPath.length > 0) {
        currentPath.pop();
      }
      currentDir = currentPath.length === 0 ? "/" : "/" + currentPath.join("/");
      updatePrompt();
      saveSession();
      return;
    }

    const resolved = normalizeShellPath(target);

    if (useApiSource && window.API_CONFIG.ready) {
      try {
        const result = await window.apiListFolder(resolved || '');
        if (result.success) {
          currentDir = resolved ? '/' + resolved : '/';
          currentPath = resolved.split('/').filter(p => p);
          updatePrompt();
          saveSession();
        } else {
          werr(`cd: ${target}: diretório não encontrado\n`);
        }
      } catch (e) {
        werr(`cd: ${target}: ${e.message}\n`);
      }
      return;
    }

    const node = getNodeByPath(resolved);
    if (!node || node.type !== 'dir') {
      werr(`cd: ${target}: diretório não encontrado\n`);
      return;
    }

    currentDir = resolved ? '/' + resolved : '/';
    currentPath = resolved.split('/').filter(p => p);
    updatePrompt();
    saveSession();
  }

  async function moveFileItem(sourcePath, destinationPath) {
    const source = resolveShellPath(sourcePath);
    let destination = resolveShellPath(destinationPath);
    if (!source || !destination) {
      return { success: false, error: 'origem e destino são obrigatórios' };
    }

    try {
      if (useApiSource && window.API_CONFIG?.ready && typeof window.apiMove === 'function') {
        const result = await window.apiMove(`/${source}`, `/${destination}`);
        return result?.success ? { success: true } : { success: false, error: result?.error || 'erro ao mover' };
      }

      const sourceEntry = getFileEntryFromList(source);
      const sourceNode = getNodeByPath(source);
      const destinationNode = getNodeByPath(destination);

      if (sourceEntry) {
        if (destinationNode?.type === 'dir') {
          destination = normalizePath(`${destination}/${source.split('/').pop()}`);
        }

        const entryIndex = FILES.findIndex(file => normalizePath(file.name) === source);
        if (entryIndex >= 0) {
          const movedEntry = { name: destination, content: FILES[entryIndex].content };
          FILES.splice(entryIndex, 1);
          localStorage.removeItem(getLocalFileKey(source));
          FILES.push(movedEntry);
          localStorage.setItem(getLocalFileKey(destination), movedEntry.content);
          refreshFilesystem();
          return { success: true };
        }
      }

      if (sourceNode && sourceNode.type === 'dir') {
        if (destinationNode?.type === 'file') {
          return { success: false, error: 'destino inválido: arquivo existente' };
        }

        const normalizedSourcePrefix = source === '' ? '' : `${source}/`;
        const sourceFiles = FILES.filter(file => normalizePath(file.name) === source || normalizePath(file.name).startsWith(normalizedSourcePrefix));
        if (sourceFiles.length === 0) {
          return { success: false, error: 'origem não encontrada' };
        }

        if (destinationNode?.type === 'dir') {
          destination = normalizePath(`${destination}/${source.split('/').pop()}`);
        }

        for (const file of sourceFiles) {
          const normalizedName = normalizePath(file.name);
          const suffix = normalizedName === source ? '' : normalizedName.slice(normalizedSourcePrefix.length);
          const newPath = normalizePath(`${destination}${suffix ? '/' + suffix : ''}`);
          FILES.push({ name: newPath, content: file.content });
          localStorage.setItem(getLocalFileKey(newPath), file.content);
        }

        for (const file of sourceFiles) {
          const index = FILES.findIndex(item => normalizePath(item.name) === normalizePath(file.name));
          if (index >= 0) FILES.splice(index, 1);
          localStorage.removeItem(getLocalFileKey(normalizePath(file.name)));
        }

        refreshFilesystem();
        return { success: true };
      }

      return { success: false, error: 'arquivo ou diretório não encontrado' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function doCat(file) {
    if (!file) { werr("cat: argumento obrigatório\n"); return; }

    const resolved = normalizeShellPath(file);

    if (useApiSource && window.API_CONFIG.ready) {
      try {
        const result = await window.apiReadFile(resolved);
        if (result.success && result.data) {
          w(result.data.content + (result.data.content.endsWith("\n") ? "" : "\n"));
        } else {
          werr(`cat: ${file}: ${result.error || 'erro ao ler'}\n`);
        }
      } catch (e) {
        werr(`cat: ${file}: ${e.message}\n`);
      }
      return;
    }

    const node = getNodeByPath(resolved);
    if (!node) {
      werr(`cat: ${file}: não encontrado\n`);
      return;
    }
    if (node.type !== 'file') {
      werr(`cat: ${file}: não é um arquivo\n`);
      return;
    }

    const content = await readFileContent(resolved);
    w(content + (content.endsWith("\n") ? "" : "\n"));
  }

  function doPwd() {
    w(currentDir + "\n");
    if (useApiSource) {
      whtml(`<span style="color:#555">[API: ${window.API_CONFIG.baseUrl}]</span>\n`);
    }
  }

  async function doTree() {
    if (!window.API_CONFIG.ready) {
      werr('tree: requer API ativa\n');
      return;
    }

    w(currentDir + "\n");
    try {
      async function printApiTree(path, prefix, isLast) {
        const displayPath = path.replace(/^\//, '');
        const result = await window.apiListFolder(displayPath || '');
        
        if (result.success && result.data && result.data.items) {
          const items = result.data.items;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemIsLast = i === items.length - 1;
            const connector = itemIsLast ? "└── " : "├── ";
            
            if (path === '/') {
              whtml(`${connector}<span class="${item.type === 'folder' ? 'ls-dir' : 'ls-file'}">${esc(item.name)}${item.type === 'folder' ? '/' : ''}</span>\n`);
            } else {
              whtml(`${prefix}${connector}<span class="${item.type === 'folder' ? 'ls-dir' : 'ls-file'}">${esc(item.name)}${item.type === 'folder' ? '/' : ''}</span>\n`);
            }
            
            if (item.type === 'folder') {
              const newPrefix = path === '/' ? 
                (itemIsLast ? "    " : "│   ") : 
                prefix + (itemIsLast ? "    " : "│   ");
              await printApiTree(path + (path === '/' ? '' : '/') + item.name, newPrefix, itemIsLast);
            }
          }
        }
      }
      
      await printApiTree('/', '', true);
    } catch (e) {
      werr(`tree: ${e.message}\n`);
    }
  }

  // ── Comando Logout ─────────────────────────────────────────────────────────

  async function doLogout() {
    clearSession();
    window.API_CONFIG.token = null;
    window.API_CONFIG.method = null;
    window.API_CONFIG.ready = false;

    w("Encerrando sessão...\n");
    await new Promise(resolve => setTimeout(resolve, 500));

    output.innerHTML = "";
    isLoggedIn = false;
    currentPath = [];
    currentDir = "/";
    useApiSource = false;

    showLoginScreen();
  }

  // ── execute ────────────────────────────────────────────────────────────────

  async function execute(raw) {
    const args = raw.trim().split(/\s+/);
    const cmd  = args[0];

    const ctx = {
      args: args.slice(1),
      raw: raw,
      currentDir: currentDir,
      currentPath: currentPath,
      fileTree: fileTree,
      FILES: FILES,
      output: output,
      terminal: terminal,
      w: w,
      werr: werr,
      whtml: whtml,
      esc: esc,
      refreshFilesystem: refreshFilesystem,
      getCurrentNode: getCurrentNode,
      USER: USER,
      HOST: HOST,
      saveSession: saveSession,
      useApiSource: useApiSource,
      openEditorWindow: openEditorWindow,
      input: (promptText = "") => requestTerminalInput(promptText),
      clear: () => {
        output.innerHTML = '';
      },
      print: (text, color = null, options = {}) => {
        const value = String(text ?? '');
        const suffix = options.newline === false ? '' : '\n';
        const html = color ? `<span style="color:${color}">${esc(value)}</span>${suffix}` : `${esc(value)}${suffix}`;
        whtml(html);
      },
      request: async (url, options = {}) => {
        const response = await fetch(url, options);
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return response.json();
        }
        return response.text();
      },
      window: (title, htmlContent, windowOptions = {}) => openProgramWindow(title, htmlContent, windowOptions)
    };

    // Verifica se é um comando modular
    if (commands[cmd]) {
      try {
        await executeCommandModule(commands[cmd], ctx);
        saveSession();
      } catch (error) {
        werr(`${cmd}: erro ao executar comando\n`);
        console.error(`[CommandError] ${cmd}:`, error);
      }
    } else {
      // Comandos built-in
      switch (cmd) {
        case "": break;

        case "help":
          const modularCommands = Object.keys(commands).sort();
          const modularList = modularCommands.length > 0 
            ? modularCommands.map(c => `  <span class="p-arrow">${esc(c)}</span>`).join("\n") + "\n"
            : "";

          whtml(
            `<span class="p-user">Sharp Shell v0.9 — Terminal Interativo</span>\n` +
            `<span class="p-line1">─────────────────────────────────────────</span>\n` +
            `<span style="color:#00ccff">Comandos básicos:</span>\n` +
            `  <span class="p-arrow">help</span>                mostra esta ajuda\n` +
            `  <span class="p-arrow">clear</span>               limpar terminal\n` +
            `  <span class="p-arrow">whoami</span>              usuário atual\n` +
            `  <span class="p-arrow">date</span>                data e hora\n` +
            `  <span class="p-arrow">echo</span> [texto]        ecoar texto\n` +
            `  <span class="p-arrow">pwd</span>                 mostrar caminho atual\n` +
            `  <span class="p-arrow">ls</span> [dir]            listar arquivos\n` +
            `  <span class="p-arrow">cd</span> [dir]            navegar diretórios\n` +
            `  <span class="p-arrow">tree</span>               exibir árvore de diretórios\n` +
            `  <span class="p-arrow">cat</span> <arquivo>      mostrar conteúdo de arquivo\n` +
            `  <span class="p-arrow">touch</span> <arquivo>    criar/editar arquivo local\n` +
            `  <span class="p-arrow">rm</span> [-p] <arquivo|pasta>  remover item local (use -p para pasta)\n` +
            `  <span class="p-arrow">mv</span> <origem> <destino> mover/renomear\n` +
            `  <span class="p-arrow">rename</span> <origem> <destino> alias de mv\n` +
            `  <span class="p-arrow">nano</span> [-v] <arquivo>  editar arquivo com nano\n` +
            `  <span class="p-arrow">upload</span> [-f|-p]     enviar arquivo ou pasta\n` +
            `  <span class="p-arrow">cmd</span> new <arquivo>   registrar comando customizado\n` +
            `  <span class="p-arrow">cmd</span> new -p <pasta>  registrar comandos de pasta\n` +
            `  <span class="p-arrow">cmd</span> list            listar comandos customizados\n` +
            `  <span class="p-arrow">cmd</span> del <nome>      remover comando customizado\n` +
            `  <span class="p-arrow">cmd</span> run <script>    executar script local\n` +
            `  <span class="p-arrow">mount</span>              montar/atualizar storage API\n` +
            `  <span class="p-arrow">api</span>                exibir informações da API\n` +
            `  <span class="p-arrow">search</span> <termo>     buscar arquivos (API)\n` +
            `  <span class="p-arrow">mkdir</span> <dir>        criar diretório via API\n` +
            `  <span class="p-arrow">sync</span>               sincronizar estrutura com API\n` +
            `  <span class="p-arrow">logout</span>            encerrar sessão\n` +
            `  <span class="p-arrow">exit</span> | <span class="p-arrow">sair</span>      sair do terminal\n` +
            (modularCommands.length > 0 ? `\n<span style="color:#00ccff">Comandos modulares:</span>\n${modularList}` : "") +
            `<span class="p-line1">─────────────────────────────────────────</span>\n` +
            `<span class="warn">Dica: use ↑↓ para histórico · ${useApiSource && window.API_CONFIG.ready ? 'API habilitada' : 'modo local'} · ${Object.keys(commands).length} comandos modulares</span>\n`
          );
          break;

        case "clear":
          output.innerHTML = "";
          break;

        case "whoami":
          w(USER + "\n");
          if (useApiSource) w(`(autenticado na API)\n`);
          break;

        case "date":
          w(new Date().toString() + "\n");
          break;

        case "echo":
          w(args.slice(1).join(" ") + "\n");
          break;

        case "mount":
          await doMount();
          break;

        case "ls":
          await doLs(args.slice(1));
          break;

        case "cd":
          await doCd(args[1]);
          break;

        case "cat":
          await doCat(args[1]);
          break;

        case "pwd":
          doPwd();
          break;

        case "tree":
          await doTree();
          break;

        // Novos comandos da API
        case "api":
          if (useApiSource && window.API_CONFIG.ready) {
            whtml(
              `<span style="color:#00ccff">API Raro - Informações</span>\n` +
              `<span style="color:#555">──────────────────────</span>\n` +
              `<span style="color:#88aaff">Base URL:</span> ${window.API_CONFIG.baseUrl}\n` +
              `<span style="color:#88aaff">Método:</span> ${window.API_CONFIG.method}\n` +
              `<span style="color:#88aaff">Autenticado:</span> ${window.API_CONFIG.token ? '✅ Sim' : '❌ Não'}\n` +
              `<span style="color:#88aaff">Storage:</span> Telegram Bot API\n`
            );
          } else {
            w("API não configurada. Faça login com credenciais da API.\n");
          }
          break;

        case "search":
          if (useApiSource && window.API_CONFIG.ready && args[1]) {
            try {
              const result = await window.apiSearch(args[1]);
              if (result.success && result.data) {
                w(`Resultados para "${args[1]}":\n`);
                for (const item of result.data) {
                  whtml(`  <span class="p-arrow">${esc(item.path)}</span> (${item.type})\n`);
                }
                if (result.data.length === 0) w("  Nenhum resultado\n");
              }
            } catch (e) {
              werr(`search: ${e.message}\n`);
            }
          } else {
            werr("search: requer API ativa e termo de busca\n");
          }
          break;

        case "mkdir":
          if (useApiSource && window.API_CONFIG.ready && args[1]) {
            try {
              const path = args[1].startsWith('/') ? args[1] : currentDir + (currentDir === '/' ? '' : '/') + args[1];
              const result = await window.apiCreateFolder(path);
              if (result.success) {
                w(`Diretório criado: ${path}\n`);
              } else {
                werr(`mkdir: ${result.error || 'erro'}\n`);
              }
            } catch (e) {
              werr(`mkdir: ${e.message}\n`);
            }
          } else {
            werr("mkdir: requer API ativa e nome do diretório\n");
          }
          break;

        case "touch":
          if (args[1]) {
            try {
              const path = args[1].startsWith('/') ? args[1] : currentDir + (currentDir === '/' ? '' : '/') + args[1];
              const content = args.slice(2).join(" ") || "";
              const result = await writeFileContent(path, content);
              if (result.success) {
                w(`Arquivo criado: ${path}\n`);
              } else {
                werr(`touch: ${result.error || 'erro'}\n`);
              }
            } catch (e) {
              werr(`touch: ${e.message}\n`);
            }
          } else {
            werr("touch: nome do arquivo obrigatório\n");
          }
          break;

        case "mv":
        case "rename":
          if (args[1]) {
            try {
              const result = await moveFileItem(args[1], args[2] || args[1]);
              if (result.success) {
                w(`Movido/renomeado: ${args[1]} -> ${args[2] || args[1]}\n`);
              } else {
                werr(`mv: ${result.error || 'erro'}\n`);
              }
            } catch (e) {
              werr(`mv: ${e.message}\n`);
            }
          } else {
            werr("mv: uso: mv <origem> <destino>\n");
          }
          break;

        case "rm": {
          const rmArgs = args.slice(1);
          const useFolderMode = rmArgs.includes('-p');
          const targetArg = rmArgs.filter(a => a !== '-p')[0];

          if (!targetArg) {
            werr("rm: caminho obrigatório\n");
            break;
          }

          const target = normalizeShellPath(targetArg);
          const normalized = target.endsWith('/') ? target.slice(0, -1) : target;
          const candidates = Array.from(new Set([
            normalized,
            normalized + '/',
            targetArg.replace(/^\/+/, '')
          ].filter(Boolean)));

          const deleteApiFolder = async () => {
            for (const candidate of candidates) {
              const result = await window.apiDeleteFolder(candidate);
              if (result && result.success) return result;
            }
            return { success: false, error: 'nao encontrado' };
          };

          const deleteApiFile = async () => {
            for (const candidate of candidates) {
              const result = await window.apiDeleteFile(candidate);
              if (result && result.success) return result;
            }
            return { success: false, error: 'nao encontrado' };
          };

          if (useApiSource && window.API_CONFIG.ready) {
            try {
              let result = null;
              if (useFolderMode || targetArg.endsWith('/')) {
                result = await deleteApiFolder();
              } else {
                result = await deleteApiFile();
                if (!result.success) {
                  result = await deleteApiFolder();
                }
              }
              if (result.success) {
                w(`Deletado: ${targetArg}\n`);
              } else {
                werr(`rm: ${result.error || 'nao encontrado'}\n`);
              }
            } catch (e) {
              werr(`rm: ${e.message}\n`);
            }
            break;
          }

          try {
            const fileEntry = getFileEntryFromList(normalized);
            if (fileEntry && !fileEntry.type) {
              const index = FILES.findIndex(file => normalizePath(file.name) === normalized);
              if (index >= 0) FILES.splice(index, 1);
              localStorage.removeItem(getLocalFileKey(normalized));
              refreshFilesystem();
              w(`Deletado: ${targetArg}\n`);
              break;
            }

            const dirNode = getNodeByPath(normalized);
            if (dirNode && dirNode.type === 'dir') {
              const prefix = normalized === '' ? '' : `${normalized}/`;
              const toRemove = FILES.filter(file => normalizePath(file.name) === normalized || normalizePath(file.name).startsWith(prefix));
              if (toRemove.length === 0) {
                werr(`rm: ${targetArg}: não encontrado\n`);
                break;
              }
              for (const file of toRemove) {
                const index = FILES.findIndex(item => normalizePath(item.name) === normalizePath(file.name));
                if (index >= 0) FILES.splice(index, 1);
                localStorage.removeItem(getLocalFileKey(normalizePath(file.name)));
              }
              refreshFilesystem();
              w(`Deletado: ${targetArg}\n`);
              break;
            }

            werr(`rm: ${targetArg}: não encontrado\n`);
          } catch (e) {
            werr(`rm: ${e.message}\n`);
          }
          break;
        }

        case "sync":
          if (useApiSource && window.API_CONFIG.ready) {
            w("Sincronizando com API...\n");
            try {
              const tree = await window.syncFromApi();
              if (tree) {
                fileTree = tree;
                w("✓ Sincronização completa!\n");
              } else {
                werr("sync: falha na sincronização\n");
              }
            } catch (e) {
              werr(`sync: ${e.message}\n`);
            }
          } else {
            werr("sync: requer API ativa\n");
          }
          break;

        case "cmd": {
          const subcommand = args[1];
          const target = args[2];
          if (!subcommand) {
            w('Uso: cmd new <arquivo> | cmd new -p <pasta> | cmd list | cmd del <nome> | cmd run <script>\n');
            break;
          }

          try {
            if (subcommand === 'new') {
              if (target === '-p') {
                const folderPath = args[3];
                if (!folderPath) {
                  werr('cmd new: informe a pasta\n');
                  break;
                }
                const registered = await registerCommandsFromFolder(folderPath);
                w(`Comandos registrados: ${registered.map(item => item.name).join(', ')}\n`);
              } else {
                if (!target) {
                  werr('cmd new: arquivo obrigatório\n');
                  break;
                }
                const entry = await registerCommandFromFile(target);
                w(`Comando registrado: ${entry.name}\n`);
              }
            } else if (subcommand === 'list') {
              const entries = listCustomCommands();
              if (!entries.length) {
                w('Nenhum comando customizado registrado.\n');
              } else {
                for (const entry of entries) {
                  w(`${entry.name}  (${entry.path})\n`);
                }
              }
            } else if (subcommand === 'del') {
              if (!target) {
                werr('cmd del: nome do comando obrigatório\n');
                break;
              }
              const removed = removeCustomCommand(target);
              if (removed) {
                w(`Comando removido: ${target}\n`);
              } else {
                werr(`cmd del: comando não encontrado: ${target}\n`);
              }
            } else if (subcommand === 'run') {
              if (!target) {
                werr('cmd run: script obrigatório\n');
                break;
              }
              await runScriptFile(target, ctx);
              w('Execução concluída.\n');
            } else {
              werr(`cmd: subcomando inválido: ${subcommand}\n`);
            }
          } catch (error) {
            werr(`cmd: ${error.message}\n`);
          }
          break;
        }

        case "nano": {
          const rawArgs = args.slice(1);
          const useWindow = rawArgs.includes('-v');
          const fileArg = rawArgs.filter(a => a !== '-v')[0];
          if (!fileArg) {
            werr('nano: arquivo obrigatório\n');
            w('Uso: nano [-v] arquivo\n');
            break;
          }
          await openEditorWindow(fileArg, useWindow);
          break;
        }

        case "upload": {
          const modeArg = args[1];
          if (modeArg === '-p') {
            await openUploadWindow('folder');
          } else if (modeArg === '-f') {
            await openUploadWindow('file');
          } else {
            await openUploadWindow('file');
          }
          break;
        }

        case "logout":
        case "exit":
        case "sair":
          await doLogout();
          break;

        default:
          werr(`bash: ${esc(cmd)}: comando não encontrado\n`);
      }
    }
    saveSession();
  }

  // ── input ──────────────────────────────────────────────────────────────────

  cmdInput.addEventListener("keydown", async function (e) {
    if (!isLoggedIn) return;

    if (pendingInputResolver) {
      if (e.key === "Enter") {
        e.preventDefault();
        const value = cmdInput.value;
        cmdInput.value = "";
        w(`${value}\n`);
        const resolveInput = pendingInputResolver;
        clearPendingInput();
        resolveInput(value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cmdInput.value = "";
        w("\n");
        const resolveInput = pendingInputResolver;
        clearPendingInput();
        resolveInput("");
      }
      return;
    }

    if (terminalNanoState) {
      const raw = cmdInput.value;
      if (e.key === "Enter") {
        e.preventDefault();
        const command = raw.trim();
        if (command === ':w') {
          await saveTerminalEditor();
        } else if (command === ':wq') {
          await saveTerminalEditor(true);
        } else if (command === ':q' || command === ':q!') {
          exitTerminalEditor();
        } else {
          if (raw === '') {
            terminalNanoState.content.push('');
          } else {
            terminalNanoState.content.push(raw);
          }
          w(`${raw}\n`);
          cmdInput.value = '';
          terminal.scrollTop = terminal.scrollHeight;
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        exitTerminalEditor();
      } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        await saveTerminalEditor();
      } else if (e.ctrlKey && (e.key.toLowerCase() === 'x' || e.key.toLowerCase() === 'q')) {
        e.preventDefault();
        exitTerminalEditor();
      }
      return;
    }

    if (e.key === "Enter") {
      const raw = cmdInput.value;
      if (raw.trim()) { cmdHistory.unshift(raw); histIdx = -1; }
      wPrompt(raw);
      cmdInput.value = "";
      await execute(raw);
      updatePrompt();
      terminal.scrollTop = terminal.scrollHeight;

    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIdx < cmdHistory.length - 1) {
        histIdx++;
        cmdInput.value = cmdHistory[histIdx];
      }

    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      histIdx = Math.max(-1, histIdx - 1);
      cmdInput.value = histIdx === -1 ? "" : cmdHistory[histIdx];
    }
  });

  terminal.addEventListener("click", () => {
    if (isLoggedIn) cmdInput.focus();
  });

  // ── Função sleep ───────────────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── boot ───────────────────────────────────────────────────────────────────

  refreshFilesystem();
  loadCommands();
  restoreCustomCommands();

  // Verifica sessão salva
  const savedSession = loadSession();
  const savedToken = getCookie("api_token");
  const savedMethod = getCookie("api_method");
  const hasSavedApiSession = savedSession && savedSession.isLoggedIn && savedSession.useApiSource && isPersistedLoginActive();

  if (hasSavedApiSession) {
    window.API_CONFIG.token = savedToken;
    window.API_CONFIG.method = savedMethod;
    window.API_CONFIG.ready = true;
    useApiSource = true;

    // Valida sessão API antes de restaurar o usuário
    window.apiListFolder('').then(() => {
      isLoggedIn = true;
      currentPath = savedSession.currentPath || [];
      currentDir = savedSession.currentDir || "/";

    // Mostra boot rápido
    output.style.display = "";
    document.querySelector(".prompt-top").style.display = "none";
    document.querySelector(".input-line").style.display = "none";

    output.innerHTML = `
<span style="color:#00ccff">
   _____ __                     _____ __           __ 
  / ___// /_  ____ __________  / ___// /_  ___    / / 
  \\__ \\/ __ \\/ __ \`/ ___/ __ \\ \\__ \\/ __ \\/ _ \\  / /  
 ___/ / / / / /_/ / /  / /_/ /___/ / / / /  __/ / /___
/____/_/ /_/\\__,_/_/   \\____//____/_/ /_/\\___/ /_____/
</span>

<span style="color:#00ccff">Sharp Shell OS v0.9</span>
<span style="color:#555">───────────────────────────────────────────────</span>
`;

    setTimeout(() => {
      whtml(
        `<span style="color:#00ccff">Bem-vindo de volta, ${esc(USER)}!</span>\n` +
        `<span style="color:#555">Sessão restaurada de: ${new Date(savedSession.timestamp).toLocaleString()}</span>\n` +
        `<span style="color:#888">Fonte: ${useApiSource ? 'API' : 'Local'} · ${Object.keys(commands).length} comandos</span>\n\n`
      );

      document.querySelector(".prompt-top").style.display = "";
      document.querySelector(".input-line").style.display = "";
      updatePrompt();
      cmdInput.focus();

      // Verifica API se estava usando
      if (useApiSource) {
        const savedToken = getCookie("api_token");
        const savedMethod = getCookie("api_method");
        if (savedToken && savedMethod) {
          window.API_CONFIG.token = savedToken;
          window.API_CONFIG.method = savedMethod;
          window.API_CONFIG.ready = true;
        } else {
          useApiSource = false;
          whtml(`<span style="color:#ffcc44">⚠ Sessão API perdida. Faça login novamente.</span>\n\n`);
        }
      }
    }, 500);
  }).catch(() => {
      clearSession();
      window.API_CONFIG.ready = false;
      useApiSource = false;
      showEnvironmentSetup();
  });
  } else {
    showEnvironmentSetup();
  }

})(typeof FILES !== "undefined" ? FILES : []);