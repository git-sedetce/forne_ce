import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { jsPDF } from 'jspdf';
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
  // EXPORTAR PDF
  // =====================================================

  exportarPdf(): void {
    if (!this.resumo) {
      return;
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const larguraPagina = pdf.internal.pageSize.getWidth();
    const alturaPagina = pdf.internal.pageSize.getHeight();
    const margem = 15;
    let y = 15;

    // =====================================================
    // CABEÇALHO
    // =====================================================

    y = this.pdfCabecalho(pdf, y, margem, larguraPagina);

    // =====================================================
    // FILTROS
    // =====================================================

    y = this.pdfFiltros(pdf, y, margem, larguraPagina);

    // =====================================================
    // RESUMO
    // =====================================================

    y = this.pdfResumo(pdf, y, margem, larguraPagina);

    // =====================================================
    // SITUAÇÃO CADASTRAL
    // =====================================================

    y = this.verificarEspacoPdf(pdf, y, 52, margem, alturaPagina);
    y = this.pdfSituacoes(pdf, y, margem, larguraPagina);

    // =====================================================
    // MACROSEGMENTOS
    // =====================================================

    y = this.verificarEspacoPdf(pdf, y, 48, margem, alturaPagina);
    y = this.pdfSegmentos(pdf, y, margem, larguraPagina);

    // =====================================================
    // TOP MUNICÍPIOS
    // =====================================================

    y = this.verificarEspacoPdf(pdf, y, 88, margem, alturaPagina);
    y = this.pdfMunicipios(pdf, y, margem, larguraPagina);

    // =====================================================
    // TOP ATIVIDADES
    // =====================================================

    y = this.verificarEspacoPdf(pdf, y, 105, margem, alturaPagina);
    y = this.pdfAtividades(pdf, y, margem, larguraPagina);

    // =====================================================
    // QUOCIENTE LOCACIONAL
    // =====================================================

    if (this.especializacoes.length) {
      y = this.verificarEspacoPdf(pdf, y, 105, margem, alturaPagina);
      this.pdfQuocienteLocacional(pdf, y, margem, larguraPagina);
    }

    // =====================================================
    // RODAPÉ / PAGINAÇÃO
    // =====================================================

    this.pdfAdicionarPaginacao(pdf);

    // =====================================================
    // SALVAR
    // =====================================================

    const competenciaArquivo = this.competencia ? `_${this.competencia}` : '';
    pdf.save(`indicadores_ceara${competenciaArquivo}.pdf`);
  }

  private verificarEspacoPdf(
    pdf: jsPDF,
    y: number,
    alturaNecessaria: number,
    margem: number,
    alturaPagina: number,
  ): number {
    const limiteInferior = alturaPagina - 18;

    if (y + alturaNecessaria > limiteInferior) {
      pdf.addPage();

      return margem;
    }

    return y;
  }

  private pdfCabecalho(
    pdf: jsPDF,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    // Linha institucional

    pdf.setFillColor(4, 62, 76);
    pdf.rect(0, 0, larguraPagina, 7, 'F');

    // Título

    pdf.setTextColor(4, 62, 76);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('Indicadores do Ceará', margem, y + 5);

    // Subtítulo

    pdf.setTextColor(88, 104, 110);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('Observatório Empresarial', margem, y + 11);

    // Competência

    if (this.competencia) {
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(7, 87, 107);
      pdf.text(
        `Competência: ${this.competencia}`,
        larguraPagina - margem,
        y + 5,
        {
          align: 'right',
        },
      );
    }

    // Data de geração

    const agora = new Date();
    const dataGeracao = agora.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(113, 128, 134);
    pdf.setFontSize(7.5);
    pdf.text(`Gerado em ${dataGeracao}`, larguraPagina - margem, y + 11, {
      align: 'right',
    });

    // Separador

    pdf.setDrawColor(229, 234, 236);
    pdf.line(margem, y + 17, larguraPagina - margem, y + 17);
    return y + 24;
  }

  private pdfFiltros(
    pdf: jsPDF,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    const filtros: string[] = [];
    if (this.filtros.regiao) {
      filtros.push(`Região: ${this.filtros.regiao}`);
    }
    if (this.filtros.municipio) {
      filtros.push(`Município: ${this.filtros.municipio}`);
    }
    if (this.filtros.segmento) {
      filtros.push(
        `Macrosegmento: ${this.descricaoSegmento(this.filtros.segmento)}`,
      );
    }
    if (this.filtros.situacao) {
      filtros.push(
        `Situação: ${this.descricaoSituacao(this.filtros.situacao)}`,
      );
    }
    if (this.filtros.dataInicial || this.filtros.dataFinal) {
      filtros.push(`Referência: ${this.descricaoTipoData}`);
    }
    if (this.filtros.dataInicial) {
      filtros.push(
        `Data inicial: ${this.formatarDataPdf(this.filtros.dataInicial)}`,
      );
    }
    if (this.filtros.dataFinal) {
      filtros.push(
        `Data final: ${this.formatarDataPdf(this.filtros.dataFinal)}`,
      );
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(4, 62, 76);
    pdf.text('Filtros aplicados', margem, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(88, 104, 110);
    const texto = filtros.length
      ? filtros.join('  |  ')
      : 'Todos os registros da competência.';
    const linhas = pdf.splitTextToSize(texto, larguraPagina - margem * 2);
    pdf.text(linhas, margem, y + 5);
    return y + 8 + linhas.length * 4;
  }

  private formatarDataPdf(data: string): string {
    if (!data) {
      return '';
    }

    const [ano, mes, dia] = data.split('-');

    if (!ano || !mes || !dia) {
      return data;
    }
    return `${dia}/${mes}/${ano}`;
  }

  private pdfResumo(
    pdf: jsPDF,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    if (!this.resumo) {
      return y;
    }
    y += 3;
    this.pdfTituloSecao(pdf, 'Resumo geral', margem, y);
    y += 6;

    const cards = [
      {
        titulo: 'Empresas',
        valor: this.resumo.empresas,
      },
      {
        titulo: 'Estabelecimentos',
        valor: this.resumo.estabelecimentos,
      },
      {
        titulo: 'Municípios',
        valor: this.resumo.municipios,
      },
      {
        titulo: 'CNAEs',
        valor: this.resumo.cnaes,
      },
      {
        titulo: 'Matrizes',
        valor: this.resumo.matrizes,
      },
      {
        titulo: 'Filiais',
        valor: this.resumo.filiais,
      },
    ];

    const espaco = larguraPagina - margem * 2;
    const gap = 3;
    const larguraCard = (espaco - gap * 2) / 3;
    const alturaCard = 17;

    cards.forEach((card, index) => {
      const coluna = index % 3;
      const linha = Math.floor(index / 3);
      const x = margem + coluna * (larguraCard + gap);
      const cardY = y + linha * (alturaCard + gap);
      pdf.setFillColor(248, 250, 251);
      pdf.setDrawColor(229, 234, 236);
      pdf.roundedRect(x, cardY, larguraCard, alturaCard, 2, 2, 'FD');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(113, 128, 134);
      pdf.text(card.titulo, x + 4, cardY + 5);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(4, 62, 76);
      pdf.text(this.formatarNumero(card.valor), x + 4, cardY + 12);
    });
    return y + alturaCard * 2 + gap + 8;
  }

  private pdfSituacoes(
    pdf: jsPDF,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    this.pdfTituloSecao(pdf, 'Situação cadastral', margem, y);
    y += 7;
    const situacoes = [
      {
        codigo: '02',
        nome: 'Ativas',
      },
      {
        codigo: '08',
        nome: 'Baixadas',
      },
      {
        codigo: '04',
        nome: 'Inaptas',
      },
      {
        codigo: '03',
        nome: 'Suspensas',
      },
      {
        codigo: '01',
        nome: 'Nulas',
      },
    ];

    const larguraDisponivel = larguraPagina - margem * 2;
    const gap = 2;
    const largura = (larguraDisponivel - gap * 4) / 5;

    situacoes.forEach((situacao, index) => {
      const x = margem + index * (largura + gap);
      pdf.setFillColor(248, 250, 251);
      pdf.setDrawColor(229, 234, 236);
      pdf.roundedRect(x, y, largura, 18, 2, 2, 'FD');
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(113, 128, 134);
      pdf.text(situacao.nome, x + 3, y + 5);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(4, 62, 76);
      pdf.text(
        this.formatarNumero(this.quantidadeSituacao(situacao.codigo)),
        x + 3,
        y + 12,
      );
    });
    return y + 26;
  }

  private pdfSegmentos(
    pdf: jsPDF,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    this.pdfTituloSecao(pdf, 'Estabelecimentos por macrosegmento', margem, y);
    y += 7;
    const segmentos = ['COMERCIO', 'INDUSTRIA', 'SERVICOS', 'OUTROS'];
    const larguraDisponivel = larguraPagina - margem * 2;
    const gap = 3;
    const largura = (larguraDisponivel - gap * 3) / 4;
    segmentos.forEach((segmento, index) => {
      const x = margem + index * (largura + gap);
      pdf.setFillColor(234, 244, 246);
      pdf.roundedRect(x, y, largura, 18, 2, 2, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(7, 87, 107);
      pdf.text(this.descricaoSegmento(segmento), x + 3, y + 5);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(
        this.formatarNumero(this.quantidadeSegmento(segmento)),
        x + 3,
        y + 12,
      );
    });
    return y + 26;
  }
  private pdfMunicipios(
    pdf: jsPDF,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    this.pdfTituloSecao(pdf, 'Top 10 municípios', margem, y);
    y += 7;

    const largura = larguraPagina - margem * 2;
    this.pdfCabecalhoTabela(pdf, y, margem, largura, [
      {
        texto: '#',
        x: 0,
      },
      {
        texto: 'Município',
        x: 10,
      },
      {
        texto: 'Empresas',
        x: 110,
      },
      {
        texto: 'Estabelecimentos',
        x: 145,
      },
    ]);
    y += 7;

    this.topMunicipios.forEach((municipio, index) => {
      if (index % 2 === 0) {
        pdf.setFillColor(248, 250, 251);
        pdf.rect(margem, y - 4, largura, 7, 'F');
      }
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(62, 75, 80);
      pdf.text(String(index + 1), margem + 2, y);
      pdf.text(this.formatarNomeMunicipio(municipio.municipio), margem + 10, y);
      pdf.text(
        this.formatarNumero(municipio.quantidade_empresas),
        margem + 130,
        y,
        {
          align: 'right',
        },
      );
      pdf.text(
        this.formatarNumero(municipio.quantidade_estabelecimentos),
        larguraPagina - margem - 2,
        y,
        {
          align: 'right',
        },
      );
      y += 7;
    });
    return y + 5;
  }

  private pdfAtividades(
    pdf: jsPDF,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    this.pdfTituloSecao(pdf, 'Top 10 atividades econômicas', margem, y);
    y += 7;

    const larguraTabela = larguraPagina - margem * 2;
    this.pdfCabecalhoTabela(pdf, y, margem, larguraTabela, [
      {
        texto: '#',
        x: 0,
      },
      {
        texto: 'CNAE',
        x: 10,
      },
      {
        texto: 'Atividade',
        x: 37,
      },
      {
        texto: 'Estabelecimentos',
        x: 145,
      },
    ]);
    y += 7;

    this.topAtividades.slice(0, 10).forEach((atividade, index) => {
      const descricao = pdf.splitTextToSize(atividade.cnae_descricao || '', 98);
      const alturaLinha = Math.max(8, descricao.length * 3.5 + 3);

      if (index % 2 === 0) {
        pdf.setFillColor(248, 250, 251);
        pdf.rect(margem, y - 4, larguraTabela, alturaLinha, 'F');
      }
      pdf.setFontSize(6.7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(62, 75, 80);
      pdf.text(String(index + 1), margem + 2, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(7, 87, 107);
      pdf.text(
        atividade.cnae_formatado || this.formatarCnae(atividade.cnae_codigo),
        margem + 10,
        y,
      );
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(62, 75, 80);
      pdf.text(descricao, margem + 37, y);
      pdf.setFont('helvetica', 'bold');
      pdf.text(
        this.formatarNumero(atividade.quantidade_estabelecimentos),
        larguraPagina - margem - 2,
        y,
        {
          align: 'right',
        },
      );

      y += alturaLinha;
    });

    return y + 5;
  }

  private pdfQuocienteLocacional(
    pdf: jsPDF,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    this.pdfTituloSecao(pdf, 'Quociente Locacional', margem, y);
    y += 7;
    const larguraTabela = larguraPagina - margem * 2;
    this.pdfCabecalhoTabela(pdf, y, margem, larguraTabela, [
      {
        texto: 'Município',
        x: 0,
      },
      {
        texto: 'CNAE',
        x: 48,
      },
      {
        texto: 'Atividade',
        x: 75,
      },
      {
        texto: 'QL',
        x: 165,
      },
    ]);
    y += 7;

    this.especializacoes.slice(0, 10).forEach((item, index) => {
      const descricao = pdf.splitTextToSize(item.cnae_descricao || '', 78);
      const alturaLinha = Math.max(8, descricao.length * 3.5 + 3);

      if (index % 2 === 0) {
        pdf.setFillColor(248, 250, 251);
        pdf.rect(margem, y - 4, larguraTabela, alturaLinha, 'F');
      }
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(62, 75, 80);
      pdf.text(
        this.formatarNomeMunicipio(item.municipio_nome || ''),
        margem,
        y,
      );
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(7, 87, 107);
      pdf.text(this.formatarCnae(item.cnae_codigo), margem + 48, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(62, 75, 80);
      pdf.text(descricao, margem + 75, y);
      pdf.setFont('helvetica', 'bold');
      pdf.text(this.formatarQl(item.cociente_locacional), larguraPagina - margem - 2, y,
        {
          align: 'right',
        },
      );
      y += alturaLinha;
    });

    return y;
  }

  private pdfTituloSecao(
    pdf: jsPDF,
    titulo: string,
    x: number,
    y: number,
  ): void {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(4, 62, 76);
    pdf.text(titulo, x, y);
  }

  private pdfCabecalhoTabela(
    pdf: jsPDF,
    y: number,
    margem: number,
    largura: number,
    colunas: {
      texto: string;
      x: number;
    }[],
  ): void {
    pdf.setFillColor(234, 244, 246);
    pdf.rect(margem, y - 4, largura, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(7, 87, 107);
    colunas.forEach((coluna) => {
      pdf.text(coluna.texto, margem + coluna.x, y);
    });
  }

  private pdfAdicionarPaginacao(pdf: jsPDF): void {
    const totalPaginas = pdf.getNumberOfPages();
    const largura = pdf.internal.pageSize.getWidth();
    const altura = pdf.internal.pageSize.getHeight();
    for (let pagina = 1; pagina <= totalPaginas; pagina++) {
      pdf.setPage(pagina);
      pdf.setDrawColor(229, 234, 236);
      pdf.line(15, altura - 12, largura - 15, altura - 12);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(113, 128, 134);
      pdf.text('Observatório Empresarial do Ceará', 15, altura - 7);
      pdf.text(
        `Página ${pagina} de ${totalPaginas}`,
        largura - 15,
        altura - 7,
        {
          align: 'right',
        },
      );
    }
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
