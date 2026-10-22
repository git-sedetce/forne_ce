
'use strict';

const TAVILY_URL = 'https://api.tavily.com/search';

async function testar() {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY não configurada.');
  }

  const consultas = [
    '"BUDEGA DAS MARIAS" Ceará',
    '"34202603000198"',
    '"COSTA MENDES DELICATESSEN" Ceará'
  ];

  for (const query of consultas) {
    console.log('\n================================');
    console.log('CONSULTA:', query);
    console.log('================================');

    const inicio = Date.now();

    const resposta = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: 10,
        include_answer: false,
        include_raw_content: false
      }),
      signal: AbortSignal.timeout(20000)
    });

    console.log('HTTP:', resposta.status);

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error('ERRO DA API:', dados);
      continue;
    }

    console.log('Request ID:', dados.request_id);
    console.log('Tempo (ms):', Date.now() - inicio);
    console.log(
      'Resultados:',
      dados.results?.length || 0
    );

    for (const [index, item] of
      (dados.results || []).entries()) {

      console.log(`\nResultado ${index + 1}`);
      console.log('Título:', item.title);
      console.log('URL:', item.url);
      console.log('Score:', item.score);
      console.log(
        'Descrição:',
        item.content?.slice(0, 350)
      );
    }
  }
}

testar().catch(erro => {
  console.error('Falha no teste:', erro.message);
  process.exitCode = 1;
});
