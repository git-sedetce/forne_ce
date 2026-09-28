import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HistoricoProspeccao } from '../../../interfaces/historico-prospeccao.interface';
import { EmpresaService } from '../../../services/empresa.service';
import { UserService } from '../../../services/user.service';

@Component({
  selector: 'app-historico-prospeccoes',
  standalone: false,
  templateUrl: './historico-prospeccoes.component.html',
  styleUrl: './historico-prospeccoes.component.css',
})
export class HistoricoProspeccoesComponent implements OnInit {
  historicos: HistoricoProspeccao[] = [];
  carregando = false;
  erro = '';
  total = 0;
  pagina = 1;
  pesquisa = '';
  pesquisaAplicada = '';
  readonly limite = 20;
  totalPaginas = 0;
  arquivoBaixandoId: number | null = null;
  readonly administrador: boolean;

  constructor(
    private empresaService: EmpresaService,
    private router: Router,
    userService: UserService,
  ) {
    this.administrador = Number(userService.getUser()?._profile_id) === 1;
  }

  ngOnInit(): void {
    this.carregarHistorico();
  }

  carregarHistorico(): void {
    this.carregando = true;
    this.erro = '';

    this.empresaService
      .listarHistoricoProspeccoes(this.pagina, this.limite, this.pesquisaAplicada)
      .subscribe({
        next: (response) => {
          this.historicos = response.dados;
          this.total = response.total;
          this.totalPaginas = Math.ceil(response.total / response.limite);
          this.carregando = false;
        },
        error: (error) => {
          console.error('Erro ao carregar histórico de prospecções:', error);
          this.erro = 'Não foi possível carregar o histórico de prospecções.';
          this.carregando = false;
        },
      });
  }

  aplicarPesquisa(): void {
    this.pagina = 1;
    this.pesquisaAplicada = this.pesquisa.trim();
    this.carregarHistorico();
  }

  limparPesquisa(): void {
    this.pesquisa = '';
    this.pesquisaAplicada = '';
    this.pagina = 1;
    this.carregarHistorico();
  }

  editarSolicitacao(historico: HistoricoProspeccao): void {
    if (this.administrador) {
      return;
    }

    this.router.navigate(['/consulta-empresas'], {
      state: { editarProspecao: historico },
    });
  }

  mudarPagina(pagina: number): void {
    if (
      pagina < 1 ||
      pagina > this.totalPaginas ||
      pagina === this.pagina ||
      this.carregando
    ) {
      return;
    }

    this.pagina = pagina;
    this.carregarHistorico();
  }

  async baixarArquivo(historico: HistoricoProspeccao): Promise<void> {
    this.arquivoBaixandoId = historico.id;
    this.erro = '';

    try {
      const arquivo = await firstValueFrom(
        this.empresaService.baixarArquivoHistorico(historico.id),
      );
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.download = historico.nome_arquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Erro ao baixar documento do histórico:', error);
      this.erro = 'Não foi possível baixar o documento selecionado.';
    } finally {
      this.arquivoBaixandoId = null;
    }
  }
}
