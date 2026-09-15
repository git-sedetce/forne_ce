export interface CnaeItem {
  codigo: string;
  codigo_formatado: string;
  descricao: string;
}

export interface CnaeResponse {
  filtros: {
    pesquisa: string | null;
  };

  paginacao: {
    pagina: number;
    limite: number;
    total_itens: number;
    total_paginas: number;
  };

  dados: CnaeItem[];
}
