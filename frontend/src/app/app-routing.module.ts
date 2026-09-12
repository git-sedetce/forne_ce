import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { LoginComponent } from './components/admin/login/login.component';
import { RegisterComponent } from './components/admin/register/register.component';
import { ResetSenhaComponent } from './components/admin/reset-senha/reset-senha.component';
import { ListaUsuariosComponent } from './components/admin/lista-usuarios/lista-usuarios.component';
import { authGuard } from './services/guards/auth.guard';
import { roleGuard } from './services/guards/role.guard';

const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
  },
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'cadastro',
    component: RegisterComponent,
  },
  {
    path: 'reset-senha',
    component: ResetSenhaComponent,
  },
  {
    path: 'lista-usuarios',
    component: ListaUsuariosComponent,
    canActivate: [authGuard, roleGuard],
    data: { roles: [1] },
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
