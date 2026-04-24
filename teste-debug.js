// Monitoramento básico para detectar scroll infinito
let scrollCount = 0;
let lastScrollTop = 0;
let scrollMonitorActive = true;

const scrollMonitor = setInterval(() => {
  if (!scrollMonitorActive) return;

  const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
  if (Math.abs(currentScrollTop - lastScrollTop) > 10) {
    scrollCount++;
    console.warn(`🚨 Scroll detectado #${scrollCount}: ${lastScrollTop} → ${currentScrollTop}`);
    lastScrollTop = currentScrollTop;

    if (scrollCount > 3) {
      console.error('🚨 SCROLL INFINITO DETECTADO! Implemente correções adicionais.');
      scrollMonitorActive = false;
      clearInterval(scrollMonitor);
    }
  }
}, 1000);

// Parar monitoramento após 30 segundos
setTimeout(() => {
  scrollMonitorActive = false;
  clearInterval(scrollMonitor);
  console.log('🔍 Monitoramento de scroll finalizado');
}, 30000);

console.log('🔍 Monitoramento de scroll iniciado - carregue uma planilha para testar');