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
  municipio_nome: string;
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
