const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const commandLineArgs = require('command-line-args');

const optionDefinitions = [
    { name: 'targets', type: String, defaultOption: true, description: 'Arquivo de targets (em config/)' },
    { name: 'message', type: Number, description: 'Índice da mensagem (0-based)' }
];

const args = commandLineArgs(optionDefinitions);

if (!args.targets) {
    console.error('❌ Parâmetro --targets é obrigatório.');
    process.exit(1);
}

if (args.message === undefined) {
    console.error('❌ Parâmetro --message é obrigatório.');
    process.exit(1);
}

const choicedMessage = args.message;

const configDir = path.join(__dirname, 'config');

const messagesPath = path.join(configDir, 'messages.json');
const targetsPath = path.join(configDir, args.targets);

const resultadoPath = path.join(configDir, `resultado_disparo_${Date.now()}.json`);

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



const messages = loadJsonFile(messagesPath, 'messages.json');
const targets = loadJsonFile(targetsPath, 'targets_numbers.json');

const config = {
    messages,
    targets
};


const listaDeContatos = config.targets.list || [];
const mensagem = config.messages.list[choicedMessage].message ? 
                        config.messages.list[choicedMessage].message : 
                        '';

if (listaDeContatos.length === 0) {
    console.log("⚠️ Nenhum número cadastrado na lista ('list').");
    process.exit(0);
}

if (!mensagem) {
    console.log("⚠️ Nenhuma mensagem configurada em 'messages.messageToMassive'.");
    process.exit(0);
}

// Array para armazenar o resultado final de cada item
const relatorioFinal = [];

// Inicialização do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth()
});

// --- FUNÇÃO DE RESOLUÇÃO DO FORMATO DO BRASIL ---
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

function randIntervalInt(minValue, maxValue){
    return Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
}

// Evento para renderizar o QR Code no terminal
client.on('qr', (qr) => {
    console.log('Escaneie o QR Code abaixo com seu WhatsApp para autenticar:');
    qrcode.generate(qr, { small: true });
});

// Evento disparado quando o WhatsApp está conectado e pronto
client.on('ready', async () => {
    console.log('✅ Conectado com sucesso! Iniciando os disparos...\n');

    for (const item of listaDeContatos) {
        const numero = item.number;

        // Clona o objeto original do item para reaproveitar todas as suas propriedades existentes
        const resultadoItem = { ...item };

        if (!numero) {
            console.log("⏩ Ignorando registro que não possui o campo 'number'.");
            resultadoItem.hasFail = true;
            resultadoItem.errorMessage = "Campo 'number' ausente ou vazio no objeto JSON.";
            relatorioFinal.push(resultadoItem);
            continue;
        }

        try {
            console.log(`Analisando: ${numero}...`);
            const chatId = await encontrarChatIdValido(client, numero);

            if (chatId) {
                console.log("enviando para: "+numero);
                await client.sendMessage(chatId, mensagem);
                console.log(`✅ Mensagem enviada para: ${numero}`);

                resultadoItem.hasFail = false;
                resultadoItem.errorMessage = "";
            } else {
                console.log(`❌ Número inválido no WhatsApp: ${numero}`);
                resultadoItem.hasFail = true;
                resultadoItem.errorMessage = "O número não está registrado em nenhuma conta de WhatsApp ativa.";
            }
        } catch (error) {
            console.error(`💥 Erro crítico ao enviar para ${numero}:`, error.message);
            resultadoItem.hasFail = true;
            resultadoItem.errorMessage = `Erro interno no envio: ${error.message}`;
        }

        relatorioFinal.push(resultadoItem);

        const choicedInterval = randIntervalInt(9500, 26000);

        await new Promise(resolve => setTimeout(resolve, choicedInterval));
        console.log("intervalo de : "+choicedInterval);
    }

    console.log('\n=========================================');
    console.log('🏁 Processo finalizado! Gravando relatório...');
    
    try {
        // Grava o novo JSON com o resultado na pasta config
        fs.writeFileSync(resultadoPath, JSON.stringify(relatorioFinal, null, 2), 'utf8');
        console.log(`💾 Relatório salvo em: ${resultadoPath}`);
    } catch (err) {
        console.error('❌ Não foi possível salvar o arquivo de relatório:', err.message);
    }

    // Fecha o navegador e encerra o script de forma limpa
    await client.destroy();
    console.log('Disparador encerrado.');
});

client.initialize();