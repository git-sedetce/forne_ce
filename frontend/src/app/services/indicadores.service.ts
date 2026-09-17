import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  IndicadoresResumo,
  RespostaCnaesIndicadores,
  RespostaLocacional,
  RespostaMunicipiosIndicadores,
} from '../interfaces/indicadores.interface';
import { environment } from '../../environments/environment.development';

@Injectable({
  providedIn: 'root',
})
export class IndicadoresService {
  private readonly apiUrl = environment.apiUrl.replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

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

  cocientesLocacionais(
    competencia?: string,
    limite = 10,
  ): Observable<RespostaLocacional> {
    let params = new HttpParams()
      .set('page', '1')
      .set('limit', String(limite));

    if (competencia) {
      params = params.set('competencia', competencia);
    }

    return this.http.get<RespostaLocacional>(`${this.apiUrl}/quociente`, { params });
  }
}
