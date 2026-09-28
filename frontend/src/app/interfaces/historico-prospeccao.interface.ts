import { EmpresaJucec } from './empresa-jucec.interface';

export interface DadosContatoProspeccao {
  assuntoProspeccao: string;
  servicoProjeto: string;
  responsavelContato: string;
  cargoFuncao: string;
  telefoneContato: string;
  emailContato: string;
  dataLimiteRetorno: string;
  observacoesContato: string;
}

export interface DadosHistoricoProspeccao {
  contato: DadosContatoProspeccao;
  empresas: EmpresaJucec[];
}

export interface HistoricoProspeccao {
  id: number;
  nome_arquivo: string;
  createdAt: string;
  dados: DadosHistoricoProspeccao;
  usuario?: {
    id: number;
    nome: string;
    email: string;
  } | null;
}

export interface HistoricoProspeccaoResponse {
  total: number;
  pagina: number;
  limite: number;
  dados: HistoricoProspeccao[];
}
