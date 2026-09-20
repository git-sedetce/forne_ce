import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import {
  FiltrosIndicadores,
  IndicadorDashboardMunicipio,
  IndicadorEvolucao,
  IndicadorLocacional,
  IndicadorSegmento,
  IndicadorSituacao,
  IndicadorTopAtividade,
  IndicadoresDashboardResponse,
  IndicadoresDashboardResumo,
  SegmentoIndicador,
  SituacaoIndicador,
  TipoDataIndicador,
} from '../../interfaces/indicadores.interface';
import { IndicadoresService } from '../../services/indicadores.service';

import { MUNICIPIOS_POR_REGIAO } from '../../data/regioes-ce';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'ng-apexcharts';

export interface ChartDonutOptions {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  legend: ApexLegend;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  tooltip: ApexTooltip;
}

export interface ChartBarOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  tooltip: ApexTooltip;
}

export interface ChartLineOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  fill: ApexFill;
  tooltip: ApexTooltip;
}

@Component({
  selector: 'app-indicadores',
  standalone: false,
  templateUrl: './indicadores.component.html',
  styleUrl: './indicadores.component.css',
})
export class IndicadoresComponent implements OnInit {
  // =====================================================
  // ESTADO DA TELA
  // =====================================================

  carregando = false;
  erro = '';

  competencia = '';

  // =====================================================
  // DADOS DO DASHBOARD
  // =====================================================

  resumo: IndicadoresDashboardResumo | null = null;

  situacoes: IndicadorSituacao[] = [];

  segmentos: IndicadorSegmento[] = [];

  municipios: IndicadorDashboardMunicipio[] = [];

  topAtividades: IndicadorTopAtividade[] = [];

  evolucao: IndicadorEvolucao[] = [];

  especializacoes: IndicadorLocacional[] = [];

  // =====================================================
  // FILTROS
  // =====================================================

  filtros: FiltrosIndicadores = {
    uf: 'CE',
    competencia: undefined,
    regiao: '',
    municipio: '',
    municipios: [],
    segmento: '',
    situacao: '',
    dataInicial: '',
    dataFinal: '',
    tipoData: 'INICIO_ATIVIDADE',
  };

  // =====================================================
  // REGIÕES / MUNICÍPIOS
  // =====================================================

  regioes: string[] = Object.keys(MUNICIPIOS_POR_REGIAO);

  municipiosFiltro: string[] = [];

  // =====================================================
  // OPÇÕES - SITUAÇÃO CADASTRAL
  // =====================================================

  situacoesCadastrais: {
    codigo: SituacaoIndicador;
    descricao: string;
  }[] = [
    {
      codigo: '',
      descricao: 'Todas',
    },
    {
      codigo: '02',
      descricao: 'Ativa',
    },
    {
      codigo: '08',
      descricao: 'Baixada',
    },
    {
      codigo: '04',
      descricao: 'Inapta',
    },
    {
      codigo: '03',
      descricao: 'Suspensa',
    },
    {
      codigo: '01',
      descricao: 'Nula',
    },
  ];

  // =====================================================
  // OPÇÕES - SEGMENTOS
  // =====================================================

  segmentosEconomicos: {
    codigo: SegmentoIndicador;
    descricao: string;
  }[] = [
    {
      codigo: '',
      descricao: 'Todos',
    },
    {
      codigo: 'COMERCIO',
      descricao: 'Comércio',
    },
    {
      codigo: 'INDUSTRIA',
      descricao: 'Indústria',
    },
    {
      codigo: 'SERVICOS',
      descricao: 'Serviços',
    },
    {
      codigo: 'OUTROS',
      descricao: 'Outros',
    },
  ];

  // =====================================================
  // OPÇÕES - TIPO DA DATA
  // =====================================================

  tiposData: {
    codigo: TipoDataIndicador;
    descricao: string;
  }[] = [
    {
      codigo: 'INICIO_ATIVIDADE',
      descricao: 'Início da atividade',
    },
    {
      codigo: 'SITUACAO_CADASTRAL',
      descricao: 'Situação cadastral',
    },
  ];

  constructor(private indicadoresService: IndicadoresService) {}

  // =====================================================
  // INIT
  // =====================================================

  ngOnInit(): void {
    this.carregarIndicadores();
  }

  // =====================================================
  // CARREGAR DASHBOARD
  // =====================================================

