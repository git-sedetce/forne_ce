import { Injectable } from '@angular/core';
import { EmpresasPorCnaeResponse } from '../interfaces/empresa-cnae.interface';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment.development';
import { CnaeResponse } from '../interfaces/cnae.interface';
import { EmpresasPesquisaResponse } from '../interfaces/empresa-pesquisa.interface';
import { EmpresasJucecResponse } from '../interfaces/empresa-jucec.interface';
import {
  DadosHistoricoProspeccao,
  HistoricoProspeccaoResponse,
} from '../interfaces/historico-prospeccao.interface';

@Injectable({
  providedIn: 'root',
})
export class EmpresaService {
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

  // =====================================================
  // PESQUISA AVANÇADA
  // =====================================================

  pesquisarEmpresas(
    page: number = 1,
    limit: number = 20,

    filtros: {
      cnae?: string;
      uf?: string;
      regiao?: string;
      municipio?: string;
      porte?: string;
      municipios?: string[];
    },
  ): Observable<EmpresasPesquisaResponse> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit))
      .set('uf', filtros.uf || 'CE');

    if (filtros.cnae?.trim()) {
      params = params.set('cnae', filtros.cnae.trim());
    }

    if (filtros.regiao?.trim()) {
      params = params.set('regiao', filtros.regiao.trim());
    }

    if (filtros.municipio?.trim()) {
      params = params.set('municipio', filtros.municipio.trim());
    }

    if (filtros.porte?.trim()) {
      params = params.set('porte', filtros.porte.trim());
    }

    if (filtros.municipios?.length) {
      params = params.set('municipios', filtros.municipios.join('|'));
    }

    return this.http.get<EmpresasPesquisaResponse>(
      `${this.apiUrl}/empresas/pesquisar`,
      {
        params,
      },
    );
  }

  // =====================================================
  // CONSULTA ESPECÍFICA POR CNAE
  // =====================================================

  listarEmpresasPorCnae(
    cnae: string,
    page: number = 1,
    limit: number = 20,
    uf: string = 'CE',
    municipio: string = '',
  ): Observable<EmpresasPorCnaeResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('uf', uf);

    if (municipio.trim()) {
      params = params.set('municipio', municipio.trim());
    }

    return this.http.get<EmpresasPorCnaeResponse>(
      `${this.apiUrl}cnae/${cnae}`,
      { params },
    );
  }

  // =====================================================
  // CNAES / AUTOCOMPLETE
  // =====================================================

  listarCnaes(
    pagina: number = 1,
    limite: number = 50,
    pesquisa: string = '',
  ): Observable<CnaeResponse> {
    let params = new HttpParams()
      .set('page', String(pagina))
      .set('limit', String(limite));

    if (pesquisa.trim()) {
      params = params.set('pesquisa', pesquisa.trim());
    }

    return this.http.get<CnaeResponse>(`${this.apiUrl}/listarcnae/cnae`, {
      params,
    });
  }

  // =====================================================
  // PESQUISA DE EMPRESAS - JUCEC
  // =====================================================

  pesquisarEmpresasJucec(
    page: number = 1,
    limit: number = 20,

    filtros: {
      cnae?: string;
      cnaes?: string[];
      nome?: string;
      regiao?: string;
      municipio?: string;
      porte?: string;
    },
  ): Observable<EmpresasJucecResponse> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));

    if (filtros.cnae?.trim()) {
      params = params.set('cnae', filtros.cnae.trim());
    }

    if (filtros.cnaes?.length) {
      params = params.set('cnaes', filtros.cnaes.join('|'));
    }

    if (filtros.nome?.trim()) {
      params = params.set('nome', filtros.nome.trim());
    }

    if (filtros.regiao?.trim()) {
      params = params.set('regiao', filtros.regiao.trim());
    }

    if (filtros.municipio?.trim()) {
      params = params.set('municipio', filtros.municipio.trim());
    }

    if (filtros.porte?.trim()) {
      params = params.set('porte', filtros.porte.trim());
    }

    return this.http.get<EmpresasJucecResponse>(
      `${this.apiUrl}/empresas/pesquisarjucec`,
      {
        params,
      },
    );
  }

  criarHistoricoProspeccao(
    nomeArquivo: string,
    dados: DadosHistoricoProspeccao,
  ): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(
      `${this.apiUrl}/historico-prospeccoes`,
      { nome_arquivo: nomeArquivo, dados },
    );
  }

  salvarArquivoHistorico(id: number, arquivo: Blob): Observable<void> {
    return this.http.put<void>(
      `${this.apiUrl}/historico-prospeccoes/${id}/arquivo`,
      arquivo,
      { headers: { 'Content-Type': 'application/pdf' } },
    );
  }

  listarHistoricoProspeccoes(
    page: number = 1,
    limit: number = 50,
    pesquisa: string = '',
  ): Observable<HistoricoProspeccaoResponse> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('limit', String(limit));

    if (pesquisa.trim()) {
      params = params.set('pesquisa', pesquisa.trim());
    }

    return this.http.get<HistoricoProspeccaoResponse>(
      `${this.apiUrl}/historico-prospeccoes`,
      { params },
    );
  }

  atualizarHistoricoProspeccao(
    id: number,
    nomeArquivo: string,
    dados: DadosHistoricoProspeccao,
  ): Observable<void> {
    return this.http.put<void>(
      `${this.apiUrl}/historico-prospeccoes/${id}`,
      { nome_arquivo: nomeArquivo, dados },
    );
  }

  baixarArquivoHistorico(id: number): Observable<Blob> {
    return this.http.get(
      `${this.apiUrl}/historico-prospeccoes/${id}/arquivo`,
      { responseType: 'blob' },
    );
  }

  removerHistoricoPendente(id: number): Observable<void> {
    return this.http.delete<void>(
      `${this.apiUrl}/historico-prospeccoes/${id}`,
    );
  }
}
