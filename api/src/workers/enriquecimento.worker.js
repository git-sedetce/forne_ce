
'use strict';

const { QueryTypes } = require('sequelize');
const database = require('../models');

const EnriquecimentoService = require(
  '../services/enriquecimento.service'
);

const sequelize = database.sequelize;

const INTERVALO_MS = Number(
  process.env.ENRIQUECIMENTO_INTERVALO_MS || 10000
);

const INTERVALO_ATUALIZACAO_MS = 24 * 60 * 60 * 1000;

const TIMEOUT_TAREFA_MINUTOS = 15;

let executando = false;
let encerrando = false;

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function recuperarTarefasInterrompidas() {
  await sequelize.query(`
    UPDATE public.empresas_enriquecimento_fila
    SET
      status = CASE
        WHEN tentativas >= max_tentativas
        THEN 'ERRO'
        ELSE 'PENDENTE'
      END,
      executar_em = NOW() + INTERVAL '5 minutes',
      erro = 'Processamento interrompido ou expirado.'
    WHERE status = 'PROCESSANDO'
      AND iniciado_em <
        NOW() - (:minutos * INTERVAL '1 minute')
  `, {
    replacements: {
      minutos: TIMEOUT_TAREFA_MINUTOS
    }
  });
}

async function reivindicarTarefa() {
  return sequelize.transaction(async transaction => {
    const [tarefa] = await sequelize.query(`
      WITH proximo AS (
        SELECT id
        FROM public.empresas_enriquecimento_fila
        WHERE status = 'PENDENTE'
          AND executar_em <= NOW()
          AND tentativas < max_tentativas
        ORDER BY prioridade ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE public.empresas_enriquecimento_fila AS fila
      SET
        status = 'PROCESSANDO',
        tentativas = fila.tentativas + 1,
        iniciado_em = NOW(),
        erro = NULL
      FROM proximo
      WHERE fila.id = proximo.id
      RETURNING
        fila.id,
        fila.cnpj,
        fila.tentativas,
        fila.max_tentativas
    `, {
      type: QueryTypes.SELECT,
      transaction
    });

    return tarefa || null;
  });
}

async function concluirTarefa(tarefa) {
  await sequelize.query(`
    UPDATE public.empresas_enriquecimento_fila
    SET
      status = 'CONCLUIDO',
      concluido_em = NOW(),
      erro = NULL
    WHERE id = :id
      AND status = 'PROCESSANDO'
  `, {
    replacements: { id: tarefa.id }
  });
}

async function falharTarefa(tarefa, erro) {
  const mensagem = String(
    erro?.message || erro || 'Erro desconhecido'
  ).slice(0, 2000);

  const esgotouTentativas =
    tarefa.tentativas >= tarefa.max_tentativas;

  const minutosEspera = Math.min(
    60,
    5 * Math.pow(2, tarefa.tentativas - 1)
  );

  await sequelize.query(`
    UPDATE public.empresas_enriquecimento_fila
    SET
      status = :status,
      erro = :erro,
      executar_em =
        NOW() + (:minutos * INTERVAL '1 minute'),
      concluido_em =
        CASE WHEN :esgotou
          THEN NOW()
          ELSE NULL
        END
    WHERE id = :id
      AND status = 'PROCESSANDO'
  `, {
    replacements: {
      id: tarefa.id,
      status: esgotouTentativas ? 'ERRO' : 'PENDENTE',
      erro: mensagem,
      minutos: minutosEspera,
      esgotou: esgotouTentativas
    }
  });

  console.error(
    `[WORKER] Falha ${tarefa.cnpj}: ${mensagem}`
  );
}

async function processarProximaTarefa() {
  if (executando || encerrando) return;

  executando = true;

  try {
    const tarefa = await reivindicarTarefa();

    if (!tarefa) return;

    console.log(
      `[WORKER] Processando ${tarefa.cnpj} ` +
      `(tentativa ${tarefa.tentativas})`
    );

    try {
      await EnriquecimentoService.processar(tarefa.cnpj);

      await concluirTarefa(tarefa);

      console.log(
        `[WORKER] Concluído: ${tarefa.cnpj}`
      );

    } catch (erro) {
      await falharTarefa(tarefa, erro);
    }

  } catch (erro) {
    console.error(
      '[WORKER] Erro ao consultar fila:',
      erro
    );

  } finally {
    executando = false;
  }
}

async function agendarAtualizacoes() {
  const [resultado] = await sequelize.query(`
    WITH vencidos AS (
      SELECT cnpj
      FROM public.empresas_contatos_comerciais
      WHERE proxima_atualizacao <= NOW()
      ORDER BY proxima_atualizacao
      LIMIT 100
    ),
    inseridos AS (
      INSERT INTO public.empresas_enriquecimento_fila (
        cnpj,
        status,
        prioridade
      )
      SELECT cnpj, 'PENDENTE', 5
      FROM vencidos
      ON CONFLICT (cnpj)
      WHERE status IN ('PENDENTE', 'PROCESSANDO')
      DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*)::integer AS total
    FROM inseridos
  `, {
    type: QueryTypes.SELECT
  });

  console.log(
    `[WORKER] Atualizações agendadas: ${resultado.total}`
  );
}

async function iniciarWorker() {
  await sequelize.authenticate();

  console.log('[WORKER] Conexão PostgreSQL estabelecida.');

  await recuperarTarefasInterrompidas();
  await agendarAtualizacoes();

  console.log('[WORKER] Enriquecimento iniciado.');

  let ultimaAtualizacao = Date.now();

  while (!encerrando) {
    await processarProximaTarefa();

    if (
      Date.now() - ultimaAtualizacao >=
      INTERVALO_ATUALIZACAO_MS
    ) {
      try {
        await recuperarTarefasInterrompidas();
        await agendarAtualizacoes();
      } catch (erro) {
        console.error(
          '[WORKER] Erro na atualização periódica:',
          erro
        );
      }

      ultimaAtualizacao = Date.now();
    }

    if (!encerrando) {
      await aguardar(INTERVALO_MS);
    }
  }

  await sequelize.close();

  console.log('[WORKER] Encerrado.');
}

process.on('SIGTERM', () => {
  encerrando = true;
});

process.on('SIGINT', () => {
  encerrando = true;
});

iniciarWorker().catch(erro => {
  console.error('[WORKER] Erro fatal:', erro);
  process.exitCode = 1;
});
