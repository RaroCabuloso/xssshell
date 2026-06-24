// Comando: sysinfo
// Uso: sysinfo
// Descrição: Informações detalhadas do sistema

ctx.whtml(`
<span style="color:#00ccff">━━━━━ System Information ━━━━━</span>

<span style="color:#88aaff">📱 Navegador:</span>
  Plataforma: ${navigator.platform}
  User Agent: ${navigator.userAgent.substring(0, 100)}...
  Idioma: ${navigator.language}
  Online: ${navigator.onLine ? "✅ Sim" : "❌ Não"}

<span style="color:#88aaff">💾 Armazenamento:</span>
  Cookies: ${navigator.cookieEnabled ? "✅ Habilitado" : "❌ Desabilitado"}
  localStorage: ${typeof localStorage !== 'undefined' ? "✅ Disponível" : "❌ Indisponível"}

<span style="color:#88aaff">🖥️ Tela:</span>
  Resolução: ${screen.width}x${screen.height}
  Profundidade: ${screen.colorDepth}-bit

<span style="color:#88aaff">📁 Sistema de Arquivos:</span>
  Arquivos totais: ${ctx.FILES.length}
  Diretório atual: ${ctx.currentDir}

<span style="color:#555">━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>
`);