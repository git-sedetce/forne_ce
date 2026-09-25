BEGIN;

ALTER TABLE public.junta_empresas
DROP CONSTRAINT IF EXISTS uk_junta_empresa_competencia;

ALTER TABLE public.junta_empresas
DROP CONSTRAINT IF EXISTS junta_empresas_cnpj_competencia_key;

ALTER TABLE public.junta_empresas
ADD COLUMN IF NOT EXISTS ocorrencia_arquivo BIGINT;

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

COMMIT;