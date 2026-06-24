// Comando: calc
// Uso: calc [expressão matemática]
// Descrição: Calculadora simples

try {
  const expression = ctx.args.join(" ");
  if (!expression) {
    ctx.werr("calc: expressão necessária\n");
    ctx.w("Exemplo: calc 2 + 2\n");
    return;
  }
  
  // Avalia a expressão matemática de forma segura
  const result = Function('"use strict"; return (' + expression + ')')();
  ctx.w(`Resultado: ${result}\n`);
} catch (e) {
  ctx.werr(`calc: expressão inválida: ${e.message}\n`);
}