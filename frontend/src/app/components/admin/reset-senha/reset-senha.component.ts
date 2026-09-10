import { Component, OnInit, ViewChild } from '@angular/core';
import { NgForm } from '@angular/forms';
import { User } from '../../../models/user.model';
import { UserService } from '../../../services/user.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-reset-senha',
  standalone: false,
  templateUrl: './reset-senha.component.html',
  styleUrl: './reset-senha.component.css'
})
export class ResetSenhaComponent implements OnInit {
  @ViewChild("resetForm") resetForm!: NgForm;
  resetSenha!: User;
  mostrarSenha = false;

  constructor(
    private serviceUser: UserService,
    private router: Router,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    this.resetSenha = new User();
  }

  dados = {
    identificacao: '',
    pin: '',
    novaSenha: ''
  };

  salvarSenha(): void {
    this.serviceUser.reset_password(this.resetSenha).subscribe({
      next:(res:any) => {
        this.toastr.success('Senha alterada com sucesso!!!')
        this.router.navigate(['/login'])
      },error: (e) => {
        console.error(e)
        this.toastr.error(e.error.message)
        this.resetForm.reset()
      }
    })
  }


  // salvarSenha(): void {

  //   console.log(
  //     'Redefinição:',
  //     this.dados
  //   );

  // }

}
