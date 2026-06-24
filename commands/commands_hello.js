// Comando: hello
// Uso: hello [nome]
// Descrição: Dá as boas-vindas

ctx.w(`Olá, ${ctx.args[0] || "mundo"}!\n`);
ctx.w(`Diretório atual: ${ctx.currentDir}\n`);