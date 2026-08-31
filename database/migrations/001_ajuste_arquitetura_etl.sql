-- =====================================================================
-- OBSERVATÓRIO EMPRESARIAL - RECEITA FEDERAL
-- MIGRAÇÃO 001
--
-- Adapta o banco existente para a nova arquitetura do ETL.
--
-- IMPORTANTE:
--   - Não apaga Empresas
--   - Não apaga Estabelecimentos
--   - Não apaga Sócios
--   - Não apaga Simples
--   - Preserva as cargas existentes
--
-- Competência histórica atualmente carregada:
--   2026-08
-- =====================================================================

BEGIN;


-- =====================================================================
-- 1. CARGAS
-- =====================================================================

ALTER TABLE public.cargas
ADD COLUMN IF NOT EXISTS registros_duplicados BIGINT NOT NULL DEFAULT 0;


-- Garante valores não nulos em contadores antigos.

UPDATE public.cargas
SET
    registros_lidos = COALESCE(registros_lidos, 0),
    registros_processados = COALESCE(registros_processados, 0),
    registros_inseridos = COALESCE(registros_inseridos, 0),
    registros_atualizados = COALESCE(registros_atualizados, 0),
    registros_duplicados = COALESCE(registros_duplicados, 0),
    registros_erro = COALESCE(registros_erro, 0);


-- =====================================================================
-- 2. PADRONIZAÇÃO DOS TIPOS DE CARGA
-- =====================================================================

UPDATE public.cargas
SET tipo_carga = 'ESTABELECIMENTOS'
WHERE UPPER(tipo_carga) IN (
    'ESTABELECIMENTO',
    'ESTABELECIMENTOS'
);


UPDATE public.cargas
SET tipo_carga = 'EMPRESAS'
WHERE UPPER(tipo_carga) = 'EMPRESAS';


UPDATE public.cargas
SET tipo_carga = 'SOCIOS'
WHERE UPPER(tipo_carga) IN (
    'SOCIO',
    'SOCIOS',
    'SÓCIO',
    'SÓCIOS'
);


UPDATE public.cargas
SET tipo_carga = 'SIMPLES'
WHERE UPPER(tipo_carga) = 'SIMPLES';


-- =====================================================================
-- 3. CNPJ CE
--
-- Estrutura atual:
--
--   cnpj_basico VARCHAR(8) PRIMARY KEY
--
-- Nova estrutura:
--
--   cnpj_basico
--   competencia
--   carga_id
--   created_at
--
-- A carga histórica existente foi feita para 2026-08.
-- Não inventamos um carga_id histórico, portanto ele ficará NULL.
-- =====================================================================

ALTER TABLE public.cnpj_ce
ADD COLUMN IF NOT EXISTS competencia VARCHAR(7);


ALTER TABLE public.cnpj_ce
ADD COLUMN IF NOT EXISTS carga_id BIGINT;


ALTER TABLE public.cnpj_ce
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP
DEFAULT CURRENT_TIMESTAMP;


-- Preenche a competência dos registros já existentes.

UPDATE public.cnpj_ce
SET competencia = '2026-08'
WHERE competencia IS NULL;


-- Depois do preenchimento podemos torná-la obrigatória.

ALTER TABLE public.cnpj_ce
ALTER COLUMN competencia SET NOT NULL;


-- =====================================================================
-- 4. FK CNPJ CE -> CARGAS
-- =====================================================================

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_cnpj_ce_carga'
          AND conrelid = 'public.cnpj_ce'::regclass
    ) THEN

        ALTER TABLE public.cnpj_ce
        ADD CONSTRAINT fk_cnpj_ce_carga
        FOREIGN KEY (carga_id)
        REFERENCES public.cargas(id);

    END IF;

END
$$;


-- =====================================================================
-- 5. ALTERAÇÃO DA CHAVE PRIMÁRIA DE CNPJ_CE
--
-- Antiga:
--   PRIMARY KEY (cnpj_basico)
--
-- Nova:
--   PRIMARY KEY (cnpj_basico, competencia)
-- =====================================================================

DO $$
DECLARE
    pk_name TEXT;
BEGIN

    SELECT conname
    INTO pk_name
    FROM pg_constraint
    WHERE conrelid = 'public.cnpj_ce'::regclass
      AND contype = 'p';

    IF pk_name IS NOT NULL THEN

        EXECUTE format(
            'ALTER TABLE public.cnpj_ce DROP CONSTRAINT %I',
            pk_name
        );

    END IF;

END
$$;


ALTER TABLE public.cnpj_ce
ADD CONSTRAINT pk_cnpj_ce
PRIMARY KEY (
    cnpj_basico,
    competencia
);


-- =====================================================================
-- 6. REMOVE ÍNDICE ANTIGO REDUNDANTE DO CNPJ CE
-- =====================================================================

DROP INDEX IF EXISTS public.idx_cnpj_ce;


-- =====================================================================
-- 7. SÓCIOS
--
-- A unicidade deve ficar no banco e não dentro do Python.
--
-- Removemos o índice criado pelo ETL antigo, caso exista.
-- =====================================================================

DROP INDEX IF EXISTS public.ux_socios_duplicidade;


-- Remove uma constraint anterior com o mesmo nome, caso exista.

ALTER TABLE public.socios
DROP CONSTRAINT IF EXISTS uk_socio_competencia;


-- =====================================================================
-- 8. VERIFICAÇÃO DE DUPLICIDADES EM SÓCIOS
--
-- Antes de criar UNIQUE NULLS NOT DISTINCT, removemos duplicatas
-- eventualmente existentes, preservando o menor ID.
--
-- Isso é necessário porque o banco já possui dados carregados.
-- =====================================================================

DELETE FROM public.socios s1
USING public.socios s2

WHERE s1.id > s2.id

AND s1.empresa_id = s2.empresa_id

AND s1.tipo_socio_codigo
    IS NOT DISTINCT FROM
    s2.tipo_socio_codigo

AND s1.documento_socio
    IS NOT DISTINCT FROM
    s2.documento_socio

AND s1.qualificacao_codigo
    IS NOT DISTINCT FROM
    s2.qualificacao_codigo

AND s1.competencia = s2.competencia;


-- =====================================================================
-- 9. CONSTRAINT DEFINITIVA DE SÓCIOS
--
-- PostgreSQL 15+
-- =====================================================================

ALTER TABLE public.socios
ADD CONSTRAINT uk_socio_competencia
UNIQUE NULLS NOT DISTINCT (
    empresa_id,
    tipo_socio_codigo,
    documento_socio,
    qualificacao_codigo,
    competencia
);


COMMIT;