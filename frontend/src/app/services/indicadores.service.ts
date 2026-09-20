import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  IndicadoresResumo,
  RespostaCnaesIndicadores,
  RespostaLocacional,
  RespostaMunicipiosIndicadores,
  FiltrosIndicadores,
  IndicadoresDashboardResponse,
} from '../interfaces/indicadores.interface';
import { environment } from '../../environments/environment.development';

@Injectable({
  providedIn: 'root',
})
export class IndicadoresService {
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

   /* =====================================================
     NOVO DASHBOARD
  ===================================================== */

  dashboard(
    filtros: FiltrosIndicadores = {},
  ): Observable<IndicadoresDashboardResponse> {

    let params = new HttpParams();

    // -----------------------------------------------------
    // UF
    // -----------------------------------------------------

    if (filtros.uf) {
      params = params.set(
        'uf',
        filtros.uf,
      );
    }

    // -----------------------------------------------------
    // COMPETÊNCIA
    // -----------------------------------------------------

    if (filtros.competencia) {
      params = params.set(
        'competencia',
        filtros.competencia,
      );
    }

    // -----------------------------------------------------
    // REGIÃO
    // -----------------------------------------------------

    if (filtros.regiao) {
      params = params.set(
        'regiao',
        filtros.regiao,
      );
    }

    /*
     * A API recebe os municípios de uma região separados
     * por "|".
     *
     * Exemplo:
     *
     * Fortaleza|Caucaia|Maracanau
     */
    if (
      filtros.municipios &&
      filtros.municipios.length > 0
    ) {
      params = params.set(
        'municipios',
        filtros.municipios.join('|'),
      );
    }

    // -----------------------------------------------------
    // MUNICÍPIO
    // -----------------------------------------------------

    if (filtros.municipio) {
      params = params.set(
        'municipio',
        filtros.municipio,
      );
    }

    // -----------------------------------------------------
    // SEGMENTO
    // -----------------------------------------------------

    if (filtros.segmento) {
      params = params.set(
        'segmento',
        filtros.segmento,
      );
    }

    // -----------------------------------------------------
    // SITUAÇÃO CADASTRAL
    // -----------------------------------------------------

    if (filtros.situacao) {
      params = params.set(
        'situacao',
        filtros.situacao,
      );
    }

    // -----------------------------------------------------
    // PERÍODO
    // -----------------------------------------------------

    if (filtros.dataInicial) {
      params = params.set(
        'dataInicial',
        filtros.dataInicial,
      );
    }

    if (filtros.dataFinal) {
      params = params.set(
        'dataFinal',
        filtros.dataFinal,
      );
    }

    // -----------------------------------------------------
    // TIPO DA DATA
    // -----------------------------------------------------

    if (filtros.tipoData) {
      params = params.set(
        'tipoData',
        filtros.tipoData,
      );
    }

    return this.http.get<IndicadoresDashboardResponse>(
      `${this.apiUrl}/estatisticas/indicadores`,
      {
        params,
      },
    );
  }


  /* =====================================================
     QUOCIENTE LOCACIONAL
  ===================================================== */

  cocientesLocacionais(
    competencia?: string,
    limite = 10,
  ): Observable<RespostaLocacional> {

    let params = new HttpParams()
      .set('page', '1')
      .set(
        'limit',
        String(limite),
      );

    if (competencia) {
      params = params.set(
        'competencia',
        competencia,
      );
    }

    return this.http.get<RespostaLocacional>(
      `${this.apiUrl}/quociente`,
      {
        params,
      },
    );
  }


  /* =====================================================
     ENDPOINTS ANTIGOS

     Podemos mantê-los porque outras partes do sistema
     podem utilizá-los.
  ===================================================== */

  resumo(): Observable<IndicadoresResumo> {

    return this.http.get<IndicadoresResumo>(
      `${this.apiUrl}/estatisticas/ativas`,
    );
  }


  municipios(): Observable<RespostaMunicipiosIndicadores> {

    return this.http.get<RespostaMunicipiosIndicadores>(
      `${this.apiUrl}/estatisticas/por-municipio`,
    );
  }


  cnaes(): Observable<RespostaCnaesIndicadores> {

    return this.http.get<RespostaCnaesIndicadores>(
      `${this.apiUrl}/estatisticas/por-cnae`,
    );
  }
}
