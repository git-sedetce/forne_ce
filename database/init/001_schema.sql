-- =====================================================================
-- OBSERVATÓRIO EMPRESARIAL - RECEITA FEDERAL
-- 001_schema.sql
--
-- Estrutura principal do banco de dados.
--
-- Ordem de inicialização:
--   001_schema.sql
--   002_staging.sql
--   003_indexes.sql
-- =====================================================================


-- =====================================================================
-- EXTENSÕES
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- =====================================================================
-- SCHEMAS
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS analytics;


-- =====================================================================
-- CONTROLE DAS CARGAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cargas (

    id BIGSERIAL PRIMARY KEY,

    competencia VARCHAR(7) NOT NULL,

    tipo_carga VARCHAR(30) NOT NULL,

    data_inicio TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    data_fim TIMESTAMP,

    status VARCHAR(30) NOT NULL,

    registros_lidos BIGINT NOT NULL
        DEFAULT 0,

    registros_processados BIGINT NOT NULL
        DEFAULT 0,

    registros_inseridos BIGINT NOT NULL
        DEFAULT 0,

    registros_atualizados BIGINT NOT NULL
        DEFAULT 0,

    registros_duplicados BIGINT NOT NULL
        DEFAULT 0,

    registros_erro BIGINT NOT NULL
        DEFAULT 0,

    mensagem_erro TEXT,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =====================================================================
-- CNAES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cnaes (

    codigo VARCHAR(7) PRIMARY KEY,

    descricao TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =====================================================================
-- MOTIVOS DA SITUAÇÃO CADASTRAL
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.motivos_situacao (

    codigo VARCHAR(2) PRIMARY KEY,

    descricao TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =====================================================================
-- MUNICÍPIOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.municipios (

    codigo VARCHAR(4) PRIMARY KEY,

    nome VARCHAR(150) NOT NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =====================================================================
-- NATUREZAS JURÍDICAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.naturezas_juridicas (

    codigo VARCHAR(4) PRIMARY KEY,

    descricao TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =====================================================================
-- PAÍSES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.paises (

    codigo VARCHAR(3) PRIMARY KEY,

    nome VARCHAR(150) NOT NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =====================================================================
-- QUALIFICAÇÕES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.qualificacoes (

    codigo VARCHAR(2) PRIMARY KEY,

    descricao TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP

);


-- =====================================================================
-- CNPJ CE
--
-- Representa os CNPJs básicos identificados a partir de estabelecimentos
-- localizados no Ceará em determinada competência.
--
-- Um mesmo CNPJ pode aparecer em competências diferentes.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.cnpj_ce (

    cnpj_basico VARCHAR(8) NOT NULL,

    competencia VARCHAR(7) NOT NULL,

    carga_id BIGINT
        REFERENCES public.cargas(id),

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_cnpj_ce
        PRIMARY KEY (
            cnpj_basico,
            competencia
        )

);


-- =====================================================================
-- EMPRESAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.empresas (

    id BIGSERIAL PRIMARY KEY,

    cnpj_basico VARCHAR(8) NOT NULL,

    razao_social TEXT,

    natureza_juridica_codigo VARCHAR(4),

    qualificacao_responsavel_codigo VARCHAR(2),

    capital_social NUMERIC(18,2),

    porte_codigo VARCHAR(2),

    ente_federativo_responsavel TEXT,

    competencia VARCHAR(7) NOT NULL,

    carga_id BIGINT
        REFERENCES public.cargas(id),

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    -- ---------------------------------------------------------
    -- UNIQUE
    -- ---------------------------------------------------------

    CONSTRAINT uk_empresa_competencia
        UNIQUE (
            cnpj_basico,
            competencia
        ),


    -- ---------------------------------------------------------
    -- FOREIGN KEYS
    -- ---------------------------------------------------------

    CONSTRAINT fk_empresa_natureza
        FOREIGN KEY (
            natureza_juridica_codigo
        )
        REFERENCES public.naturezas_juridicas (
            codigo
        ),

    CONSTRAINT fk_empresa_qualificacao
        FOREIGN KEY (
            qualificacao_responsavel_codigo
        )
        REFERENCES public.qualificacoes (
            codigo
        )

);


-- =====================================================================
-- ESTABELECIMENTOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.estabelecimentos (

    id BIGSERIAL PRIMARY KEY,

    empresa_id BIGINT NOT NULL
        REFERENCES public.empresas(id)
        ON DELETE CASCADE,

    cnpj_basico VARCHAR(8) NOT NULL,

    cnpj_ordem VARCHAR(4) NOT NULL,

    cnpj_dv VARCHAR(2) NOT NULL,

    cnpj_completo VARCHAR(14) NOT NULL,

    identificador_matriz_filial VARCHAR(1),

    nome_fantasia TEXT,

    situacao_cadastral_codigo VARCHAR(2),

    data_situacao_cadastral DATE,

    motivo_situacao_codigo VARCHAR(2),

    nome_cidade_exterior TEXT,

    pais_codigo VARCHAR(3),

    data_inicio_atividade DATE,

    cnae_principal_codigo VARCHAR(7),

    cnae_secundario_codigo TEXT,

    tipo_logradouro TEXT,

    logradouro TEXT,

    numero TEXT,

    complemento TEXT,

    bairro TEXT,

    cep VARCHAR(8),

    uf VARCHAR(2),

    municipio_codigo VARCHAR(4),

    ddd_1 VARCHAR(3),

    telefone_1 VARCHAR(20),

    ddd_2 VARCHAR(3),

    telefone_2 VARCHAR(20),

    fax VARCHAR(20),

    email TEXT,

    situacao_especial TEXT,

    data_situacao_especial DATE,

    competencia VARCHAR(7) NOT NULL,

    carga_id BIGINT
        REFERENCES public.cargas(id),

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    -- ---------------------------------------------------------
    -- UNIQUE
    -- ---------------------------------------------------------

    CONSTRAINT uk_estabelecimento_competencia
        UNIQUE (
            cnpj_completo,
            competencia
        ),


    -- ---------------------------------------------------------
    -- FOREIGN KEYS
    -- ---------------------------------------------------------

    CONSTRAINT fk_estabelecimento_cnae
        FOREIGN KEY (
            cnae_principal_codigo
        )
        REFERENCES public.cnaes (
            codigo
        ),

    CONSTRAINT fk_estabelecimento_municipio
        FOREIGN KEY (
            municipio_codigo
        )
        REFERENCES public.municipios (
            codigo
        ),

    CONSTRAINT fk_estabelecimento_motivo
        FOREIGN KEY (
            motivo_situacao_codigo
        )
        REFERENCES public.motivos_situacao (
            codigo
        ),

    CONSTRAINT fk_estabelecimento_pais
        FOREIGN KEY (
            pais_codigo
        )
        REFERENCES public.paises (
            codigo
        )

);


-- =====================================================================
-- SÓCIOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.socios (

    id BIGSERIAL PRIMARY KEY,

    empresa_id BIGINT NOT NULL
        REFERENCES public.empresas(id)
        ON DELETE CASCADE,

    tipo_socio_codigo VARCHAR(2),

    nome_socio TEXT,

    documento_socio VARCHAR(20),

    qualificacao_codigo VARCHAR(2),

    data_entrada DATE,

    pais_codigo VARCHAR(3),

    representante_legal_documento VARCHAR(20),

    representante_legal_nome TEXT,

    qualificacao_representante_codigo VARCHAR(2),

    faixa_etaria VARCHAR(2),

    competencia VARCHAR(7) NOT NULL,

    carga_id BIGINT
        REFERENCES public.cargas(id),

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,


    -- ---------------------------------------------------------
    -- UNIQUE
    --
    -- NULLS NOT DISTINCT faz com que NULL seja considerado
    -- igual a NULL para fins da restrição de unicidade.
    --
    -- PostgreSQL 15+
    -- ---------------------------------------------------------

    CONSTRAINT uk_socio_competencia
        UNIQUE NULLS NOT DISTINCT (
            empresa_id,
            tipo_socio_codigo,
            documento_socio,
            qualificacao_codigo,
            competencia
        ),


    -- ---------------------------------------------------------
    -- FOREIGN KEYS
    -- ---------------------------------------------------------

    CONSTRAINT fk_socio_qualificacao
        FOREIGN KEY (
            qualificacao_codigo
        )
        REFERENCES public.qualificacoes (
            codigo
        ),

    CONSTRAINT fk_socio_pais
        FOREIGN KEY (
            pais_codigo
        )
        REFERENCES public.paises (
            codigo
        )

);


-- =====================================================================
-- SIMPLES NACIONAL / MEI
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.simples (

    cnpj_basico VARCHAR(8) NOT NULL,

    opcao_simples VARCHAR(1),

    data_opcao_simples DATE,

    data_exclusao_simples DATE,

    opcao_mei VARCHAR(1),

    data_opcao_mei DATE,

    data_exclusao_mei DATE,

    competencia VARCHAR(7) NOT NULL,

    carga_id BIGINT
        REFERENCES public.cargas(id),

    created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_simples
        PRIMARY KEY (
            cnpj_basico,
            competencia
        )

);