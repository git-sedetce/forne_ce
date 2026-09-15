import { EmpresaCnae } from './empresa-cnae.interface';

export interface FiltrosEmpresaPesquisa {
  cnae: string | null;
  cnae_formatado: string | null;
  uf: string;
  municipio: string | null;
  regiao: string | null;
  porte: string | null;
  competencia: string;
  situacao_cadastral: string;
  criterio_cnae: string | null;
}

export interface PaginacaoEmpresaPesquisa {
  pagina: number;
  limite: number;
  total_itens: number;
  total_paginas: number;
}

export interface EmpresasPesquisaResponse {
  filtros: FiltrosEmpresaPesquisa;
  paginacao: PaginacaoEmpresaPesquisa;
  dados: EmpresaCnae[];
}
