const readline = require('readline');
const fs = require('fs');

const csvFileName = 'petshops-torno-sp-canary.csv';
const jsonFileName = 'leads.json';

async function converterCsvParaJson() {
  const leads = [];
  let idCounter = 1;

  // Cria interface de leitura linha a linha para economizar memória
  const fileStream = fs.createReadStream(csvFileName);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue; // Pula o cabeçalho (NOME, ENDERECO, etc.)
    }

    const columns = parseCsvLine(line);

    if (columns.length >= 5) {
      const numberOnly = columns[2].replace(/\D/g, '');

      leads.push({
        id_lead: idCounter++,
        name: columns[0],
        number: numberOnly,
        address: columns[1].replace(/"/g, ''), // Remove aspas extras do endereço
        site: columns[4] || "Não informado"
      });
    }
  }

  const finalJson = { list: leads };

  // Grava o arquivo JSON final
  fs.writeFileSync(jsonFileName, JSON.stringify(finalJson, null, 2), 'utf8');
  console.log(`Sucesso! ${leads.length} registros convertidos para ${jsonFileName}`);
}

// Helper para separar colunas respeitando aspas no CSV
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

converterCsvParaJson();