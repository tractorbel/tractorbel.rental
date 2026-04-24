// Script de teste para verificar problemas nos gráficos
console.log('Testando indicadores-resultado.html...');

// Verificar se Chart.js está carregado
if (typeof Chart === 'undefined') {
  console.error('Chart.js não está carregado!');
} else {
  console.log('Chart.js carregado com sucesso');
}

// Verificar se XLSX está carregado
if (typeof XLSX === 'undefined') {
  console.error('XLSX não está carregado!');
} else {
  console.log('XLSX carregado com sucesso');
}

// Verificar funções principais
const funcoesParaTestar = [
  'destruirGraficos',
  'criarGraficoBarra',
  'gerarGraficos',
  'gerarRelatorio',
  'filtrarDados',
  'calcularTotais'
];

funcoesParaTestar.forEach(funcName => {
  if (typeof window[funcName] === 'function') {
    console.log(`✅ Função ${funcName} existe`);
  } else {
    console.error(`❌ Função ${funcName} não encontrada`);
  }
});

console.log('Teste concluído');