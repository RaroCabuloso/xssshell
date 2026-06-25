// Configuração dos arquivos de dados do Sharp Shell
const DATA_FILES = [
  { 
    name: "ola.txt", 
    content: "Olá, mundo!" 
  },
  { 
    name: "scripts/teste.js", 
    content: "console.log('Hello');" 
  },
  { 
    name: "dados/config.json", 
    content: '{"key": "value"}' 
  },
  { 
    name: "scripts/runner-script.js", 
    content: `ctx.clear();
ctx.print('=== Script executável ===', '#ff66aa');
ctx.print('Digite algo no terminal para testar o input.', '#00ccff');
const nome = await input('Nome: ');
ctx.print('Olá, ' + nome + '!', '#88ff88');
ctx.print('Requisição de exemplo...', '#ffcc44');
const result = await ctx.request('https://jsonplaceholder.typicode.com/posts/1');
ctx.print(JSON.stringify(result, null, 2), '#ffcc44');
ctx.window('Runner Script', '<div style="color:#00ccff">Janela aberta pelo script executável.</div>');`
  }
];