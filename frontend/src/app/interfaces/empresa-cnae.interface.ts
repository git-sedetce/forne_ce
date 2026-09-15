export interface EmpresaCnae {
  cnpj: string;
  cnpj_basico: string;

  razao_social: string;
  nome_fantasia: string | null;

  identificador_matriz_filial: string;
  tipo_estabelecimento: string;

  situacao_cadastral_codigo: string;
  situacao_cadastral_descricao: string;

  cnae_principal_codigo: string;
  cnae_principal_descricao: string;

  natureza_juridica_codigo: string;

  porte_codigo: string;
  porte_descricao: string;

  tipo_logradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;

  uf: string;
  municipio_codigo: string;
  municipio: string;

  ddd_1: string | null;
  telefone_1: string | null;

  ddd_2: string | null;
  telefone_2: string | null;

  email: string | null;

  data_inicio_atividade: string | null;
}

export interface FiltrosEmpresaCnae {
  cnae: string;
  cnae_formatado: string;
  uf: string;
  municipio: string | null;
  competencia: string;
  situacao_cadastral: string;
  criterio_cnae: string;
}

export interface PaginacaoEmpresaCnae {
  pagina: number;
  limite: number;
  total_itens: number;
  total_paginas: number;
}

export interface EmpresasPorCnaeResponse {
  filtros: FiltrosEmpresaCnae;
  paginacao: PaginacaoEmpresaCnae;
  dados: EmpresaCnae[];
}
