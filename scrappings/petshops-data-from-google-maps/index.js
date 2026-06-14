const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const ListSearchTerms = require('./src/ListSearchTerms');

const csvWriter = createCsvWriter({
    path: 'petshops_torno_de_sp.csv',
    header: [
        { id: 'title', title: 'NOME' },
        { id: 'address', title: 'ENDERECO' }, 
        { id: 'phone', title: 'CONTATO' },
        { id: 'website_lista', title: 'SITE_LISTA' },
        { id: 'website_modal', title: 'SITE_MODAL' }
    ],
    append: false
});

const searchTerms = new ListSearchTerms();

const SEARCH_TERMS = searchTerms.toArray();


const IGNORED_CHAINS = ['cobasi', 'petz', 'patlando', 'petlove'];

(async () => {
    const browser = await chromium.launch({ 
        headless: false,
        executablePath: '/usr/bin/chromium-browser' 
    });

    const page = await browser.newPage();
    const allResults = [];
    const seenPlaces = new Set();

    for (const query of SEARCH_TERMS) {
        console.log(`\nIniciando busca por: "${query}"...`);
        
        const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        await page.goto(url);
        
        try {
            await page.waitForSelector('[role="feed"]', { timeout: 10000 });
        } catch (e) {
            console.log(`Não foi possível carregar o feed para esta região. Pulando...`);
            continue;
        }

        // --- LÓGICA DE SCROLL ---
        let isEnd = false;
        const startTime = Date.now();
        const TWO_MINUTES_MS = 6 * 60 * 1000; 
        let lastHeight = 0;
        let noChangeCount = 0;

        while (!isEnd) {
            if (Date.now() - startTime > TWO_MINUTES_MS) {
                console.log(`[Aviso] Tempo limite de 2 minutos atingido.`);
                break; 
            }

            const currentHeight = await page.evaluate(() => {
                const feed = document.querySelector('[role="feed"]');
                if (feed) {
                    feed.scrollBy(0, 10000);
                    return feed.scrollHeight;
                }
                return 0;
            });

            if (currentHeight === lastHeight) {
                noChangeCount++;
                if (noChangeCount >= 5) break;
            } else {
                noChangeCount = 0;
                lastHeight = currentHeight;
            }

            await page.waitForTimeout(1500); 

            const textContent = await page.content();
            if (textContent.includes("Você chegou ao final da lista")) {
                isEnd = true;
            }
        }

        // --- EXTRAÇÃO SEM DEPENDER DE CLASSES RANDÔMICAS ---
        // Buscamos diretamente por links que contenham "/maps/place/" na URL dentro do feed
        const linksData = await page.evaluate(() => {
            const feed = document.querySelector('[role="feed"]');
            if (!feed) return [];
            
            const anchors = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));
            return anchors.map(a => ({
                title: a.getAttribute('aria-label') || '',
                detailUrl: a.getAttribute('href') || ''
            }));
        });

        console.log(`Total de potenciais locais encontrados: ${linksData.length}. Iniciando cliques...`);

        let regionCount = 0;

        for (const item of linksData) {
            // PAUSA FIXA RANDÔMICA POR ITEM: de 0.20 a 0.40 segundos (200ms a 400ms)
            const itemWait = Math.floor(Math.random() * (400 - 200 + 1)) + 200;
            await page.waitForTimeout(itemWait);

            if (!item.title || !item.detailUrl || seenPlaces.has(item.detailUrl)) continue;

            const lowerTitle = item.title.toLowerCase();
            const isBigChain = IGNORED_CHAINS.some(chain => lowerTitle.includes(chain));
            if (isBigChain) continue;

            seenPlaces.add(item.detailUrl);
            console.log(`Interagindo com: ${item.title}`);

            let siteModal = 'Não informado';
            let addressModal = 'Não informado';
            let phone = 'Não informado';

            try {
                // Em vez de clicar no elemento da lista que pode sumir, navegamos direto na URL de detalhes estável
                const pageWait = Math.floor(Math.random() * (1000 - 700 + 1)) + 700;
                await page.waitForTimeout(pageWait);
                
                await page.goto(item.detailUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                
                await page.waitForTimeout(pageWait);

                // Extração do Site no painel de detalhes
                const websiteAnchor = await page.$('a[data-tooltip="Abrir website"]');
                if (websiteAnchor) {
                    const href = await websiteAnchor.getAttribute('href');
                    if (href) siteModal = href;
                }

                // Extração do Endereço baseado no botão de copiar
                const addressButton = await page.$('button[data-tooltip="Copiar endereço"]');
                if (addressButton) {
                    const ariaLabel = await addressButton.getAttribute('aria-label');
                    if (ariaLabel) addressModal = ariaLabel.replace(/^Endereço:\s*/i, '');
                }

                // Extração do Telefone baseado no botão de copiar telefone
                const phoneButton = await page.$('button[data-tooltip="Copiar número de telefone"]');
                if (phoneButton) {
                    const ariaLabel = await phoneButton.getAttribute('aria-label');
                    if (ariaLabel) phone = ariaLabel.replace(/^Telefone:\s*/i, '');
                }

            } catch (err) {
                console.log(`[Aviso] Falha ao carregar ou extrair dados de "${item.title}". Pulando...`);
            }

            allResults.push({
                title: item.title,
                address: addressModal,
                phone: phone,
                website_lista: 'N/A (Ignorado por segurança)',
                website_modal: siteModal
            });
            regionCount++;
        }
        
        console.log(`Adicionados ${regionCount} novos petshops nesta região. Total acumulado: ${allResults.length}`);
    }

    if (allResults.length > 0) {
        await csvWriter.writeRecords(allResults);
        console.log('\n Prontinho! Arquivo "petshops_sp.csv" gerado com sucesso.');
    } else {
        console.log('\n Nenhum resultado encontrado.');
    }

    await browser.close();
})();