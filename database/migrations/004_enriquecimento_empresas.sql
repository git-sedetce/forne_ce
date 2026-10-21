
CREATE TABLE IF NOT EXISTS public.empresas_contatos_comerciais (
    id BIGSERIAL PRIMARY KEY,
    cnpj VARCHAR(14) NOT NULL UNIQUE,

    email_comercial VARCHAR(255),
    website TEXT,
    telefone_comercial VARCHAR(30),
    whatsapp VARCHAR(30),
    instagram TEXT,

    fonte VARCHAR(100),
    url_fonte TEXT,

    status_verificacao VARCHAR(30)
        NOT NULL DEFAULT 'PENDENTE',

    confianca SMALLINT NOT NULL DEFAULT 0,

    verificado_em TIMESTAMPTZ,
    proxima_atualizacao TIMESTAMPTZ,

    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_cnpj_contato
        CHECK (cnpj ~ '^[0-9]{14}$'),

    CONSTRAINT chk_confianca
        CHECK (confianca BETWEEN 0 AND 100),

    CONSTRAINT chk_status_contato
        CHECK (status_verificacao IN (
            'PENDENTE',
            'EM_ANALISE',
            'VERIFICADO',
            'NAO_ENCONTRADO',
            'REVISAR',
            'ERRO'
        ))
);

CREATE TABLE IF NOT EXISTS public.empresas_enriquecimento_fila (
    id BIGSERIAL PRIMARY KEY,
    cnpj VARCHAR(14) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    tentativas INTEGER NOT NULL DEFAULT 0,
    max_tentativas INTEGER NOT NULL DEFAULT 3,

    prioridade SMALLINT NOT NULL DEFAULT 5,
    executar_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    iniciado_em TIMESTAMPTZ,
    concluido_em TIMESTAMPTZ,
    erro TEXT,

    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_status_fila
        CHECK (status IN (
            'PENDENTE',
            'PROCESSANDO',
            'CONCLUIDO',
            'ERRO'
        ))
);

CREATE UNIQUE INDEX IF NOT EXISTS
    uq_enriquecimento_fila_ativa
ON public.empresas_enriquecimento_fila (cnpj)
WHERE status IN ('PENDENTE', 'PROCESSANDO');

CREATE INDEX IF NOT EXISTS
    idx_contatos_proxima_atualizacao
ON public.empresas_contatos_comerciais
    (proxima_atualizacao);

CREATE INDEX IF NOT EXISTS
    idx_fila_processamento
ON public.empresas_enriquecimento_fila
    (status, executar_em, prioridade, id);
