// API Tester - Testa múltiplos métodos de requisição até encontrar um que funcione
const API_CONFIG = {
  baseUrl: "https://apifile.netlify.app",
  token: null,
  method: null, // 'fetch', 'xhr', 'jsonp', 'beacon'
  ready: false,
  testing: false
};

// Cache local do filesystem quando offline/sem API
let localFilesystem = null;
let useApi = false;

// ========== TESTADORES DE CONEXÃO ==========

async function testFetch(url, options = {}) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit'
    });
    clearTimeout(timeout);
    return response;
  } catch (e) {
    throw new Error(`fetch failed: ${e.message}`);
  }
}

async function testXHR(method, url, body = null) {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.timeout = 5000;
      xhr.setRequestHeader('Content-Type', 'application/json');
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            ok: true,
            status: xhr.status,
            json: () => Promise.resolve(JSON.parse(xhr.responseText)),
            text: () => Promise.resolve(xhr.responseText)
          });
        } else {
          resolve({
            ok: false,
            status: xhr.status,
            json: () => Promise.resolve(JSON.parse(xhr.responseText)),
            text: () => Promise.resolve(xhr.responseText)
          });
        }
      };
      
      xhr.onerror = () => reject(new Error('XHR network error'));
      xhr.ontimeout = () => reject(new Error('XHR timeout'));
      
      xhr.send(body ? JSON.stringify(body) : null);
    } catch (e) {
      reject(new Error(`XHR failed: ${e.message}`));
    }
  });
}

async function testBeacon(url, data) {
  try {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const sent = navigator.sendBeacon(url, blob);
    return sent;
  } catch (e) {
    return false;
  }
}

async function testImagePing(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timeout = setTimeout(() => {
      img.src = '';
      reject(new Error('Image ping timeout'));
    }, 5000);
    
    img.onload = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      // Erro esperado (não é imagem), mas conexão funcionou
      resolve(true);
    };
    img.src = url + '?ping=' + Date.now();
  });
}

// ========== SISTEMA DE TESTES PROGRESSIVOS ==========

async function runConnectionTests(statusCallback) {
  const results = [];
  
  // Teste 1: Fetch simples (HEAD request)
  statusCallback('Testando Fetch API...');
  try {
    await testFetch(API_CONFIG.baseUrl + '/api/auth/login', { method: 'HEAD' });
    results.push({ method: 'fetch_head', success: true });
    statusCallback('✓ Fetch API: OK');
  } catch (e) {
    results.push({ method: 'fetch_head', success: false, error: e.message });
    statusCallback('✗ Fetch API: ' + e.message);
  }
  await sleep(500);

  // Teste 2: XHR simples
  statusCallback('Testando XMLHttpRequest...');
  try {
    await testXHR('HEAD', API_CONFIG.baseUrl + '/api/auth/login');
    results.push({ method: 'xhr_head', success: true });
    statusCallback('✓ XMLHttpRequest: OK');
  } catch (e) {
    results.push({ method: 'xhr_head', success: false, error: e.message });
    statusCallback('✗ XMLHttpRequest: ' + e.message);
  }
  await sleep(500);

  // Teste 3: Fetch com POST
  statusCallback('Testando Fetch POST...');
  try {
    const response = await testFetch(API_CONFIG.baseUrl + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test', password: 'test' })
    });
    // Esperamos 401 (credenciais inválidas), mas indica que conexão funciona
    results.push({ method: 'fetch_post', success: true, status: response.status });
    statusCallback('✓ Fetch POST: OK (status ' + response.status + ')');
  } catch (e) {
    results.push({ method: 'fetch_post', success: false, error: e.message });
    statusCallback('✗ Fetch POST: ' + e.message);
  }
  await sleep(500);

  // Teste 4: XHR com POST
  statusCallback('Testando XHR POST...');
  try {
    const response = await testXHR('POST', API_CONFIG.baseUrl + '/api/auth/login', 
      { username: 'test', password: 'test' }
    );
    results.push({ method: 'xhr_post', success: true, status: response.status });
    statusCallback('✓ XHR POST: OK (status ' + response.status + ')');
  } catch (e) {
    results.push({ method: 'xhr_post', success: false, error: e.message });
    statusCallback('✗ XHR POST: ' + e.message);
  }
  await sleep(500);

  // Teste 5: Image ping
  statusCallback('Testando Image Ping...');
  try {
    await testImagePing(API_CONFIG.baseUrl + '/api/auth/login');
    results.push({ method: 'image_ping', success: true });
    statusCallback('✓ Image Ping: OK');
  } catch (e) {
    results.push({ method: 'image_ping', success: false, error: e.message });
    statusCallback('✗ Image Ping: ' + e.message);
  }
  await sleep(500);

  // Teste 6: Beacon
  statusCallback('Testando Beacon API...');
  try {
    const sent = await testBeacon(API_CONFIG.baseUrl + '/api/auth/login', 
      { username: 'test', password: 'test' }
    );
    results.push({ method: 'beacon', success: sent });
    statusCallback(sent ? '✓ Beacon API: OK' : '✗ Beacon API: Failed');
  } catch (e) {
    results.push({ method: 'beacon', success: false, error: e.message });
    statusCallback('✗ Beacon API: ' + e.message);
  }

  // Determina o melhor método
  const successfulMethods = results.filter(r => r.success);
  
  if (successfulMethods.length === 0) {
    statusCallback('\n⚠ Nenhum método de conexão funcionou. Usando modo offline.');
    return null;
  }

  // Preferência: fetch_post > xhr_post > fetch_head > xhr_head > outros
  const methodPriority = ['fetch_post', 'xhr_post', 'fetch_head', 'xhr_head', 'image_ping', 'beacon'];
  let bestMethod = null;
  
  for (const method of methodPriority) {
    if (successfulMethods.find(r => r.method === method)) {
      bestMethod = method;
      break;
    }
  }

  statusCallback('\n✓ Método selecionado: ' + bestMethod);
  return bestMethod;
}

