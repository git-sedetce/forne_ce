import { Component, OnInit, ViewChild } from '@angular/core';
import { UserService } from '../../../services/user.service';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { User } from '../../../models/user.model';
import { NgForm } from '@angular/forms';

@Component({
  selector: 'app-first-login',
  standalone: false,
  templateUrl: './first-login.component.html',
  styleUrl: './first-login.component.css'
})
export class FirstLoginComponent implements OnInit {
  @ViewChild("resetForm") loginForm!: NgForm;
  loginUsers!: User;
  mostrarSenha = false;

  constructor(
    private serviceUser: UserService,
    private router: Router,
    private toastr: ToastrService
  ) { }

  ngOnInit(): void {
    this.loginUsers = new User();
  }

  dados = {
    identificacao: '',
    pin: '',
    novaSenha: ''
  };

  firstLogin(): void {
    // console.log('loginUser', this.loginUsers)
    this.serviceUser.primeirologin(this.loginUsers).subscribe({
      next: (res) => res,
      // error: (e) => (console.error('error', e), this.loginForm.reset())
      error: (e) => (this.toastr.error(e.error.message), console.error('error', e), this.loginForm.reset())
    })

  }

}
