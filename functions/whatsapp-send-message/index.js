const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const commandLineArgs = require('command-line-args');

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO DE PARÂMETROS
// ═══════════════════════════════════════════════════════════
const optionDefinitions = [
    { name: 'targets', type: String, defaultOption: true, description: 'Arquivo de targets (em config/)' },
    { name: 'message', type: Number, description: 'Índice da mensagem (0-based)' },
    { name: 'delay', type: Number, description: 'Delay base entre mensagens (ms)', defaultValue: 15000 },
    { name: 'batch', type: Number, description: 'Mensagens por lote', defaultValue: 20 },
    { name: 'pause', type: Number, description: 'Pausa entre lotes (minutos)', defaultValue: 10 },
    { name: 'start', type: Number, description: 'Índice inicial (para retomar)', defaultValue: 0 }
];

const args = commandLineArgs(optionDefinitions);

// ═══════════════════════════════════════════════════════════
// VALIDAÇÃO DOS PARÂMETROS
// ═══════════════════════════════════════════════════════════
if (!args.targets) {
    console.error('❌ Parâmetro --targets é obrigatório.');
    process.exit(1);
}

if (args.message === undefined) {
    console.error('❌ Parâmetro --message é obrigatório.');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// CARREGAMENTO DOS DADOS
// ═══════════════════════════════════════════════════════════
const choicedMessage = args.message;
const configDir = path.join(__dirname, 'config');
const messagesPath = path.join(configDir, 'messages.json');
const targetsPath = path.join(configDir, args.targets);
const resultadoPath = path.join(configDir, `resultado_disparo_${Date.now()}.json`);

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════
const loadJsonFile = (filePath, fileName) => {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Arquivo ${fileName} não encontrado em: ${filePath}`);
        }
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error(`❌ Erro ao ler o arquivo ${fileName}:`, error.message);
        process.exit(1);
    }
};

const randIntervalInt = (minValue, maxValue) => {
    return Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// CARREGAR MENSAGENS E TARGETS
// ═══════════════════════════════════════════════════════════
const messages = loadJsonFile(messagesPath, 'messages.json');
const targets = loadJsonFile(targetsPath, 'targets_numbers.json');

const listaDeContatos = targets.list || [];
const mensagem = messages.list[choicedMessage]?.message || '';

if (listaDeContatos.length === 0) {
    console.log("⚠️ Nenhum número cadastrado na lista ('list').");
    process.exit(0);
}

if (!mensagem) {
    console.log("⚠️ Nenhuma mensagem configurada no índice informado.");
    process.exit(0);
}

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    DISPARO DE MENSAGENS                      ║
╚═══════════════════════════════════════════════════════════════╝
📝 Total de contatos: ${listaDeContatos.length}
📝 Mensagem: "${mensagem.substring(0, 50)}..."
⏱️  Delay base: ${args.delay}ms
📦 Tamanho do lote: ${args.batch}
⏸️  Pausa entre lotes: ${args.pause} minutos
📍 Iniciando do índice: ${args.start}
`);

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PARA ENCONTRAR CHAT ID
// ═══════════════════════════════════════════════════════════
async function encontrarChatIdValido(client, numeroBruto) {
    let apenasNumeros = String(numeroBruto).replace(/\D/g, '');
    
    if (!apenasNumeros.startsWith('55')) {
        apenasNumeros = '55' + apenasNumeros;
    }
    
    const idComNove = `${apenasNumeros}@c.us`;
    const existeComNove = await client.isRegisteredUser(idComNove);
    if (existeComNove) return idComNove;
    
    if (apenasNumeros.length === 13) {
        const idSemNove = `${apenasNumeros.slice(0, 4)}${apenasNumeros.slice(5)}@c.us`;
        const existeSemNove = await client.isRegisteredUser(idSemNove);
        if (existeSemNove) return idSemNove;
    }
    
    return null;
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PARA OFUSCAR A MENSAGEM (EVITAR DETECÇÃO)
// ═══════════════════════════════════════════════════════════
const ofuscarMensagem = (texto, nome = '') => {
    let mensagemOfuscada = texto;
    
    // ⭐ Adicionar pequenas variações para parecer humano
    const variacoes = [
        ' 😊', ' 👍', ' ✨', ' 🙌', ' 👋', ' 😃', ' 🌟', ' 💪', ' 🎯', ' 📌'
    ];
    
    // ⭐ 30% de chance de adicionar um emoji aleatório
    if (Math.random() < 0.3) {
        const emoji = variacoes[Math.floor(Math.random() * variacoes.length)];
        mensagemOfuscada += emoji;
    }
    
    // ⭐ 20% de chance de adicionar um espaço extra ou quebra de linha
    if (Math.random() < 0.2) {
        mensagemOfuscada = mensagemOfuscada.replace(/\. /g, '.  ');
    }
    
    // ⭐ Se tiver nome, adicionar no início (personalização)
    if (nome && Math.random() < 0.4) {
        mensagemOfuscada = `Olá ${nome}! ` + mensagemOfuscada;
    }
    
    return mensagemOfuscada;
};

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PARA VERIFICAR SE FOI BLOQUEADO
// ═══════════════════════════════════════════════════════════
async function verificarBloqueio(client) {
    try {
        const status = await client.getState();
        return status === 'CONFLICT' || status === 'UNPAIRED';
    } catch (error) {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════
const relatorioFinal = [];
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

// ═══════════════════════════════════════════════════════════
// EVENTOS DO CLIENT
// ═══════════════════════════════════════════════════════════
client.on('qr', (qr) => {
    console.log('🔑 Escaneie o QR Code abaixo com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Conectado com sucesso! Iniciando os disparos...\n');
    
    let enviados = 0;
    let falhas = 0;
    let bloqueios = 0;
    const total = listaDeContatos.length;
    const startIndex = args.start || 0;
    
    // ⭐ Pular contatos já processados
    const contatosParaProcessar = listaDeContatos.slice(startIndex);
    
    // ⭐ Processar em lotes
    for (let i = 0; i < contatosParaProcessar.length; i += args.batch) {
        const batch = contatosParaProcessar.slice(i, i + args.batch);
        const batchNumber = Math.floor(i / args.batch) + 1;
        const totalBatches = Math.ceil(contatosParaProcessar.length / args.batch);
        
        console.log(`\n📦 Processando lote ${batchNumber}/${totalBatches} (${batch.length} contatos)...`);
        
        // ⭐ Processar cada contato do lote
        for (let j = 0; j < batch.length; j++) {
            const item = batch[j];
            const globalIndex = startIndex + i + j;
            const numero = item.number;
            const nome = item.name || item.name || '';
            
            // ⭐ Clonar o item original
            const resultadoItem = { 
                ...item,
                globalIndex,
                timestamp: new Date().toISOString()
            };
            
            console.log(`\n📱 [${globalIndex + 1}/${total}] Processando: ${numero}...`);
            
            // ⭐ Verificar se foi bloqueado antes de enviar
            if (await verificarBloqueio(client)) {
                console.log('🚫 WhatsApp detectou comportamento suspeito!');
                console.log('⏳ Pausando por 30 minutos...');
                await sleep(30 * 60 * 1000);
                bloqueios++;
            }
            
            try {
                const chatId = await encontrarChatIdValido(client, numero);
                
                if (chatId) {
                    // ⭐ Ofuscar a mensagem
                    const mensagemOfuscada = ofuscarMensagem(mensagem, nome);
                    
                    // ⭐ Enviar com delay aleatório (digitação simulada)
                    console.log(`✉️ Enviando para: ${numero}`);
                    
                    // ⭐ Simular digitação
                    await client.sendMessage(chatId, '🔜');
                    await sleep(randIntervalInt(1500, 3500));
                    
                    // ⭐ Enviar mensagem real
                    await client.sendMessage(chatId, mensagemOfuscada);
                    
                    console.log(`✅ Mensagem enviada para: ${numero}`);
                    resultadoItem.hasFail = false;
                    resultadoItem.errorMessage = '';
                    enviados++;
                } else {
                    console.log(`❌ Número inválido no WhatsApp: ${numero}`);
                    resultadoItem.hasFail = true;
                    resultadoItem.errorMessage = "Número não registrado no WhatsApp";
                    falhas++;
                }
            } catch (error) {
                console.error(`💥 Erro ao enviar para ${numero}:`, error.message);
                resultadoItem.hasFail = true;
                resultadoItem.errorMessage = `Erro: ${error.message}`;
                falhas++;
                
                // ⭐ Se erro for de spam, pausar mais tempo
                if (error.message.includes('spam') || error.message.includes('blocked')) {
                    console.log('🚫 Possível bloqueio detectado! Pausando por 15 minutos...');
                    await sleep(15 * 60 * 1000);
                }
            }
            
            relatorioFinal.push(resultadoItem);
            
            // ⭐ Delay VARIÁVEL entre mensagens (MAIS IMPORTANTE!)
            const delayBase = args.delay || 15000;
            const delayVariacao = randIntervalInt(
                Math.floor(delayBase * 0.7), 
                Math.floor(delayBase * 1.5)
            );
            
            console.log(`⏱️ Aguardando ${delayVariacao}ms antes da próxima...`);
            await sleep(delayVariacao);
        }
        
        // ⭐ Pausa ENTRE lotes
        if (i + args.batch < contatosParaProcessar.length) {
            const pausaMinutos = args.pause || 10;
            const pausaVariacao = randIntervalInt(
                Math.floor(pausaMinutos * 0.8 * 60 * 1000),
                Math.floor(pausaMinutos * 1.2 * 60 * 1000)
            );
            
            console.log(`\n⏸️ Pausa entre lotes: ${Math.round(pausaVariacao / 60000)} minutos...`);
            console.log(`📊 Progresso: ${enviados + falhas}/${total} (${Math.round((enviados + falhas) / total * 100)}%)`);
            await sleep(pausaVariacao);
        }
    }
    
    // ═══════════════════════════════════════════════════════════
    // FINALIZAR
    // ═══════════════════════════════════════════════════════════
    console.log('\n=========================================');
    console.log('🏁 Processo finalizado!');
    console.log(`✅ Enviados: ${enviados}`);
    console.log(`❌ Falhas: ${falhas}`);
    console.log(`🚫 Bloqueios: ${bloqueios}`);
    console.log(`📊 Total processados: ${enviados + falhas}/${total}`);
    
    try {
        fs.writeFileSync(resultadoPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            resumo: {
                total: total,
                enviados: enviados,
                falhas: falhas,
                bloqueios: bloqueios,
                startIndex: startIndex
            },
            detalhes: relatorioFinal
        }, null, 2), 'utf8');
        console.log(`💾 Relatório salvo em: ${resultadoPath}`);
    } catch (err) {
        console.error('❌ Não foi possível salvar o arquivo de relatório:', err.message);
    }
    
    await client.destroy();
    console.log('👋 Disparador encerrado.');
});

// ═══════════════════════════════════════════════════════════
// INICIAR
// ═══════════════════════════════════════════════════════════
client.initialize();