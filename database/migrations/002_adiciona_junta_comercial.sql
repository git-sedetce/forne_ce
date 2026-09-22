-- =====================================================================
-- MIGRATION 002
-- ADICIONA ESTRUTURA PARA DADOS DA JUNTA COMERCIAL
--
-- Objetivo:
--   Adicionar ao banco existente as estruturas necessárias para
--   importar e armazenar os dados da Junta Comercial do Ceará,
--   mantendo-os separados dos dados da Receita Federal.
--
-- Estruturas criadas:
--
--   staging.junta_empresas
--   public.junta_empresas
--   public.junta_empresa_cnaes
--
-- Os dados históricos existentes não são alterados.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. STAGING - JUNTA COMERCIAL
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.junta_empresas (

    cnpj TEXT,
    cnaes TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    status TEXT,
    porte TEXT,
    municipio TEXT,
    regiao TEXT,
    nu_dddtelefone TEXT,
    nu_telefone TEXT,
    email TEXT,
    tipo_logradouro TEXT,
    nome_logradouro TEXT,
    num_logradouro TEXT,
    bairro TEXT,
    cd_opcao_simples_nacional TEXT,
    data_abertura TEXT,
    data_encerramento TEXT

);


-- =====================================================================
-- 2. PUBLIC - EMPRESAS DA JUNTA COMERCIAL
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.junta_empresas (

    id BIGSERIAL PRIMARY KEY,

    -- ---------------------------------------------------------
    -- IDENTIFICAÇÃO
    -- ---------------------------------------------------------

    cnpj VARCHAR(14) NOT NULL,
    razao_social TEXT,
    nome_fantasia TEXT,

    -- ---------------------------------------------------------
    -- SITUAÇÃO / PORTE
    -- ---------------------------------------------------------

    status VARCHAR(30),
    porte VARCHAR(20),

    -- ---------------------------------------------------------
    -- LOCALIZAÇÃO
    -- ---------------------------------------------------------

    municipio VARCHAR(150),
    regiao VARCHAR(150),

    -- ---------------------------------------------------------
    -- CONTATO
    -- ---------------------------------------------------------

    ddd_telefone VARCHAR(3),
    telefone VARCHAR(20),
    email TEXT,

    -- ---------------------------------------------------------
    -- ENDEREÇO
    -- ---------------------------------------------------------

    tipo_logradouro TEXT,
    logradouro TEXT,
    numero TEXT,
    bairro TEXT,

    -- ---------------------------------------------------------
    -- SIMPLES NACIONAL
    -- ---------------------------------------------------------

    opcao_simples_nacional VARCHAR(1),

    -- ---------------------------------------------------------
    -- DATAS
    -- ---------------------------------------------------------

    data_abertura DATE,
    data_encerramento DATE,

    -- ---------------------------------------------------------
    -- CONTROLE DA CARGA
    -- ---------------------------------------------------------

    competencia VARCHAR(7) NOT NULL,
    carga_id BIGINT
        REFERENCES public.cargas(id),
    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    -- ---------------------------------------------------------
    -- UNICIDADE
    -- ---------------------------------------------------------

    CONSTRAINT uk_junta_empresa_competencia
        UNIQUE (
            cnpj,
            competencia
        )
);

-- =====================================================================
-- 3. PUBLIC - CNAES DAS EMPRESAS DA JUNTA
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.junta_empresa_cnaes (

    junta_empresa_id BIGINT NOT NULL,
    cnae_codigo VARCHAR(7) NOT NULL,

    -- Posição do CNAE na lista fornecida pela Junta.
    -- Não significa necessariamente CNAE principal.
    ordem SMALLINT,
    carga_id BIGINT
        REFERENCES public.cargas(id),

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_junta_empresa_cnaes
        PRIMARY KEY (
            junta_empresa_id,
            cnae_codigo
        ),

    CONSTRAINT fk_junta_empresa_cnaes_empresa
        FOREIGN KEY (
            junta_empresa_id
        )
        REFERENCES public.junta_empresas(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_junta_empresa_cnaes_cnae
        FOREIGN KEY (
            cnae_codigo
        )
        REFERENCES public.cnaes(codigo)
);

-- =====================================================================
-- 4. ÍNDICES - JUNTA EMPRESAS
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia
ON public.junta_empresas (
    competencia
);

CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia_status
ON public.junta_empresas (
    competencia,
    status
);

CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia_municipio
ON public.junta_empresas (
    competencia,
    municipio
);

CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia_regiao
ON public.junta_empresas (
    competencia,
    regiao
);

CREATE INDEX IF NOT EXISTS idx_junta_empresas_carga
ON public.junta_empresas (
    carga_id
);

-- =====================================================================
-- 5. ÍNDICES DE PESQUISA TEXTUAL
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_junta_empresas_razao_social_trgm
ON public.junta_empresas
USING gin (
    razao_social gin_trgm_ops
);

CREATE INDEX IF NOT EXISTS idx_junta_empresas_nome_fantasia_trgm
ON public.junta_empresas
USING gin (
    nome_fantasia gin_trgm_ops
);

-- =====================================================================
-- 6. ÍNDICES - CNAES DA JUNTA
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_junta_empresa_cnaes_cnae
ON public.junta_empresa_cnaes (
    cnae_codigo
);

CREATE INDEX IF NOT EXISTS idx_junta_empresa_cnaes_carga
ON public.junta_empresa_cnaes (
    carga_id
);

-- =====================================================================
-- FIM
-- =====================================================================

COMMIT;