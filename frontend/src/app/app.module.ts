import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HomeComponent } from './components/home/home.component';
import { HeaderComponent } from './components/estrutura/header/header.component';
import { FooterComponent } from './components/estrutura/footer/footer.component';
import { LoginComponent } from './components/admin/login/login.component';
import { RegisterComponent } from './components/admin/register/register.component';
import { ResetSenhaComponent } from './components/admin/reset-senha/reset-senha.component';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgxPaginationModule } from 'ngx-pagination';
import { ToastrModule } from 'ngx-toastr';
import { provideHttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { CpfcnpjMaskDirective } from '../directives/cpfcnpj-mask.directive';
import { CpfCnpjValidacaoDirective } from '../directives/cpfcnpjvalidacao.directive';
import { ListaUsuariosComponent } from './components/admin/lista-usuarios/lista-usuarios.component';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    HeaderComponent,
    FooterComponent,
    LoginComponent,
    RegisterComponent,
    ResetSenhaComponent,
    CpfcnpjMaskDirective,
    CpfCnpjValidacaoDirective,
    ListaUsuariosComponent
  ],
  imports: [
    BrowserModule,
    CommonModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    FormsModule,
    NgxPaginationModule,

    ToastrModule.forRoot({
      positionClass: 'toast-top-right',
      timeOut: 4000,
      preventDuplicates: true,
      progressBar: true,
    }),
  ],
  providers: [ provideHttpClient(), ],
  bootstrap: [AppComponent]
})
export class AppModule { }
