// Comandos modulares do Sharp Shell
const COMMAND_FILES = [
  {
    name: "commands/hello.js",
    content: `// Comando: hello
// Uso: hello [nome]
// Descrição: Dá as boas-vindas

ctx.w(\`Olá, \${ctx.args[0] || "mundo"}!\\n\`);
ctx.w(\`Diretório atual: \${ctx.currentDir}\\n\`);`
  },
  {
    name: "commands/neofetch.js",
    content: `// Comando: neofetch
// Uso: neofetch
// Descrição: Mostra informações do sistema

ctx.whtml(\`
<span style="color:#00ccff">
     ,dPYb,              
     IP'\\\`Yb              
     I8  8I              
     I8  8'              
     I8 dP  gg          
     I8dP   88          
     I8P    88          
   ,d8b,_ ,88,_,dPYb,  
   PI8"8888P""Y8"8   8  
   I8 \\\`8,      ,8I8   8  
    \\\`8,  \\\`8,  ,8' I8  ,8P
     "Yb, \\\`YbdP'  \\\`Y,dP' 
</span>

<span style="color:#00ccff">OS:</span> Sharp Shell v0.9
<span style="color:#00ccff">Host:</span> \${ctx.HOST}
<span style="color:#00ccff">Kernel:</span> JavaScript \${navigator.userAgent.split('Chrome/')[1]?.split(' ')[0] || 'unknown'}
<span style="color:#00ccff">Shell:</span> sharp 0.9.0
<span style="color:#00ccff">User:</span> \${ctx.USER}
<span style="color:#00ccff">Dir:</span> \${ctx.currentDir}
\`);`
  },
  {
    name: "commands/calc.js",
    content: `// Comando: calc
// Uso: calc [expressão matemática]
// Descrição: Calculadora simples

try {
  const expression = ctx.args.join(" ");
  if (!expression) {
    ctx.werr("calc: expressão necessária\\n");
    ctx.w("Exemplo: calc 2 + 2\\n");
    return;
  }
  
  // Avalia a expressão matemática de forma segura
  const result = Function('"use strict"; return (' + expression + ')')();
  ctx.w(\`Resultado: \${result}\\n\`);
} catch (e) {
  ctx.werr(\`calc: expressão inválida: \${e.message}\\n\`);
}`
  },
  {
    name: "commands/fortune.js",
    content: `// Comando: fortune
// Uso: fortune
// Descrição: Mostra uma mensagem aleatória

const fortunes = [
  "A vida é curta, use JavaScript.",
  "Não existe caminho para a paz, a paz é o caminho.",
  "O conhecimento é a única coisa que ninguém pode tirar de você.",
  "Se você pode sonhar, você pode codar.",
  "A persistência realiza o impossível.",
  "Bug não é defeito, é feature não documentada.",
  "Funciona na minha máquina.",
  "O melhor código é aquele que você não precisa escrever.",
  "Primeiro faça funcionar, depois faça direito, depois faça rápido.",
  "Em programação, o copiar e colar é uma forma de arte."
];

const random = fortunes[Math.floor(Math.random() * fortunes.length)];
ctx.whtml(\`<span style="color:#ffcc44">🥠 \${ctx.esc(random)}</span>\\n\`);`
  },
  {
    name: "commands/sysinfo.js",
    content: `// Comando: sysinfo
// Uso: sysinfo
// Descrição: Informações detalhadas do sistema

ctx.whtml(\`
<span style="color:#00ccff">━━━━━ System Information ━━━━━</span>

<span style="color:#88aaff">📱 Navegador:</span>
  Plataforma: \${navigator.platform}
  User Agent: \${navigator.userAgent.substring(0, 100)}...
  Idioma: \${navigator.language}
  Online: \${navigator.onLine ? "✅ Sim" : "❌ Não"}

<span style="color:#88aaff">💾 Armazenamento:</span>
  Cookies: \${navigator.cookieEnabled ? "✅ Habilitado" : "❌ Desabilitado"}
  localStorage: \${typeof localStorage !== 'undefined' ? "✅ Disponível" : "❌ Indisponível"}

<span style="color:#88aaff">🖥️ Tela:</span>
  Resolução: \${screen.width}x\${screen.height}
  Profundidade: \${screen.colorDepth}-bit

<span style="color:#88aaff">📁 Sistema de Arquivos:</span>
  Arquivos totais: \${ctx.FILES.length}
  Diretório atual: \${ctx.currentDir}

<span style="color:#555">━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>
\`);`
  }
];