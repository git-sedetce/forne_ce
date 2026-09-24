-- =====================================================================
-- OBSERVATÓRIO EMPRESARIAL - RECEITA FEDERAL
-- 003_indexes.sql
--
-- Índices de pesquisa e desempenho.
--
-- Ordem de inicialização:
--
--   001_schema.sql
--   002_staging.sql
--   003_indexes.sql
--
-- =====================================================================


-- =====================================================================
-- CARGAS
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_cargas_tipo_competencia
ON public.cargas (
    tipo_carga,
    competencia
);


CREATE INDEX IF NOT EXISTS idx_cargas_status
ON public.cargas (
    status
);


CREATE INDEX IF NOT EXISTS idx_cargas_competencia
ON public.cargas (
    competencia
);


-- =====================================================================
-- CNPJ CE
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_cnpj_ce_competencia
ON public.cnpj_ce (
    competencia
);


CREATE INDEX IF NOT EXISTS idx_cnpj_ce_carga
ON public.cnpj_ce (
    carga_id
);


-- =====================================================================
-- EMPRESAS
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_empresas_competencia
ON public.empresas (
    competencia
);


CREATE INDEX IF NOT EXISTS idx_empresas_carga
ON public.empresas (
    carga_id
);


CREATE INDEX IF NOT EXISTS idx_empresas_natureza
ON public.empresas (
    natureza_juridica_codigo
);


CREATE INDEX IF NOT EXISTS idx_empresas_porte
ON public.empresas (
    porte_codigo
);


CREATE INDEX IF NOT EXISTS idx_empresas_razao_social
ON public.empresas
USING gin (
    razao_social gin_trgm_ops
);


-- =====================================================================
-- ESTABELECIMENTOS
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_estabelecimentos_empresa
ON public.estabelecimentos (
    empresa_id
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_cnpj_basico
ON public.estabelecimentos (
    cnpj_basico
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_competencia
ON public.estabelecimentos (
    competencia
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_carga
ON public.estabelecimentos (
    carga_id
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_cnae
ON public.estabelecimentos (
    cnae_principal_codigo
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_municipio
ON public.estabelecimentos (
    municipio_codigo
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_uf
ON public.estabelecimentos (
    uf
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_situacao
ON public.estabelecimentos (
    situacao_cadastral_codigo
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_matriz_filial
ON public.estabelecimentos (
    identificador_matriz_filial
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_cep
ON public.estabelecimentos (
    cep
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_nome
ON public.estabelecimentos
USING gin (
    nome_fantasia gin_trgm_ops
);


-- =====================================================================
-- ÍNDICES COMPOSTOS - ESTABELECIMENTOS
--
-- Úteis para consultas da API que normalmente combinarão filtros
-- por competência com município, CNAE, UF e situação cadastral.
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_estabelecimentos_competencia_municipio
ON public.estabelecimentos (
    competencia,
    municipio_codigo
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_competencia_cnae
ON public.estabelecimentos (
    competencia,
    cnae_principal_codigo
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_competencia_situacao
ON public.estabelecimentos (
    competencia,
    situacao_cadastral_codigo
);


CREATE INDEX IF NOT EXISTS idx_estabelecimentos_competencia_uf
ON public.estabelecimentos (
    competencia,
    uf
);


-- =====================================================================
-- SÓCIOS
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_socios_documento
ON public.socios (
    documento_socio
);


CREATE INDEX IF NOT EXISTS idx_socios_competencia
ON public.socios (
    competencia
);


CREATE INDEX IF NOT EXISTS idx_socios_carga
ON public.socios (
    carga_id
);


CREATE INDEX IF NOT EXISTS idx_socios_qualificacao
ON public.socios (
    qualificacao_codigo
);


CREATE INDEX IF NOT EXISTS idx_socios_nome
ON public.socios
USING gin (
    nome_socio gin_trgm_ops
);


-- =====================================================================
-- SIMPLES NACIONAL / MEI
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_simples_competencia
ON public.simples (
    competencia
);


CREATE INDEX IF NOT EXISTS idx_simples_carga
ON public.simples (
    carga_id
);


CREATE INDEX IF NOT EXISTS idx_simples_opcao_simples
ON public.simples (
    opcao_simples
);


CREATE INDEX IF NOT EXISTS idx_simples_opcao_mei
ON public.simples (
    opcao_mei
);

-- =====================================================================
-- COCIENTE LOCACIONAL
-- =====================================================================

CREATE INDEX IF NOT EXISTS
    idx_cociente_competencia_cnae_ql
ON analytics.cociente_locacional (
    competencia,
    cnae_codigo,
    cociente_locacional DESC
);


CREATE INDEX IF NOT EXISTS
    idx_cociente_competencia_municipio_ql
ON analytics.cociente_locacional (
    competencia,
    municipio_codigo,
    cociente_locacional DESC
);


CREATE INDEX IF NOT EXISTS
    idx_cociente_competencia_ql
ON analytics.cociente_locacional (
    competencia,
    cociente_locacional DESC
);

-- =====================================================================
-- JUNTA COMERCIAL - EMPRESAS
-- =====================================================================

-- Consulta direta por CNPJ.
--
-- Embora exista UNIQUE (cnpj, competencia), esse índice composto começa
-- por cnpj e já pode atender consultas que filtram somente pelo CNPJ.
-- Portanto, não criamos outro índice exclusivo para cnpj.


-- Consulta por competência
CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia
ON public.junta_empresas (
    competencia
);


-- Consulta por situação da empresa dentro de uma competência
CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia_status
ON public.junta_empresas (
    competencia,
    status
);


-- Consulta por município dentro de uma competência
CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia_municipio
ON public.junta_empresas (
    competencia,
    municipio
);


-- Consulta por região dentro de uma competência
CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia_regiao
ON public.junta_empresas (
    competencia,
    regiao
);


-- Rastreamento da carga responsável pelo registro
CREATE INDEX IF NOT EXISTS idx_junta_empresas_carga
ON public.junta_empresas (
    carga_id
);


-- =====================================================================
-- JUNTA COMERCIAL - PESQUISA TEXTUAL
-- =====================================================================

-- Pesquisa por razão social utilizando ILIKE
CREATE INDEX IF NOT EXISTS idx_junta_empresas_razao_social_trgm
ON public.junta_empresas
USING gin (
    razao_social gin_trgm_ops
);


-- Pesquisa por nome fantasia utilizando ILIKE
CREATE INDEX IF NOT EXISTS idx_junta_empresas_nome_fantasia_trgm
ON public.junta_empresas
USING gin (
    nome_fantasia gin_trgm_ops
);


-- =====================================================================
-- JUNTA COMERCIAL - CNAES
-- =====================================================================

-- Consulta das empresas relacionadas a determinado CNAE
CREATE INDEX IF NOT EXISTS idx_junta_empresa_cnaes_cnae
ON public.junta_empresa_cnaes (
    cnae_codigo
);


-- Rastreamento da carga
CREATE INDEX IF NOT EXISTS idx_junta_empresa_cnaes_carga
ON public.junta_empresa_cnaes (
    carga_id
);

CREATE INDEX IF NOT EXISTS idx_junta_empresas_cnpj_competencia
ON public.junta_empresas (
    cnpj,
    competencia
);

CREATE INDEX IF NOT EXISTS idx_junta_empresas_competencia_ocorrencia
ON public.junta_empresas (
    competencia,
    ocorrencia_arquivo
);