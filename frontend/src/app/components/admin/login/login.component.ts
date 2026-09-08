import { Component } from '@angular/core';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  mostrarSenha = false;

  modalEsqueciSenha = false;

  emailRecuperacao = '';

  credenciais = {
    login: '',
    password: ''
  };


  login(): void {

    console.log('Login:', this.credenciais);

  }


  abrirModalEsqueciSenha(): void {

    this.modalEsqueciSenha = true;

  }


  fecharModalEsqueciSenha(): void {

    this.modalEsqueciSenha = false;

  }


  recuperarSenha(): void {

    if (!this.emailRecuperacao) {
      return;
    }

    console.log(
      'Recuperar senha:',
      this.emailRecuperacao
    );

    this.fecharModalEsqueciSenha();

  }

}