  carregarIndicadores(): void {
    this.carregando = true;
    this.erro = '';

    const filtrosApi = this.prepararFiltros();

    forkJoin({
      dashboard: this.indicadoresService.dashboard(filtrosApi),

      cocientes: this.indicadoresService.cocientesLocacionais(
        filtrosApi.competencia,
        10,
      ),
    }).subscribe({
      next: ({ dashboard, cocientes }) => {
        this.processarDashboard(dashboard);

        this.especializacoes = (cocientes.dados || []).slice(0, 10);

        this.carregando = false;
      },

      error: (error) => {
        console.error('Erro ao carregar indicadores:', error);

        this.erro =
          error?.error?.message || 'Não foi possível carregar os indicadores.';

        this.carregando = false;
      },
    });
  }

  // =====================================================
  // PROCESSAR RETORNO
  // =====================================================

  private processarDashboard(response: IndicadoresDashboardResponse): void {
    this.resumo = response.resumo;

    this.situacoes = response.situacoes || [];
    this.segmentos = response.segmentos || [];
    this.municipios = response.municipios || [];
    this.topAtividades = response.top_atividades || [];
    this.evolucao = response.evolucao || [];
    this.competencia = response.filtros?.competencia || '';
    if (this.competencia) {
      this.filtros.competencia = this.competencia;
    }
    this.configurarGraficos();
  }

  // =====================================================
  // CONFIGURAÇÃO DOS GRÁFICOS
  // =====================================================

  private configurarGraficos(): void {
    this.configurarGraficoSegmentos();

    this.configurarGraficoSituacoes();

    this.configurarGraficoMunicipios();

    this.configurarGraficoAtividades();

    this.configurarGraficoEvolucao();
  }

  // =====================================================
  // SEGMENTOS
  // =====================================================

