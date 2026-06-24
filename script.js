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

  // ── Carregamento automático de comandos ────────────────────────────────────

  function loadCommands() {
    const commandFiles = FILES.filter(f => f.name.startsWith("commands/") && f.name.endsWith(".js"));
    
    console.log(`[CommandLoader] Carregando ${commandFiles.length} comandos...`);
    
    for (const file of commandFiles) {
      try {
        const fileName = file.name.replace("commands/", "").replace(".js", "");
        const commandModule = new Function('ctx', file.content);
        commands[fileName] = commandModule;
        console.log(`[CommandLoader] ✓ Comando carregado: ${fileName}`);
      } catch (error) {
        console.error(`[CommandLoader] ✗ Erro ao carregar ${file.name}:`, error);
      }
    }
    
    console.log(`[CommandLoader] Total: ${Object.keys(commands).length} comandos registrados`);
  }

  // ── command history ────────────────────────────────────────────────────────
  const cmdHistory = [];
  let histIdx = -1;

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

  // ── Salvamento de sessão ───────────────────────────────────────────────────

  function saveSession() {
    localStorage.setItem("sharpShell_session", JSON.stringify({
      isLoggedIn: true,
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

  function clearSession() {
    localStorage.removeItem("sharpShell_session");
    localStorage.removeItem("api_token");
    localStorage.removeItem("api_method");
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

    // Restaura método salvo se existir
    const savedMethod = localStorage.getItem("api_method");
    const savedToken = localStorage.getItem("api_token");
    
    if (savedMethod && savedToken) {
      whtml(`<span style="color:#888">Método salvo encontrado: ${savedMethod}</span>\n`);
      window.API_CONFIG.method = savedMethod;
      window.API_CONFIG.token = savedToken;
      window.API_CONFIG.ready = true;
      useApiSource = true;
      
      whtml(`<span style="color:#66ff99">✓ Sessão API restaurada</span>\n\n`);
      await sleep(1000);
      
      // Testa conexão rapidamente
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

    // Se não tem método salvo ou expirou, faz os testes
    if (!window.API_CONFIG.ready) {
      const method = await window.runConnectionTests((msg) => {
        whtml(`<span style="color:#888">${msg}</span>\n`);
      });

      if (method) {
        window.API_CONFIG.method = method;
        whtml(`\n<span style="color:#66ff99">✓ Ambiente configurado com sucesso!</span>\n`);
        whtml(`<span style="color:#888">Método: ${method}</span>\n\n`);
      } else {
        whtml(`\n<span style="color:#ffcc44">⚠ Modo offline - Sem conexão com a API</span>\n`);
        whtml(`<span style="color:#888">Usando sistema de arquivos local</span>\n\n`);
        useApiSource = false;
      }
    }

    await sleep(1500);
    
    // Continua para o login
    showLoginScreen();
  }

  // ── Tela de Login ──────────────────────────────────────────────────────────

  function showLoginScreen() {
    document.querySelector(".prompt-top").style.display = "none";
    document.querySelector(".input-line").style.display = "none";
    output.style.display = "none";

    // Remove tela de login anterior se existir
    const oldLogin = document.getElementById("loginScreen");
    if (oldLogin) oldLogin.remove();

    const loginHTML = `
      <div id="loginScreen" style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
        animation: fadeIn 0.8s ease-in-out;
      ">
        <div style="text-align: center; margin-bottom: 30px; animation: slideDown 0.6s ease-out;">
          <pre style="color: #00ccff; font-size: 12px; line-height: 1.2;">
   _____ __                     _____ __           __ 
  / ___// /_  ____ __________  / ___// /_  ___    / / 
  \\__ \\/ __ \\/ __ \`/ ___/ __ \\ \\__ \\/ __ \\/ _ \\  / /  
 ___/ / / / / /_/ / /  / /_/ /___/ / / / /  __/ / /___
/____/_/ /_/\\__,_/_/   \\____//____/_/ /_/\\___/ /_____/
          </pre>
          <h2 style="color: #00ccff; margin: 10px 0; font-family: inherit; text-shadow: 0 0 10px rgba(0,204,255,0.3);">Sharp Shell Login</h2>
          <p style="color: #888; font-family: inherit;">localhost | tty1</p>
          ${window.API_CONFIG.ready ? '<p style="color: #66ff99; font-size: 12px; margin-top: 5px;">🔗 API conectada</p>' : '<p style="color: #ffcc44; font-size: 12px; margin-top: 5px;">📡 Modo offline</p>'}
        </div>
        
        <div id="loginBox" style="
          background: rgba(0, 204, 255, 0.05);
          border: 1px solid #00ccff33;
          border-radius: 4px;
          padding: 20px;
          min-width: 320px;
          animation: slideUp 0.8s ease-out;
          backdrop-filter: blur(5px);
        ">
          ${window.API_CONFIG.ready ? `
          <div style="margin-bottom: 15px;">
            <label style="color: #888; display: block; margin-bottom: 5px;">API Username:</label>
            <input id="apiUser" type="text" autocomplete="off" spellcheck="false" style="
              background: #0d0d0d;
              border: 1px solid #333;
              color: #00ccff;
              padding: 8px 12px;
              width: 100%;
              font-family: inherit;
              font-size: 14px;
              outline: none;
              caret-color: #00ccff;
              transition: border-color 0.3s;
            " placeholder="raro"
            onfocus="this.style.borderColor='#00ccff'"
            onblur="this.style.borderColor='#333'">
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="color: #888; display: block; margin-bottom: 5px;">API Password:</label>
            <input id="apiPassword" type="password" autocomplete="off" spellcheck="false" style="
              background: #0d0d0d;
              border: 1px solid #333;
              color: #00ccff;
              padding: 8px 12px;
              width: 100%;
              font-family: inherit;
              font-size: 14px;
              outline: none;
              caret-color: #00ccff;
              transition: border-color 0.3s;
            " placeholder="••••••"
            onfocus="this.style.borderColor='#00ccff'"
            onblur="this.style.borderColor='#333'">
          </div>
          ` : ''}
          
          <div style="margin-bottom: 15px;">
            <label style="color: #888; display: block; margin-bottom: 5px;">Usuário Local:</label>
            <input id="loginUser" type="text" autocomplete="off" spellcheck="false" style="
              background: #0d0d0d;
              border: 1px solid #333;
              color: #00ccff;
              padding: 8px 12px;
              width: 100%;
              font-family: inherit;
              font-size: 14px;
              outline: none;
              caret-color: #00ccff;
              transition: border-color 0.3s;
            " placeholder="raro"
            onfocus="this.style.borderColor='#00ccff'"
            onblur="this.style.borderColor='#333'">
          </div>
          
          <div style="margin-bottom: 15px;">
            <label style="color: #888; display: block; margin-bottom: 5px;">Senha Local:</label>
            <input id="loginPassword" type="password" autocomplete="off" spellcheck="false" style="
              background: #0d0d0d;
              border: 1px solid #333;
              color: #00ccff;
              padding: 8px 12px;
              width: 100%;
              font-family: inherit;
              font-size: 14px;
              outline: none;
              caret-color: #00ccff;
              transition: border-color 0.3s;
            " placeholder="••••••"
            onfocus="this.style.borderColor='#00ccff'"
            onblur="this.style.borderColor='#333'">
          </div>
          
          <div id="loginError" style="
            color: #ff6b6b;
            margin-bottom: 10px;
            font-size: 13px;
            display: none;
            animation: shake 0.4s ease-in-out;
          ">Credenciais inválidas</div>
          
          <div id="loginLoading" style="
            color: #ffcc44;
            margin-bottom: 10px;
            font-size: 13px;
            display: none;
          ">Conectando à API...</div>
          
          <button id="loginBtn" style="
            background: #00ccff22;
            border: 1px solid #00ccff;
            color: #00ccff;
            padding: 8px 20px;
            width: 100%;
            font-family: inherit;
            font-size: 14px;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.3s;
          " onmouseover="this.style.background='#00ccff44'"
            onmouseout="this.style.background='#00ccff22'">
            Entrar
          </button>
          
          <p style="color: #555; font-size: 11px; margin-top: 15px; text-align: center;">
            ${window.API_CONFIG.ready ? 'Login local: "raro" sem senha<br>API: suas credenciais do Netlify' : 'Dica: usuário "raro" sem senha'}
          </p>
        </div>
      </div>
    `;

    terminal.insertAdjacentHTML("beforeend", loginHTML);

    const loginUser = document.getElementById("loginUser");
    const loginPassword = document.getElementById("loginPassword");
    const loginError = document.getElementById("loginError");
    const loginLoading = document.getElementById("loginLoading");

    async function attemptLogin() {
      const user = loginUser.value.trim();
      const pass = loginPassword.value;
      const apiUser = document.getElementById("apiUser")?.value.trim();
      const apiPass = document.getElementById("apiPassword")?.value;

      loginError.style.display = "none";
      loginLoading.style.display = "none";

      // Validação login local
      const localValid = (user === "raro" && pass === "") || 
                         (user === "root" && pass === "toor");

      if (!localValid) {
        loginError.style.display = "block";
        loginError.style.animation = "none";
        loginError.offsetHeight;
        loginError.style.animation = "shake 0.4s ease-in-out";
        loginPassword.value = "";
        loginPassword.focus();
        return;
      }

      // Se API está disponível, tenta autenticar
      if (window.API_CONFIG.ready && apiUser && apiPass) {
        loginLoading.style.display = "block";
        
        const apiResult = await window.apiLogin(apiUser, apiPass);
        
        if (apiResult.success) {
          useApiSource = true;
          loginLoading.style.display = "none";
        } else {
          loginLoading.style.display = "none";
          whtml(`<span style="color:#ffcc44">⚠ API: ${apiResult.error || 'Falha na autenticação'}</span>\n`);
          useApiSource = false;
        }
      }

      // Continua com login
      hideLoginScreen();
      isLoggedIn = true;
      output.style.display = "";
      document.querySelector(".prompt-top").style.display = "";
      document.querySelector(".input-line").style.display = "";

      output.style.animation = "fadeIn 0.5s ease-in-out";
      document.querySelector(".prompt-top").style.animation = "fadeIn 0.5s ease-in-out";
      document.querySelector(".input-line").style.animation = "fadeIn 0.5s ease-in-out";

      const sourceLabel = useApiSource ? "API (Telegram)" : "Storage Local";
      whtml(
        `<span style="color:#00ccff">Bem-vindo de volta, ${esc(user)}!</span>\n` +
        `<span style="color:#555">Último login: ${new Date().toLocaleString()}</span>\n` +
        `<span style="color:#888">Fonte: ${sourceLabel} · ${Object.keys(commands).length} comandos</span>\n\n`
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

    const lastInput = document.getElementById("loginPassword");
    lastInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") attemptLogin();
    });

    // Foco no primeiro campo
    setTimeout(() => {
      const firstInput = document.getElementById("apiUser") || loginUser;
      if (firstInput) firstInput.focus();
    }, 100);
  }

  function hideLoginScreen() {
    const loginScreen = document.getElementById("loginScreen");
    if (loginScreen) loginScreen.style.display = "none";
  }

  // ── comandos de filesystem (modo local) ────────────────────────────────────

  async function doMount() {
    refreshFilesystem();

    if (useApiSource) {
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
      return;
    }

    if (!FILES || !Array.isArray(FILES)) {
      werr("mount: FILES não disponível\n");
      return;
    }

    w(`Storage montado: ${FILES.length} arquivo(s) no total\n`);

    const rootNode = fileTree;
    if (rootNode && rootNode.children) {
      const items = Object.entries(rootNode.children);
      const dirCount = items.filter(([, c]) => c.type === "dir").length;
      const fileCount = items.filter(([, c]) => c.type === "file").length;
      w(`Raiz (/): ${dirCount} diretório(s), ${fileCount} arquivo(s)\n`);
    }
  }

  async function doLs(args) {
    if (useApiSource) {
      try {
        const pathQuery = currentDir === '/' ? '' : currentDir.replace(/^\//, '');
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

    refreshFilesystem();
    const node = getCurrentNode();

    if (!node || !node.children) {
      werr("ls: diretório não encontrado\n");
      return;
    }

    const entries = Object.entries(node.children);

    if (entries.length === 0) {
      w("(diretório vazio)\n");
      return;
    }

    const dirs = [], files = [];
    for (const [name, child] of entries) {
      if (child.type === "dir") {
        dirs.push(`<span class="ls-dir">${esc(name)}/</span>`);
      } else {
        const ext = name.split(".").pop();
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
  }

  async function doCd(target) {
    if (useApiSource) {
      if (!target || target === "/") {
        currentPath = [];
        currentDir = "/";
        updatePrompt();
        saveSession();
        return;
      }

      if (target === "..") {
        if (currentPath.length > 0) {
          currentPath.pop();
        }
        currentDir = currentPath.length === 0 ? "/" : "/" + currentPath.join("/");
        updatePrompt();
        saveSession();
        return;
      }

      if (target === ".") return;

      // Tenta navegar via API
      try {
        const pathQuery = (currentDir === '/' ? '' : currentDir.replace(/^\//, '')) + 
                          (currentDir === '/' ? '' : '/') + target;
        const cleanPath = pathQuery.replace(/\/+/g, '/').replace(/^\//, '');
        const result = await window.apiListFolder(cleanPath);
        
        if (result.success) {
          currentDir = '/' + cleanPath;
          currentPath = cleanPath.split('/').filter(p => p);
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

    refreshFilesystem();

    if (!target || target === "/") {
      currentPath = [];
      currentDir = "/";
      updatePrompt();
      saveSession();
      return;
    }

    if (target === "..") {
      if (currentPath.length > 0) {
        currentPath.pop();
      }
      currentDir = currentPath.length === 0 ? "/" : "/" + currentPath.join("/");
      updatePrompt();
      saveSession();
      return;
    }

    if (target === ".") return;

    if (target.startsWith("/")) {
      const segments = target.split("/").filter(s => s);
      let node = fileTree;
      for (const seg of segments) {
        if (!node.children || !node.children[seg] || node.children[seg].type !== "dir") {
          werr(`cd: ${target}: diretório não encontrado\n`);
          return;
        }
        node = node.children[seg];
      }
      currentPath = segments;
      currentDir = "/" + segments.join("/");
      updatePrompt();
      saveSession();
      return;
    }

    const node = getCurrentNode();
    if (!node || !node.children || !node.children[target]) {
      werr(`cd: ${target}: diretório não encontrado\n`);
      return;
    }

    const child = node.children[target];
    if (child.type !== "dir") {
      werr(`cd: ${target}: não é um diretório\n`);
      return;
    }

    currentPath.push(target);
    currentDir = "/" + currentPath.join("/");
    updatePrompt();
    saveSession();
  }

  async function doCat(file) {
    if (!file) { werr("cat: argumento obrigatório\n"); return; }

    if (useApiSource) {
      try {
        const filePath = (currentDir === '/' ? '' : currentDir.replace(/^\//, '') + '/') + file;
        const cleanPath = filePath.replace(/\/+/g, '/').replace(/^\//, '');
        const result = await window.apiReadFile(cleanPath);
        
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

    refreshFilesystem();

    let targetPath = [...currentPath];
    if (file.startsWith("/")) {
      targetPath = file.split("/").filter(s => s);
    } else {
      targetPath.push(file);
    }

    const dirPath = targetPath.slice(0, -1);
    const fileName = targetPath[targetPath.length - 1];

    let node = fileTree;
    for (const seg of dirPath) {
      if (!node.children || !node.children[seg] || node.children[seg].type !== "dir") {
        werr(`cat: ${file}: diretório não encontrado\n`);
        return;
      }
      node = node.children[seg];
    }

    if (!node.children || !node.children[fileName]) {
      werr(`cat: ${file}: arquivo não encontrado\n`);
      return;
    }

    const child = node.children[fileName];
    if (child.type !== "file") {
      werr(`cat: ${file}: é um diretório\n`);
      return;
    }

    const content = child.content || "";
    w(content + (content.endsWith("\n") ? "" : "\n"));
  }

  function doPwd() {
    w(currentDir + "\n");
    if (useApiSource) {
      whtml(`<span style="color:#555">[API: ${window.API_CONFIG.baseUrl}]</span>\n`);
    }
  }

  async function doTree() {
    if (useApiSource) {
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
      return;
    }

    refreshFilesystem();

    function printNode(node, name, prefix, isLast) {
      if (name !== undefined) {
        const connector = isLast ? "└── " : "├── ";
        if (node.type === "dir") {
          whtml(`${prefix}${connector}<span class="ls-dir">${esc(name)}/</span>\n`);
        } else {
          const ext = name.split(".").pop();
          const isScript = ["js", "sh", "py", "rb"].includes(ext || "");
          whtml(
            `${prefix}${connector}` +
            (isScript 
              ? `<span class="ls-exe">${esc(name)}*</span>` 
              : `<span class="ls-file">${esc(name)}</span>`) +
            `\n`
          );
        }
      }

      if (node.type === "dir" && node.children) {
        const entries = Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b));
        const newPrefix = name === undefined ? "" : prefix + (isLast ? "    " : "│   ");

        entries.forEach(([childName, childNode], index) => {
          printNode(childNode, childName, newPrefix, index === entries.length - 1);
        });
      }
    }

    w(currentDir + "\n");
    const node = getCurrentNode();
    if (node) {
      printNode(node, undefined, "", true);
    }
  }

  // ── Comando Logout ─────────────────────────────────────────────────────────

  async function doLogout() {
    saveSession();

    w("Salvando sessão...\n");
    await new Promise(resolve => setTimeout(resolve, 300));
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
      useApiSource: useApiSource
    };

    // Verifica se é um comando modular
    if (commands[cmd]) {
      try {
        await commands[cmd](ctx);
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
            `<span style="color:#00ccff">Comandos do Sistema:</span>\n` +
            `  <span class="p-arrow">help</span>             mostra esta ajuda\n` +
            `  <span class="p-arrow">clear</span>            limpar terminal\n` +
            `  <span class="p-arrow">whoami</span>           usuário atual\n` +
            `  <span class="p-arrow">date</span>             data e hora\n` +
            `  <span class="p-arrow">echo</span> [texto]     ecoar texto\n` +
            `  <span class="p-arrow">mount</span>            montar/atualizar storage\n` +
            `  <span class="p-arrow">ls</span> [dir]         listar arquivos\n` +
            `  <span class="p-arrow">cd</span> [dir]         navegar diretórios\n` +
            `  <span class="p-arrow">cat</span> [arquivo]    ler conteúdo\n` +
            `  <span class="p-arrow">pwd</span>              mostrar caminho\n` +
            `  <span class="p-arrow">tree</span>             árvore de diretórios\n` +
            `  <span class="p-arrow">search</span> [termo]   buscar arquivos (API)\n` +
            `  <span class="p-arrow">mkdir</span> [dir]      criar diretório (API)\n` +
            `  <span class="p-arrow">touch</span> [arq]      criar arquivo (API)\n` +
            `  <span class="p-arrow">rm</span> [arq/dir]     deletar arquivo/pasta (API)\n` +
            `  <span class="p-arrow">api</span>              info da API\n` +
            `  <span class="p-arrow">sync</span>             sincronizar com API\n` +
            `  <span class="p-arrow">logout</span>           salvar sessão e sair\n` +
            (modularCommands.length > 0 ? `\n<span style="color:#00ccff">Comandos Modulares:</span>\n${modularList}` : "") +
            `<span class="p-line1">─────────────────────────────────────────</span>\n` +
            `<span class="warn">Dica: use ↑↓ para histórico · Fonte: ${useApiSource ? 'API' : 'Local'} · ${Object.keys(commands).length} modulares</span>\n`
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
          if (useApiSource && window.API_CONFIG.ready && args[1]) {
            try {
              const path = args[1].startsWith('/') ? args[1] : currentDir + (currentDir === '/' ? '' : '/') + args[1];
              const content = args.slice(2).join(" ") || "";
              const result = await window.apiCreateFile(path, content);
              if (result.success) {
                w(`Arquivo criado: ${path}\n`);
              } else {
                werr(`touch: ${result.error || 'erro'}\n`);
              }
            } catch (e) {
              werr(`touch: ${e.message}\n`);
            }
          } else {
            werr("touch: requer API ativa e nome do arquivo\n");
          }
          break;

        case "rm":
          if (useApiSource && window.API_CONFIG.ready && args[1]) {
            try {
              const path = args[1].startsWith('/') ? args[1] : currentDir + (currentDir === '/' ? '' : '/') + args[1];
              // Tenta deletar como arquivo primeiro
              let result = await window.apiDeleteFile(path.replace(/^\//, ''));
              if (!result.success) {
                // Se falhar, tenta como pasta
                result = await window.apiDeleteFolder(path.replace(/^\//, ''));
              }
              if (result.success) {
                w(`Deletado: ${path}\n`);
              } else {
                werr(`rm: ${result.error || 'erro'}\n`);
              }
            } catch (e) {
              werr(`rm: ${e.message}\n`);
            }
          } else {
            werr("rm: requer API ativa e caminho do item\n");
          }
          break;

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

  // Verifica sessão salva
  const savedSession = loadSession();

  if (savedSession && savedSession.isLoggedIn) {
    // Restaura sessão
    isLoggedIn = true;
    currentPath = savedSession.currentPath || [];
    currentDir = savedSession.currentDir || "/";
    useApiSource = savedSession.useApiSource || false;

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
        const savedToken = localStorage.getItem("api_token");
        const savedMethod = localStorage.getItem("api_method");
        if (savedToken && savedMethod) {
          window.API_CONFIG.token = savedToken;
          window.API_CONFIG.method = savedMethod;
          window.API_CONFIG.ready = true;
        } else {
          useApiSource = false;
          whtml(`<span style="color:#ffcc44">⚠ Sessão API perdida, mude para modo local</span>\n\n`);
        }
      }
    }, 500);
  } else {
    // Carrega comandos e inicia com tela de configuração
    loadCommands();
    showEnvironmentSetup();
  }

})(typeof FILES !== "undefined" ? FILES : []);