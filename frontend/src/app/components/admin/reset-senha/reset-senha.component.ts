import { Component } from '@angular/core';

@Component({
  selector: 'app-reset-senha',
  standalone: false,
  templateUrl: './reset-senha.component.html',
  styleUrl: './reset-senha.component.css'
})
export class ResetSenhaComponent {
  mostrarSenha = false;

  dados = {
    identificacao: '',
    pin: '',
    novaSenha: ''
  };


  salvarSenha(): void {

    console.log(
      'Redefinição:',
      this.dados
    );

  }

}
