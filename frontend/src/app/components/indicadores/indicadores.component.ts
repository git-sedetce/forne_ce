import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import {
  IndicadorCnae,
  IndicadorLocacional,
  IndicadorMunicipio,
  IndicadoresResumo,
} from '../../interfaces/indicadores.interface';
import { IndicadoresService } from '../../services/indicadores.service';

@Component({
  selector: 'app-indicadores',
  standalone: false,
  templateUrl: './indicadores.component.html',
  styleUrl: './indicadores.component.css'
})
export class IndicadoresComponent implements OnInit {
  carregando = true;
  erro = '';
  competencia = '';
  resumo: IndicadoresResumo | null = null;
  municipios: IndicadorMunicipio[] = [];
  totalMunicipios = 0;
  cnaes: IndicadorCnae[] = [];
  especializacoes: IndicadorLocacional[] = [];

  constructor(private indicadoresService: IndicadoresService) {}

  ngOnInit(): void {
    this.carregarIndicadores();
  }

  carregarIndicadores(): void {
    this.carregando = true;
    this.erro = '';

    forkJoin({
      resumo: this.indicadoresService.resumo(),
      municipios: this.indicadoresService.municipios(),
      cnaes: this.indicadoresService.cnaes(),
      cocientes: this.indicadoresService.cocientesLocacionais(),
    }).subscribe({
      next: ({ resumo, municipios, cnaes, cocientes }) => {
        this.resumo = resumo;
        this.municipios = [...(municipios.dados || [])]
          .sort((a, b) => b.quantidade_empresas - a.quantidade_empresas)
          .slice(0, 8);
        this.totalMunicipios = municipios.resumo?.quantidade_municipios || 0;
        this.cnaes = (cnaes.dados || []).slice(0, 10);
        this.especializacoes = (cocientes.dados || []).slice(0, 10);
        this.competencia =
          resumo.competencia || municipios.filtros?.competencia || '';
        this.carregando = false;
      },
      error: (error) => {
        console.error('Erro ao carregar indicadores:', error);
        this.erro =
          error?.error?.message ||
          'Não foi possível carregar os indicadores. Tente novamente.';
        this.carregando = false;
      },
    });
  }

  formatarNumero(valor: number | string | null | undefined): string {
    return new Intl.NumberFormat('pt-BR').format(Number(valor || 0));
  }

  formatarQl(valor: number | string | null | undefined): string {
    return Number(valor || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  formatarCnae(codigo: string): string {
    const valor = String(codigo || '').replace(/\D/g, '');

    return valor.length === 7
      ? valor.replace(/^(\d{2})(\d{2})(\d)(\d{2})$/, '$1.$2-$3-$4')
      : valor;
  }

  maiorQuantidadeMunicipio(): number {
    return Math.max(
      ...this.municipios.map((municipio) => municipio.quantidade_empresas),
      1,
    );
  }

  percentualMunicipio(quantidade: number): number {
    return (quantidade / this.maiorQuantidadeMunicipio()) * 100;
  }

}