// ========== WRAPPER DE API UNIFICADO ==========

async function apiRequest(endpoint, options = {}) {
  if (!API_CONFIG.ready) {
    throw new Error('API não configurada');
  }

  const url = API_CONFIG.baseUrl + endpoint;
  const headers = {
    'Accept': '*/*',
    'Content-Type': 'application/json',
    ...(API_CONFIG.token ? { 'Authorization': 'Bearer ' + API_CONFIG.token } : {}),
    ...options.headers
  };

  const method = API_CONFIG.method || 'fetch_post';

  try {
    let response;

    if (method.startsWith('fetch')) {
      response = await testFetch(url, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } else if (method.startsWith('xhr')) {
      response = await new Promise((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open(options.method || 'GET', url, true);
          xhr.timeout = 10000;
          xhr.setRequestHeader('Accept', '*/*');
          xhr.setRequestHeader('Content-Type', 'application/json');
          if (API_CONFIG.token) {
            xhr.setRequestHeader('Authorization', 'Bearer ' + API_CONFIG.token);
          }

          xhr.onload = () => {
            resolve({
              ok: xhr.status >= 200 && xhr.status < 300,
              status: xhr.status,
              json: () => Promise.resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {}),
              text: () => Promise.resolve(xhr.responseText)
            });
          };
          xhr.onerror = () => reject(new Error('XHR error'));
          xhr.ontimeout = () => reject(new Error('XHR timeout'));
          xhr.send(options.body ? JSON.stringify(options.body) : null);
        } catch (e) {
          reject(new Error(`XHR failed: ${e.message}`));
        }
      });
    } else {
      throw new Error('Método não suportado: ' + method);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      data = {};
    }

    if (!response.ok) {
      throw new Error((data && data.error) ? data.error : `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    if (error.message.includes('401') || error.message.includes('Token')) {
      API_CONFIG.ready = false;
      API_CONFIG.token = null;
      throw new Error('Sessão expirada. Faça login novamente.');
    }
    throw error;
  }
}

// ========== FUNÇÕES DA API ==========

async function apiLogin(username, password) {
  const body = { username, password };
  
  if (!API_CONFIG.method) {
    API_CONFIG.method = 'fetch_post';
  }

  try {
    let response;
    const url = API_CONFIG.baseUrl + '/api/auth/login';

    if (API_CONFIG.method.startsWith('fetch')) {
      response = await testFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else if (API_CONFIG.method.startsWith('xhr')) {
      response = await new Promise((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          xhr.timeout = 10000;
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve({
                ok: true,
                status: xhr.status,
                json: () => Promise.resolve(JSON.parse(xhr.responseText)),
                text: () => Promise.resolve(xhr.responseText)
              });
            } else {
              resolve({
                ok: false,
                status: xhr.status,
                json: () => Promise.resolve(JSON.parse(xhr.responseText)),
                text: () => Promise.resolve(xhr.responseText)
              });
            }
          };
          xhr.onerror = () => reject(new Error('XHR error'));
          xhr.ontimeout = () => reject(new Error('XHR timeout'));
          xhr.send(JSON.stringify(body));
        } catch (e) {
          reject(new Error(`XHR failed: ${e.message}`));
        }
      });
    } else {
      response = await testFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    const result = await response.json();
    
    if (result.success && result.data && result.data.token) {
      API_CONFIG.token = result.data.token;
      API_CONFIG.ready = true;
      useApi = true;
      
      return { success: true, token: result.data.token };
    } else {
      return { success: false, error: result.error || 'Credenciais inválidas' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function normalizeApiPath(path = '') {
  return String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
}

function encodeApiPath(path = '') {
  return encodeURIComponent(normalizeApiPath(path));
}

async function apiListFolder(path = '') {
  const endpoint = path ? `/api/folders/${encodeApiPath(path)}` : '/api/folders/';
  return await apiRequest(endpoint);
}

async function apiCreateFolder(path) {
  return await apiRequest('/api/folders/', {
    method: 'POST',
    body: { path: path }
  });
}

async function apiDeleteFolder(path) {
  return await apiRequest(`/api/folders/${encodeApiPath(path)}`, {
    method: 'DELETE'
  });
}

async function apiReadFile(path) {
  return await apiRequest(`/api/files/${encodeApiPath(path)}`);
}

async function apiCreateFile(path, content) {
  return await apiRequest('/api/files/', {
    method: 'POST',
    body: { path: path, content: content }
  });
}

async function apiUpdateFile(path, content) {
  return await apiRequest(`/api/files/${encodeApiPath(path)}`, {
    method: 'PUT',
    body: { content: content }
  });
}

async function apiDeleteFile(path) {
  return await apiRequest(`/api/files/${encodeApiPath(path)}`, {
    method: 'DELETE'
  });
}

async function apiSearch(query) {
  return await apiRequest(`/api/search?q=${encodeURIComponent(query)}`);
}

async function apiMove(source, destination) {
  return await apiRequest('/api/files/move', {
    method: 'POST',
    body: { source, destination }
  });
}

async function apiCopy(source, destination) {
  return await apiRequest('/api/files/copy', {
    method: 'POST',
    body: { source, destination }
  });
}

async function apiGetInfo(path) {
  return await apiRequest(`/api/files/${encodeApiPath(path)}/info`);
}

// ========== SINCRONIZAÇÃO COM FILESYSTEM LOCAL ==========

async function syncFromApi() {
  if (!API_CONFIG.ready) return null;
  
  try {
    const result = await apiListFolder('');
    if (result.success && result.data) {
      // Constrói árvore de arquivos a partir da API
      const tree = { type: 'dir', children: {} };
      
      async function loadFolder(path) {
        const folderData = await apiListFolder(path.replace(/^\//, ''));
        if (folderData.success && folderData.data && folderData.data.items) {
          for (const item of folderData.data.items) {
            const parts = item.path.split('/').filter(p => p);
            let current = tree;
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              const isLast = i === parts.length - 1;
              
              if (isLast) {
                if (item.type === 'folder') {
                  current.children[part] = { type: 'dir', children: {} };
                  await loadFolder(item.path);
                } else {
                  current.children[part] = {
                    type: 'file',
                    content: '', // Será carregado sob demanda
                    name: item.name,
                    size: item.size,
                    apiPath: item.path
                  };
                }
              } else {
                if (!current.children[part]) {
                  current.children[part] = { type: 'dir', children: {} };
                }
                current = current.children[part];
              }
            }
          }
        }
      }
      
      await loadFolder('/');
      return tree;
    }
  } catch (e) {
    console.error('Sync error:', e);
  }
  return null;
}

async function loadFileContent(apiPath) {
  if (!API_CONFIG.ready) return null;
  
  try {
    const result = await apiReadFile(apiPath.replace(/^\//, ''));
    if (result.success && result.data) {
      return result.data.content || '';
    }
  } catch (e) {
    console.error('Load file error:', e);
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Exporta funções globais
window.API_CONFIG = API_CONFIG;
window.runConnectionTests = runConnectionTests;
window.apiLogin = apiLogin;
window.apiListFolder = apiListFolder;
window.apiCreateFolder = apiCreateFolder;
window.apiDeleteFolder = apiDeleteFolder;
window.apiReadFile = apiReadFile;
window.apiCreateFile = apiCreateFile;
window.apiUpdateFile = apiUpdateFile;
window.apiDeleteFile = apiDeleteFile;
window.apiSearch = apiSearch;
window.apiMove = apiMove;
window.apiCopy = apiCopy;
window.apiGetInfo = apiGetInfo;
window.syncFromApi = syncFromApi;
window.loadFileContent = loadFileContent;
window.useApi = false;