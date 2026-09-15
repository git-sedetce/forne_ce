import { Injectable } from '@angular/core';
import { EmpresasPorCnaeResponse } from '../interfaces/empresa-cnae.interface';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment.development';
import { CnaeResponse } from '../interfaces/cnae.interface';
import { EmpresasPesquisaResponse } from '../interfaces/empresa-pesquisa.interface';

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

  // listarEmpresas(
  //   page: number = 1,
  //   limit: number = 20,
  //   filtros: {
  //     cnae?: string;
  //     uf?: string;
  //     municipio?: string;
  //     regiao?: string;
  //     porte?: string;
  //     municipiosRegiao?: string[];
  //   },
  // ): Observable<EmpresasPesquisaResponse> {
  //   let params = new HttpParams()
  //     .set('page', String(page))
  //     .set('limit', String(limit))
  //     .set('uf', filtros.uf || 'CE');

  //   if (filtros.cnae) {
  //     params = params.set('cnae', filtros.cnae);
  //   }

  //   if (filtros.municipio) {
  //     params = params.set('municipio', filtros.municipio);
  //   }

  //   if (filtros.regiao) {
  //     params = params.set('regiao', filtros.regiao);
  //   }

  //   if (filtros.porte) {
  //     params = params.set('porte', filtros.porte);
  //   }

  //   if (filtros.municipiosRegiao?.length) {
  //     params = params.set(
  //       'municipios_regiao',
  //       filtros.municipiosRegiao.join('|'),
  //     );
  //   }

  //   return this.http.get<EmpresasPesquisaResponse>(
  //     `${this.apiUrl}/empresas/pesquisar`,
  //     {
  //       params,
  //     },
  //   );
  // }
}
