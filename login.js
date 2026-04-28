import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js"; 
import { 
  getAuth, 
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// ------------------- CONFIGURAÇÃO FIREBASE -------------------
const firebaseConfig = {
  apiKey: "AIzaSyAAF5FLl8xawkivYCcjQGJyb2jo1_A1V7g",
  authDomain: "tractorbel-8ceb8.firebaseapp.com",
  projectId: "tractorbel-8ceb8",
  storageBucket: "tractorbel-8ceb8.firebasestorage.app",
  messagingSenderId: "720471893475",
  appId: "1:720471893475:web:e6eb1d64cae5f7aa27ecd6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ------------------- AUTENTICAÇÃO -------------------
function mostrarConteudo(user){
  const login = document.getElementById("login");
  const conteudo = document.getElementById("conteudo");
  if(!login || !conteudo) return; // Só executar se os elementos existirem
  
  if(user){
    login.style.display = "none";
    conteudo.style.display = "block";
  }else{
    login.style.display = "block";
    conteudo.style.display = "none";
  }
}

// Função para inicializar a página - mostrar conteúdo por padrão para evitar "piscar"
function inicializarPagina(){
  const login = document.getElementById("login");
  const conteudo = document.getElementById("conteudo");
  if(!login || !conteudo) return; // Só executar se os elementos existirem
  
  // Mostrar conteúdo por padrão para evitar "piscar" da tela de login
  login.style.display = "none";
  conteudo.style.display = "block";
}

window.login = function() {
  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;
  signInWithEmailAndPassword(auth, email, senha)
    .then(()=> mostrarConteudo(true))
    .catch(()=> alert("Usuário ou senha incorretos"));
};

window.logout = function() {
  signOut(auth);
};

// Só executar verificação de estado se os elementos existirem (página index.html)
if(document.getElementById("login") && document.getElementById("conteudo")) {
  // Inicializar mostrando conteúdo para evitar "piscar"
  inicializarPagina();
  
  // Verificar estado de autenticação
  onAuthStateChanged(auth, user => mostrarConteudo(user));
} else {
  // Para outras páginas, verificar se usuário está logado e redirecionar se não estiver
  onAuthStateChanged(auth, user => {
    if(!user) {
      window.location.href = "index.html";
    }
  });
}

// ------------------- VARIÁVEIS GLOBAIS -------------------
let dadosGlobais = [];
let graficos = [];

// ------------------- FUNÇÕES AUXILIARES -------------------
function converterNumero(valor){
    if(valor === null || valor === undefined || valor === "") return 0;
    if(typeof valor === "number") return valor;
    return parseFloat(valor.toString().replace(/\./g,'').replace(',','.')) || 0;
}

const dataInicio = document.getElementById("dataInicio");
const dataFim = document.getElementById("dataFim");

// ------------------- CARREGAR PLANILHA -------------------
window.carregarDados = function(){
    const input = document.getElementById('upload');
    const file = input.files[0];
    const status = document.getElementById("statusCarga");
    const btnCarregar = document.getElementById("btnCarregar");
    const btnRelatorio = document.getElementById("btnRelatorio");

    if(!file){ alert("Selecione um arquivo"); return; }

    btnCarregar.disabled = true;
    btnRelatorio.style.display = "none";
    status.innerText = "Carregando planilha...";

    const reader = new FileReader();
    reader.onload = function(event){
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type:'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet,{header:1});

        dadosGlobais = [];

        for(let i=1;i<json.length;i++){
            const l = json[i];
            let dataLinha = l[15];
            if(typeof dataLinha === "number"){
                dataLinha = new Date((dataLinha - 25569) * 86400 * 1000);
            } else {
                dataLinha = new Date(dataLinha);
            }

            if(!isNaN(dataLinha)){
                dataLinha.setHours(0,0,0,0);
                dadosGlobais.push({
                    filial: l[0],
                    patrimonio: l[1],
                    serie: l[2],
                    equipamento: l[3],
                    faturamento: converterNumero(l[7]),
                    manutencao: converterNumero(l[8]),
                    financiamento: converterNumero(l[9]),
                    impostos: converterNumero(l[10]),
                    tx: converterNumero(l[11]),
                    resultado: converterNumero(l[12]),
                    mau: converterNumero(l[13]),
                    cliente: l[14],
                    data: dataLinha
                });
            }
        }

        // Atualizar datas mínimas e máximas
        const datas = dadosGlobais.map(d=>d.data);
        const minData = new Date(Math.min(...datas));
        const maxData = new Date(Math.max(...datas));
        const formatar = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

        dataInicio.min = formatar(minData);
        dataInicio.max = formatar(maxData);
        dataFim.min = formatar(minData);
        dataFim.max = formatar(maxData);
        dataInicio.value = formatar(minData);
        dataFim.value = formatar(maxData);

        dataInicio.disabled = false;
        dataFim.disabled = false;

        atualizarFiltros();

        status.innerText = "Dados carregados ✔";
        btnRelatorio.style.display = "inline-block";
        btnCarregar.disabled = false;

        gerarRelatorio();
    };
    reader.readAsArrayBuffer(file);
};

// ------------------- FILTROS -------------------
function atualizarFiltros(){
    ["filtroFilial","filtroPatrimonio","filtroSerie","filtroEquipamento","filtroCliente"]
    .forEach(id=>{
        const select = document.getElementById(id);
        if(!select) return;
        select.innerHTML="";
        select.multiple = true;

        const campo = id.replace("filtro","").toLowerCase();
        const valores = [...new Set(dadosGlobais.map(d=>d[campo]).filter(Boolean))].sort();
        valores.forEach(v=>{
            const opt = document.createElement("option");
            opt.value=v; opt.text=v;
            select.appendChild(opt);
        });

        select.addEventListener("change", gerarRelatorio);
    });
}

function getMultiValues(id){
    const select = document.getElementById(id);
    if(!select) return [];
    return [...select.selectedOptions].map(o=>o.value);
}

// ------------------- RELATÓRIO -------------------
window.gerarRelatorio = function(){
    const dtIni = dataInicio.value ? new Date(dataInicio.value) : null;
    const dtFim = dataFim.value ? new Date(dataFim.value) : null;
    if(dtIni) dtIni.setHours(0,0,0,0);
    if(dtFim) dtFim.setHours(23,59,59,999);

    const filial = getMultiValues("filtroFilial");
    const patrimonio = getMultiValues("filtroPatrimonio");
    const serie = getMultiValues("filtroSerie");
    const equipamento = getMultiValues("filtroEquipamento");
    const cliente = getMultiValues("filtroCliente");

    const filtrado = dadosGlobais.filter(d=>
        (!dtIni || d.data>=dtIni) &&
        (!dtFim || d.data<=dtFim) &&
        (!filial.length || filial.includes(d.filial)) &&
        (!patrimonio.length || patrimonio.includes(d.patrimonio)) &&
        (!serie.length || serie.includes(d.serie)) &&
        (!equipamento.length || equipamento.includes(d.equipamento)) &&
        (!cliente.length || cliente.includes(d.cliente))
    );

    calcularTotais(filtrado);
    gerarGraficos(filtrado);
};

// ------------------- CARDS -------------------
function calcularTotais(dados){
    let fat=0, man=0, fin=0, imp=0, tx=0, res=0, mau=0;
    dados.forEach(d=>{
        fat+=d.faturamento; man+=d.manutencao; fin+=d.financiamento;
        imp+=d.impostos; tx+=d.tx; res+=d.resultado; mau+=d.mau;
    });

    document.getElementById("cardFat").innerText = fat.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    document.getElementById("cardMan").innerText = man.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    document.getElementById("cardRes").innerText = res.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    document.getElementById("cardFin").innerText = fin.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    document.getElementById("cardImp").innerText = imp.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    document.getElementById("cardTx").innerText = tx.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    document.getElementById("cardMau").innerText = mau.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

// ------------------- GRÁFICOS -------------------
function gerarGraficos(dados){
    graficos.forEach(g=>g.destroy());
    graficos=[];

    const fatEquip={}, fatCliente={}, manCliente={}, deficitCliente={};

    dados.forEach(d=>{
        fatEquip[d.equipamento]=(fatEquip[d.equipamento]||0)+d.faturamento;
        fatCliente[d.cliente]=(fatCliente[d.cliente]||0)+d.faturamento;
        manCliente[d.cliente]=(manCliente[d.cliente]||0)+d.manutencao;
        if(d.resultado<0) deficitCliente[d.cliente]=(deficitCliente[d.cliente]||0)+d.resultado;
    });

    graficos.push(new Chart(graficoEquipamento,{
        type:'bar',
        data:{labels:Object.keys(fatEquip),datasets:[{data:Object.values(fatEquip), backgroundColor:'blue'}]},
        options:{scales:{y:{beginAtZero:true}}, plugins:{legend:{display:false}}}
    }));

    graficos.push(new Chart(graficoCliente,{
        type:'pie',
        data:{labels:Object.keys(fatCliente),datasets:[{data:Object.values(fatCliente)}]}
    }));

    graficos.push(new Chart(graficoManutencao,{
        type:'pie',
        data:{labels:Object.keys(manCliente),datasets:[{data:Object.values(manCliente)}]}
    }));

    graficos.push(new Chart(graficoDeficit,{
        type:'bar',
        data:{labels:Object.keys(deficitCliente),datasets:[{data:Object.values(deficitCliente).map(v=>Math.abs(v)), backgroundColor:'red'}]},
        options:{
            indexAxis:'y',
            scales:{
                x:{beginAtZero:true,ticks:{callback: v => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}},
                y:{beginAtZero:true}
            },
            plugins:{
                legend:{display:false},
                tooltip:{callbacks:{label: ctx=>Object.values(deficitCliente)[ctx.dataIndex].toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}}
            }
        }
    }));
}

// ------------------- EVENTOS -------------------
dataInicio.addEventListener("change", gerarRelatorio);
dataFim.addEventListener("change", gerarRelatorio);
document.getElementById("btnCarregar").addEventListener("click", carregarDados);
document.getElementById("btnRelatorio").addEventListener("click", gerarRelatorio);