  private configurarGraficoSegmentos(): void {
    const ordem = ['COMERCIO', 'INDUSTRIA', 'SERVICOS', 'OUTROS'];

    const labels: string[] = [];
    const series: number[] = [];

    ordem.forEach((codigo) => {
      const item = this.segmentos.find(
        (segmento) => segmento.segmento === codigo,
      );

      if (!item) {
        return;
      }

      labels.push(this.descricaoSegmento(codigo));

      series.push(Number(item.quantidade_estabelecimentos || 0));
    });

    this.chartSegmentos = {
      series,

      labels,
      colors: ['#ff6500', '#07576b', '#2f8615', '#718086'],

      chart: {
        type: 'donut',
        height: 340,
        toolbar: {
          show: false,
        },
      },

      legend: {
        position: 'bottom',
      },

      dataLabels: {
        enabled: true,
        formatter: (valor: number) => `${valor.toFixed(1)}%`,
      },

      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,

              total: {
                show: true,
                label: 'Estabelecimentos',

                formatter: () =>
                  this.formatarNumero(
                    series.reduce((total, valor) => total + valor, 0),
                  ),
              },
            },
          },
        },
      },

      tooltip: {
        y: {
          formatter: (valor: number) => this.formatarNumero(valor),
        },
      },
    };
  }

  // =====================================================
  // SITUAÇÃO CADASTRAL
  // =====================================================

  private configurarGraficoSituacoes(): void {
    const ordem = ['02', '08', '04', '03', '01'];

    const labels: string[] = [];
    const series: number[] = [];

    ordem.forEach((codigo) => {
      const item = this.situacoes.find(
        (situacao) => situacao.codigo === codigo,
      );

      if (!item) {
        return;
      }

      labels.push(this.descricaoSituacao(codigo));

      series.push(Number(item.quantidade_estabelecimentos || 0));
    });

    this.chartSituacoes = {
      series,

      labels,

      chart: {
        type: 'donut',
        height: 340,
        toolbar: {
          show: false,
        },
      },

      legend: {
        position: 'bottom',
      },

      dataLabels: {
        enabled: true,
        formatter: (valor: number) => `${valor.toFixed(1)}%`,
      },

      plotOptions: {
        pie: {
          donut: {
            size: '68%',

            labels: {
              show: true,

              total: {
                show: true,
                label: 'Estabelecimentos',

                formatter: () =>
                  this.formatarNumero(
                    series.reduce((total, valor) => total + valor, 0),
                  ),
              },
            },
          },
        },
      },

      tooltip: {
        y: {
          formatter: (valor: number) => this.formatarNumero(valor),
        },
      },
    };
  }

  // =====================================================
  // MUNICÍPIOS
  // =====================================================

  private configurarGraficoMunicipios(): void {
    const dados = this.topMunicipios;

    this.chartMunicipios = {
      series: [
        {
          name: 'Estabelecimentos',

          data: dados.map((item) =>
            Number(item.quantidade_estabelecimentos || 0),
          ),
        },
      ],

      chart: {
        type: 'bar',
        height: 430,
        toolbar: {
          show: false,
        },
      },

      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 4,
          barHeight: '65%',
        },
      },

      dataLabels: {
        enabled: false,
      },

      xaxis: {
        categories: dados.map((item) =>
          this.formatarNomeMunicipio(item.municipio),
        ),

        labels: {
          formatter: (valor: string) => this.formatarNumero(valor),
        },
      },

      yaxis: {
        labels: {
          maxWidth: 180,
        },
      },

      tooltip: {
        y: {
          formatter: (valor: number) =>
            `${this.formatarNumero(valor)} estabelecimentos`,
        },
      },
    };
  }

  // =====================================================
  // TOP ATIVIDADES
  // =====================================================

  private configurarGraficoAtividades(): void {
    const dados = this.topAtividades.slice(0, 10);

    this.chartAtividades = {
      series: [
        {
          name: 'Estabelecimentos',

          data: dados.map((item) =>
            Number(item.quantidade_estabelecimentos || 0),
          ),
        },
      ],

      chart: {
        type: 'bar',
        height: 430,
        toolbar: {
          show: false,
        },
      },

      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 4,
          barHeight: '65%',
        },
      },

      dataLabels: {
        enabled: false,
      },

      xaxis: {
        categories: dados.map(
          (item) => item.cnae_formatado || this.formatarCnae(item.cnae_codigo),
        ),

        labels: {
          formatter: (valor: string) => this.formatarNumero(valor),
        },
      },

      yaxis: {
        labels: {
          maxWidth: 120,
        },
      },

      tooltip: {
        y: {
          formatter: (valor: number) =>
            `${this.formatarNumero(valor)} estabelecimentos`,
        },
      },
    };
  }

  // =====================================================
  // EVOLUÇÃO
  // =====================================================

  private configurarGraficoEvolucao(): void {
    /*
     * Se o usuário não informou período, limitamos
     * visualmente a série aos últimos 120 meses.
     *
     * Isso não altera a resposta da API.
     */
    let dados = [...this.evolucao];

    if (
      !this.filtros.dataInicial &&
      !this.filtros.dataFinal &&
      dados.length > 120
    ) {
      dados = dados.slice(-120);
    }

    this.chartEvolucao = {
      series: [
        {
          name: 'Estabelecimentos',

          data: dados.map((item) =>
            Number(item.quantidade_estabelecimentos || 0),
          ),
        },
      ],

      chart: {
        type: 'area',
        height: 360,
        toolbar: {
          show: false,
        },
        zoom: {
          enabled: false,
        },
      },

      stroke: {
        curve: 'smooth',
        width: 3,
      },

      fill: {
        type: 'gradient',

        gradient: {
          opacityFrom: 0.35,
          opacityTo: 0.05,
        },
      },

      dataLabels: {
        enabled: false,
      },

      xaxis: {
        categories: dados.map((item) => this.formatarPeriodo(item.periodo)),

        tickAmount: 10,

        labels: {
          rotate: -45,
        },
      },

      yaxis: {
        labels: {
          formatter: (valor: number) => this.formatarNumero(valor),
        },
      },

      tooltip: {
        y: {
          formatter: (valor: number) =>
            `${this.formatarNumero(valor)} estabelecimentos`,
        },
      },
    };
  }

  descricaoSegmento(codigo: string): string {
    const descricoes: Record<string, string> = {
      COMERCIO: 'Comércio',

      INDUSTRIA: 'Indústria',

      SERVICOS: 'Serviços',

      OUTROS: 'Outros',
    };

    return descricoes[codigo] || codigo;
  }

  descricaoSituacao(codigo: string): string {
    const descricoes: Record<string, string> = {
      '01': 'Nula',

      '02': 'Ativa',

      '03': 'Suspensa',

      '04': 'Inapta',

      '08': 'Baixada',
    };

    return descricoes[codigo] || codigo;
  }

  formatarNomeMunicipio(nome: string): string {
    if (!nome) {
      return '';
    }

    return nome
      .toLocaleLowerCase('pt-BR')
      .replace(/(^|\s)\S/g, (letra) => letra.toLocaleUpperCase('pt-BR'));
  }

  // =====================================================
  // PREPARAR FILTROS
  // =====================================================

  private prepararFiltros(): FiltrosIndicadores {
    const filtros: FiltrosIndicadores = {
      uf: this.filtros.uf || 'CE',

      competencia: this.filtros.competencia,

      segmento: this.filtros.segmento || '',

      situacao: this.filtros.situacao || '',

      dataInicial: this.filtros.dataInicial || '',

      dataFinal: this.filtros.dataFinal || '',

      tipoData: this.filtros.tipoData || 'INICIO_ATIVIDADE',
    };

    // -----------------------------------------------------
    // MUNICÍPIO
    // -----------------------------------------------------

    if (this.filtros.municipio) {
      filtros.municipio = this.filtros.municipio;
    }

    // -----------------------------------------------------
    // REGIÃO
    // -----------------------------------------------------

    if (this.filtros.regiao && !this.filtros.municipio) {
      filtros.regiao = this.filtros.regiao;

      filtros.municipios = this.obterMunicipiosRegiao(this.filtros.regiao);
    }

    return filtros;
  }

  // =====================================================
  // ALTERAÇÃO DA REGIÃO
  // =====================================================

  onRegiaoChange(): void {
    this.filtros.municipio = '';

    this.municipiosFiltro = [];

    if (!this.filtros.regiao) {
      return;
    }

    this.municipiosFiltro = this.obterMunicipiosRegiao(this.filtros.regiao);
  }

  // =====================================================
  // MUNICÍPIOS DA REGIÃO
  // =====================================================

  private obterMunicipiosRegiao(regiao: string): string[] {
    if (!regiao) {
      return [];
    }

    const mapa = MUNICIPIOS_POR_REGIAO as Record<string, string[]>;

    return mapa[regiao] ? [...mapa[regiao]] : [];
  }

  // =====================================================
  // APLICAR FILTROS
  // =====================================================

  aplicarFiltros(): void {
    if (
      this.filtros.dataInicial &&
      this.filtros.dataFinal &&
      this.filtros.dataInicial > this.filtros.dataFinal
    ) {
      this.erro = 'A data inicial não pode ser maior que a data final.';

      return;
    }

    this.carregarIndicadores();
  }

  // =====================================================
  // LIMPAR FILTROS
  // =====================================================

  limparFiltros(): void {
    this.filtros = {
      uf: 'CE',

      competencia: this.competencia || undefined,

      regiao: '',

      municipio: '',

      municipios: [],

      segmento: '',

      situacao: '',

      dataInicial: '',

      dataFinal: '',

      tipoData: 'INICIO_ATIVIDADE',
    };

    this.municipiosFiltro = [];

    this.carregarIndicadores();
  }

  // =====================================================
  // TOP MUNICÍPIOS
  // =====================================================

  get topMunicipios(): IndicadorDashboardMunicipio[] {
    return [...this.municipios]
      .sort(
        (a, b) => b.quantidade_estabelecimentos - a.quantidade_estabelecimentos,
      )
      .slice(0, 10);
  }

  // =====================================================
  // TOTAL POR SITUAÇÃO
  // =====================================================

  quantidadeSituacao(codigo: string): number {
    const situacao = this.situacoes.find((item) => item.codigo === codigo);

    return situacao?.quantidade_estabelecimentos || 0;
  }

  // =====================================================
  // TOTAL POR SEGMENTO
  // =====================================================

  quantidadeSegmento(segmento: string): number {
    const item = this.segmentos.find(
      (registro) => registro.segmento === segmento,
    );

    return item?.quantidade_estabelecimentos || 0;
  }

  // =====================================================
  // FORMATADORES
  // =====================================================

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

  formatarPeriodo(periodo: string): string {
    if (!periodo) {
      return '';
    }

    /*
     * Esperado:
     * 2026-08
     */

    const [ano, mes] = periodo.split('-');

    if (!ano || !mes) {
      return periodo;
    }

    return `${mes}/${ano}`;
  }

  // =====================================================
  // LABEL DO PERÍODO
  // =====================================================

  get descricaoTipoData(): string {
    return this.filtros.tipoData === 'SITUACAO_CADASTRAL'
      ? 'Data da situação cadastral'
      : 'Data de início da atividade';
  }

  // =====================================================
  // POSSUI FILTROS?
  // =====================================================

  get possuiFiltrosAtivos(): boolean {
    return !!(
      this.filtros.regiao ||
      this.filtros.municipio ||
      this.filtros.segmento ||
      this.filtros.situacao ||
      this.filtros.dataInicial ||
      this.filtros.dataFinal
    );
  }

  // =====================================================
  // GRÁFICOS
  // =====================================================

  chartSegmentos: Partial<ChartDonutOptions> = {};
  chartSituacoes: Partial<ChartDonutOptions> = {};
  chartMunicipios: Partial<ChartBarOptions> = {};
  chartAtividades: Partial<ChartBarOptions> = {};
  chartEvolucao: Partial<ChartLineOptions> = {};
}
