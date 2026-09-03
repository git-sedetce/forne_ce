import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  RespostaCnaes,
  RespostaMunicipios,
} from '../interfaces/dashboard.interface';
import { environment } from '../../environments/environment.development';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly apiUrl = `${environment.apiUrl}/empresas`;

  constructor(private http: HttpClient) {}



  empresasPorMunicipio() : Observable<any> {
      return this.http.get(environment.apiUrl + 'estatisticas/por-municipio')
    }

  cnaesMaisUtilizados() : Observable<any> {
      return this.http.get(environment.apiUrl + 'estatisticas/por-cnae')
    }


}
