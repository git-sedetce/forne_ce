import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent implements OnInit {
  @ViewChild('cadastroForm') cadastroForm!: NgForm;
  user!: User;

  mostrarSenha = false;
  mostrarConfirmacao = false;
  passwordPtn = '^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{8,}$';
  lista_sexec!: any[];
  sexec!: any;

  constructor(
    private serviceUser: UserService,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.user = new User();
    this.listarSecretaria();
  }

  listarSecretaria() {
    this.serviceUser.getSexec('takeSexec').subscribe(
      (res: any) => {
        this.lista_sexec = res;
        console.log(this.lista_sexec);
      },
      (erro: any) => console.error(erro),
    );
  }

  consultaEmail(email: any, form: any) {
    this.serviceUser.consultarEmail(email).subscribe((res: any) => {
      if (res.mensagem === 'Email já cadastrado!') {
        this.toastr.error(res.mensagem);
        this.user.user_email = '';
      }
    });
  }

  cadastrar(): void {
    this.user.user_password = this.serviceUser.CriptografarMD5(
      this.user.user_password,
    );
    this.user.confirm_password = this.serviceUser.CriptografarMD5(
      this.user.confirm_password,
    );

    this.serviceUser.cadastrar_users(this.user).subscribe({
      next: (res: any) => {
        this.user.id = res.id;
        this.toastr.success('Usuário cadastrado com sucesso!!!');
        this.router.navigate(['/login']);
        // this.saveRegister(this.user.user_name, 'Cadastro de novo usuário');
      },
      error: (e: any) => {
        console.error(e);
        this.toastr.error('Problemas ao realizar o cadastro!');
        this.cadastroForm.reset();
      },
    });
  }
}
