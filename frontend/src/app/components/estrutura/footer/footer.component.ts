import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  standalone: false,
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.css'
})
export class FooterComponent {
  readonly anoAtual = new Date().getFullYear();

  get exibirLogosInstitucionais(): boolean {
    const hoje = new Date();
    const dataExibicao = new Date(2026, 10, 1);

    hoje.setHours(0, 0, 0, 0);
    dataExibicao.setHours(0, 0, 0, 0);

    return hoje >= dataExibicao;
  }

}
