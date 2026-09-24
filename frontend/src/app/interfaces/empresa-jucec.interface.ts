export interface JucecCnae {
  codigo: string;
  descricao: string;
  ordem: number;
}

export interface EmpresaJucec {
  ocorrencia_id: number;
  ocorrencia_arquivo: number;

  cnpj: string;

  razao_social: string | null;
  nome_fantasia: string | null;

  status: string | null;

  porte: string | null;
  porte_descricao: string | null;

  municipio: string | null;
  regiao: string | null;

  tipo_logradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;

  ddd_telefone: string | null;
  telefone: string | null;
  email: string | null;

  opcao_simples_nacional: string | null;

  data_abertura: string | null;
  data_encerramento: string | null;

  competencia: string;

  cnaes: JucecCnae[];
}

export interface EmpresasJucecResponse {
  fonte: 'JUCEC';

  filtros: {
    cnae: string | null;
    cnae_formatado: string | null;

    regiao: string | null;
    municipio: string | null;
    porte: string | null;

    competencia: string;

    status: string;

    criterio_cnae: string | null;
  };

  paginacao: {
    pagina: number;
    limite: number;
    total_itens: number;
    total_paginas: number;
  };

  dados: EmpresaJucec[];
}
