// Comando: neofetch
// Uso: neofetch
// Descrição: Mostra informações do sistema

const ascii = `
<span style="color:#00ccff">
     ,dPYb,              
     IP'\`Yb              
     I8  8I              
     I8  8'              
     I8 dP  gg          
     I8dP   88          
     I8P    88          
   ,d8b,_ ,88,_,dPYb,  
   PI8\"8888P\"\"Y8\"8   8  
   I8 \`8,      ,8I8   8  
    \`8,  \`8,  ,8' I8  ,8P
     \"Yb, \`YbdP'  \`Y,dP' 
</span>

<span style="color:#00ccff">OS:</span> Sharp Shell v0.9
<span style="color:#00ccff">Host:</span> ${ctx.HOST}
<span style="color:#00ccff">Kernel:</span> JavaScript ${navigator.userAgent.split('Chrome/')[1]?.split(' ')[0] || 'unknown'}
<span style="color:#00ccff">Shell:</span> sharp 0.9.0
<span style="color:#00ccff">User:</span> ${ctx.USER}
<span style="color:#00ccff">Dir:</span> ${ctx.currentDir}
`;

ctx.whtml(ascii);