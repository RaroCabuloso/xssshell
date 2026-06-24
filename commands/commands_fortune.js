// Comando: fortune
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
ctx.whtml(`<span style="color:#ffcc44">🥠 ${ctx.esc(random)}</span>\n`);