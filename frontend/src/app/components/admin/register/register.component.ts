import { Component } from '@angular/core';

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
   mostrarSenha = false;
  mostrarConfirmacao = false;

  usuario = {
    nome_representante: '',
    cpf_cnpj: '',
    user_email: '',
    user_password: '',
    user_confirm_password: '',
    secretaria_executiva_id: ''
  };

  secretarias_executivas: any[] = [
    {
      id: 1,
      nome: 'Secretaria Executiva de Comércio, Serviços e Inovação'
    },
    {
      id: 2,
      nome: 'Secretaria Executiva da Indústria'
    }
  ];

  cadastrar(): void {

    if (
      this.usuario.user_password !==
      this.usuario.user_confirm_password
    ) {
      console.error('As senhas não conferem.');
      return;
    }

    console.log(this.usuario);
  }

}
