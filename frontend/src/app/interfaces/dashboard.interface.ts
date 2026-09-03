export interface EmpresaPorMunicipio {
  municipio_codigo: string;
  municipio: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
}

export interface CnaeRanking {
  cnae_codigo: string;
  cnae_formatado: string;
  cnae_descricao: string;
  quantidade_empresas: number;
  quantidade_estabelecimentos: number;
}

export interface RespostaMunicipios {
  filtros: {
    uf: string;
    competencia: string;
  };

  dados: EmpresaPorMunicipio[];
}

export interface RespostaCnaes {
  filtros: {
    uf: string;
    competencia: string;
  };

  paginacao: {
    pagina: number;
    limite: number;
    total_itens: number;
    total_paginas: number;
  };

  dados: CnaeRanking[];
}
