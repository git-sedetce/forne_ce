BEGIN;

ALTER TABLE public.junta_empresas
DROP CONSTRAINT IF EXISTS uk_junta_empresa_competencia;

CREATE INDEX IF NOT EXISTS idx_junta_empresas_cnpj_competencia
ON public.junta_empresas (
    cnpj,
    competencia
);

ALTER TABLE public.junta_empresas
ADD COLUMN IF NOT EXISTS ocorrencia_arquivo BIGINT;

COMMIT;