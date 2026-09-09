import { Component, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { LoginUser } from '../../../models/login-user.model';
import { UserService } from '../../../services/user.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  @ViewChild("loginForm") loginForm!: NgForm;
  loginUsers!: LoginUser;

  mostrarSenha = false;
  modalEsqueciSenha = false;
  emailRecuperacao = '';

  constructor(
    private userService: UserService,
    private toastr: ToastrService
  ){}

  ngOnInit(): void {
    this.loginUsers = new LoginUser('', '');
  }

  login(): void {
    console.log('loginUser', this.loginUsers)
    this.userService.login(this.loginUsers).subscribe({
      next: (res) => res,
      error: (e) => (this.toastr.error(e.error.message), this.loginForm.reset())
    })

  }

  gerarPin(){
    this.userService.resetPin(this.loginUsers).subscribe(
      () =>{
        this.toastr.success('Verifique seu Email');
        this.loginForm.reset();
      },
      (error) => {
        this.toastr.error('Erro durante o processo', error.error.message);
        this.loginForm.reset();
      }
    );

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
