import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment.development';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Md5 } from 'ts-md5';

interface JwtPayload {
  exp?: number;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {

  private userSubject = new BehaviorSubject<any>(null);
  user$ = this.userSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    this.loadUserFromToken();
  }

  // ------ UTILIDADES ------ //

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private loadUserFromToken(): void {
    if (!this.isBrowser()) {
      return;
    }

    const token = this.getToken();
    if (!token) {
      return;
    }

    try {
      const decoded = jwtDecode(token);
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp && decoded.exp <= now) {
        localStorage.removeItem('access_token');
        this.userSubject.next(null);
        return;
      }

      this.userSubject.next(decoded);
    } catch (error) {
      localStorage.removeItem('access_token');
      this.userSubject.next(null);
    }
  }

  CriptografarMD5(value: string | undefined): string | undefined {
    return Md5.hashStr(value!).toString();
  }

  getToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem('access_token');
  }

  getUser() {
    return this.userSubject.value;
  }

  isLogged(): boolean {
    const user = this.userSubject.value;
    if (!user) {
      return false;
    }
    if (!user.exp) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    return user.exp > now;
  }

  hasRole(roles: number[]): boolean {
    const user = this.getUser();
    return user && roles.includes(user._profile_id);
  }

  getSexec(metodo: string): Observable<any> {
    return this.http.get(environment.apiUrl + metodo);
  }

  consultarEmail(email: string) : Observable<any> {
      return this.http.get(environment.apiUrl + 'checkEmail/' + email)
    }

    cadastrar_users(data:any):Observable<any> {
      return this.http.post(environment.apiUrl + 'register', data)
    }

  // ------ AUTENTICAÇÃO ------ //

  login(data: any): Observable<any> {
    // Transforma o campo email/cpf para o formato esperado pelo backend
    const loginData = this.transformLoginData(data);

    return this.http.post<any>(environment.apiUrl + 'login', loginData).pipe(
      tap((response) => {
        localStorage.setItem('access_token', response.token);
        const decoded = jwtDecode(response.token);
        this.userSubject.next(decoded);
        this.redirecionarPorPerfil();

        // this.router.navigate(['/admin']);
      }),
    );
  }

  redirecionarPorPerfil(): void {
    const user = this.getUser();

    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    switch (Number(user._profile_id)) {
      // Admin
      case 1:
        this.router.navigate(['/admin/admin']);
        break;

      // Gestão
      case 2:
        this.router.navigate(['/admin/admin']);
        break;

      // Suporte
      case 3:
        this.router.navigate(['/admin/admin']);
        break;

      // Supervisão
      case 4:
        this.router.navigate(['/admin/admin']);
        break;

      // Agente
      case 5:
        this.router.navigate(['/admin/admin']);
        break;

      // Conformidade
      case 6:
        this.router.navigate(['/home']);
        break;

      // Cliente
      case 7:
        this.router.navigate(['/credimpacto/editdados']);
        break;

      default:
        this.router.navigate(['/login']);
        break;
    }
  }

  private transformLoginData(data: any): any {
    const transformedData = { ...data };

    // Se o campo é email, mantém como email; se é CPF, transforma para cpf
    if (data.email) {
      const emailOrCpf = data.email;

      // Verifica se é um email (contém @) ou um CPF
      if (emailOrCpf.includes('@')) {
        transformedData.email = emailOrCpf;
        delete transformedData.cpf;
      } else {
        // Se não tem @, assume que é CPF
        transformedData.cpf = emailOrCpf;
        delete transformedData.email;
      }
    }

    return transformedData;
  }

  logout() {
    localStorage.removeItem('access_token');
    this.userSubject.next(null);
    this.router.navigate(['/login']);
  }

  // ------ REQUISIÇÕES ------ //

  resetPin(data: any): Observable<any> {
    // Transforma o campo email/cpf para o formato esperado pelo backend
    const loginData = this.transformLoginData(data);
    return this.http.post(environment.apiUrl + 'newPin', loginData);
  }
}
function jwtDecode(token: string): JwtPayload {
  throw new Error('Function not implemented.');
}

