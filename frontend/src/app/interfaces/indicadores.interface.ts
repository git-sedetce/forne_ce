export interface IndicadoresResumo {
  uf: string;
  competencia: string;
  situacao_cadastral: {
    codigo: string;
    descricao: string;
  };
  quantidade: {
    empresas: number;
    estabelecimentos: number;
    matrizes: number;
    filiais: number;
  };
}

export interface IndicadorMunicipio {
  municipio_codigo: string;
  municipio: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
  quantidade_matrizes?: number;
  quantidade_filiais?: number;
}

export interface IndicadorCnae {
  cnae_codigo: string;
  cnae_formatado: string;
  cnae_descricao: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
  quantidade_matrizes?: number;
  quantidade_filiais?: number;
}

export interface IndicadorLocacional {
  id?: number;
  competencia: string;
  municipio_codigo: string;
  municipio: string;
  ql: number | string;
  cnae_codigo: string;
  cnae_descricao: string;
  cociente_locacional: number | string;
  empresas_municipio_cnae: number | string;
  empresas_municipio: number | string;
  empresas_estado_cnae: number | string;
  empresas_estado: number | string;
}

export interface RespostaMunicipiosIndicadores {
  filtros: {
    uf: string;
    competencia: string;
  };
  resumo: {
    quantidade_municipios: number;
    total_empresas: number;
    total_estabelecimentos: number;
  };
  dados: IndicadorMunicipio[];
}

export interface RespostaCnaesIndicadores {
  filtros: {
    uf: string;
    competencia: string;
  };
  dados: IndicadorCnae[];
}

export interface RespostaLocacional {
  competencia: string | null;
  paginacao: {
    pagina: number;
    limite: number;
    total_registros: number;
    total_paginas: number;
  };
  dados: IndicadorLocacional[];
}


export type TipoDataIndicador =
  | 'INICIO_ATIVIDADE'
  | 'SITUACAO_CADASTRAL';

export type SegmentoIndicador =
  | ''
  | 'INDUSTRIA'
  | 'COMERCIO'
  | 'SERVICOS'
  | 'OUTROS';

export type SituacaoIndicador =
  | ''
  | '01'
  | '02'
  | '03'
  | '04'
  | '08';


/* =====================================================
   FILTROS
===================================================== */

export interface FiltrosIndicadores {
  uf?: string;
  competencia?: string;
  regiao?: string;
  municipio?: string;
  municipios?: string[];
  segmento?: SegmentoIndicador;
  situacao?: SituacaoIndicador;
  dataInicial?: string;
  dataFinal?: string;
  tipoData?: TipoDataIndicador;
}


/* =====================================================
   FILTROS RETORNADOS PELA API
===================================================== */

export interface FiltrosIndicadoresResponse {
  uf: string;
  competencia: string;
  regiao: string | null;
  municipio: string | null;
  segmento: string | null;
  situacao: string | null;
  data_inicial: string | null;
  data_final: string | null;
  tipo_data: TipoDataIndicador;
}


/* =====================================================
   RESUMO
===================================================== */

export interface IndicadoresDashboardResumo {
  empresas: number;
  estabelecimentos: number;
  municipios: number;
  cnaes: number;
  matrizes: number;
  filiais: number;
}


/* =====================================================
   SITUAÇÃO CADASTRAL
===================================================== */

export interface IndicadorSituacao {
  codigo: string;
  descricao: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
}


/* =====================================================
   SEGMENTOS
===================================================== */

export interface IndicadorSegmento {
  segmento: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
}


/* =====================================================
   MUNICÍPIOS
===================================================== */

export interface IndicadorDashboardMunicipio {
  municipio_codigo: string;
  municipio: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
  quantidade_matrizes: number;
  quantidade_filiais: number;
}


/* =====================================================
   TOP ATIVIDADES ECONÔMICAS
===================================================== */

export interface IndicadorTopAtividade {
  posicao: number;
  cnae_codigo: string;
  cnae_formatado: string;
  cnae_descricao: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
  quantidade_matrizes: number;
  quantidade_filiais: number;
}


/* =====================================================
   EVOLUÇÃO TEMPORAL
===================================================== */

export interface IndicadorEvolucao {
  periodo: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
}


/* =====================================================
   RESPONSE PRINCIPAL
===================================================== */

export interface IndicadoresDashboardResponse {
  filtros: FiltrosIndicadoresResponse;
  resumo: IndicadoresDashboardResumo;
  situacoes: IndicadorSituacao[];
  segmentos: IndicadorSegmento[];
  municipios: IndicadorDashboardMunicipio[];
  top_atividades: IndicadorTopAtividade[];
  evolucao: IndicadorEvolucao[];
}
