-- =====================================================================
-- OBSERVATÓRIO EMPRESARIAL - RECEITA FEDERAL
-- 002_staging.sql
--
-- Tabelas auxiliares utilizadas durante o processo de ETL.
--
-- As tabelas de staging recebem os dados brutos da Receita Federal
-- antes da transformação e inserção nas tabelas definitivas.
--
-- Ordem de inicialização:
--
--   001_schema.sql
--   002_staging.sql
--   003_indexes.sql
--
-- =====================================================================


-- =====================================================================
-- SCHEMA
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS staging;


-- =====================================================================
-- CNAES
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.cnaes (

    codigo TEXT,

    descricao TEXT

);


-- =====================================================================
-- MOTIVOS DA SITUAÇÃO CADASTRAL
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.motivos (

    codigo TEXT,

    descricao TEXT

);


-- =====================================================================
-- MUNICÍPIOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.municipios (

    codigo TEXT,

    nome TEXT

);


-- =====================================================================
-- NATUREZAS JURÍDICAS
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.naturezas (

    codigo TEXT,

    descricao TEXT

);


-- =====================================================================
-- PAÍSES
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.paises (

    codigo TEXT,

    nome TEXT

);


-- =====================================================================
-- QUALIFICAÇÕES
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.qualificacoes (

    codigo TEXT,

    descricao TEXT

);


-- =====================================================================
-- EMPRESAS
--
-- Layout Receita Federal:
--
--  1 - CNPJ básico
--  2 - Razão social
--  3 - Natureza jurídica
--  4 - Qualificação do responsável
--  5 - Capital social
--  6 - Porte
--  7 - Ente federativo responsável
--
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.empresas (

    cnpj_basico TEXT,

    razao_social TEXT,

    natureza_juridica_codigo TEXT,

    qualificacao_responsavel_codigo TEXT,

    capital_social TEXT,

    porte_codigo TEXT,

    ente_federativo_responsavel TEXT

);


-- =====================================================================
-- ESTABELECIMENTOS
--
-- Mantemos os campos como TEXT porque esta tabela representa os
-- dados brutos recebidos da Receita Federal.
--
-- Conversões para DATE, VARCHAR etc. devem ocorrer durante o ETL.
--
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.estabelecimentos (

    cnpj_basico TEXT,

    cnpj_ordem TEXT,

    cnpj_dv TEXT,

    identificador_matriz_filial TEXT,

    nome_fantasia TEXT,

    situacao_cadastral_codigo TEXT,

    data_situacao_cadastral TEXT,

    motivo_situacao_codigo TEXT,

    nome_cidade_exterior TEXT,

    pais_codigo TEXT,

    data_inicio_atividade TEXT,

    cnae_principal_codigo TEXT,

    cnae_secundario_codigo TEXT,

    tipo_logradouro TEXT,

    logradouro TEXT,

    numero TEXT,

    complemento TEXT,

    bairro TEXT,

    cep TEXT,

    uf TEXT,

    municipio_codigo TEXT,

    ddd_1 TEXT,

    telefone_1 TEXT,

    ddd_2 TEXT,

    telefone_2 TEXT,

    fax TEXT,

    email TEXT,

    situacao_especial TEXT,

    data_situacao_especial TEXT,

    campo_30 TEXT

);


-- =====================================================================
-- SÓCIOS
--
-- Layout Receita Federal:
--
--  1 - CNPJ básico
--  2 - Identificador do sócio
--  3 - Nome / razão social do sócio
--  4 - CPF/CNPJ do sócio
--  5 - Qualificação do sócio
--  6 - Data de entrada na sociedade
--  7 - País
--  8 - CPF do representante legal
--  9 - Nome do representante legal
-- 10 - Qualificação do representante legal
-- 11 - Faixa etária
--
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.socios (

    cnpj_basico TEXT,

    tipo_socio_codigo TEXT,

    nome_socio TEXT,

    documento_socio TEXT,

    qualificacao_codigo TEXT,

    data_entrada TEXT,

    pais_codigo TEXT,

    representante_legal_documento TEXT,

    representante_legal_nome TEXT,

    qualificacao_representante_codigo TEXT,

    faixa_etaria TEXT

);


-- =====================================================================
-- SIMPLES NACIONAL / MEI
--
-- Layout Receita Federal:
--
--  1 - CNPJ básico
--  2 - Opção pelo Simples
--  3 - Data da opção pelo Simples
--  4 - Data de exclusão do Simples
--  5 - Opção pelo MEI
--  6 - Data da opção pelo MEI
--  7 - Data de exclusão do MEI
--
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.simples (

    cnpj_basico TEXT,

    opcao_simples TEXT,

    data_opcao_simples TEXT,

    data_exclusao_simples TEXT,

    opcao_mei TEXT,

    data_opcao_mei TEXT,

    data_exclusao_mei TEXT

);


-- =====================================================================
-- CNPJ CE
--
-- Área auxiliar para identificação dos CNPJs básicos que possuem
-- estabelecimentos localizados no Ceará.
--
-- A competência e o carga_id não vêm dos arquivos da Receita.
-- Esses valores são adicionados pelo processo ETL ao inserir na
-- tabela definitiva public.cnpj_ce.
--
-- =====================================================================

CREATE TABLE IF NOT EXISTS staging.cnpj_ce (

    cnpj_basico TEXT

);