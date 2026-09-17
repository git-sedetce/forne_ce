import { Component, OnInit } from '@angular/core';
import { EmpresaCnae } from '../../../interfaces/empresa-cnae.interface';
import { EmpresaService } from '../../../services/empresa.service';
import { Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  finalize,
  switchMap,
  tap,
} from 'rxjs/operators';
import { jsPDF } from 'jspdf';
import { MUNICIPIOS_POR_REGIAO } from '../../../data/regioes-ce';
import { CnaeItem } from '../../../interfaces/cnae.interface';
import { EmpresasPesquisaResponse } from '../../../interfaces/empresa-pesquisa.interface';

@Component({
  selector: 'app-consulta-empresas',
  standalone: false,
  templateUrl: './consulta-empresas.component.html',
  styleUrl: './consulta-empresas.component.css',
})
export class ConsultaEmpresasComponent implements OnInit {
  // =====================================================
  // FILTROS
  // =====================================================

  cnae = '';
  municipio = '';
  uf = 'CE';

  empresas: EmpresaCnae[] = [];

  carregando = false;
  pesquisou = false;
  gerandoDocumento = false;
  atividadePesquisada = false;

  mensagemErro = '';
  mensagemErroModal = '';

  pagina = 1;
  limite = 20;

  totalItens = 0;
  totalPaginas = 0;

  cnaeFormatado = '';
  cnaeDescricao = '';
  competencia = '';

  regiao = '';
  porte = '';
  municipiosFiltrados: string[] = [];

  readonly portes: Record<string, string> = {
    '00': 'Não informado',
    '01': 'Micro Empresa',
    '03': 'Empresa de Pequeno Porte',
    '05': 'Demais Empresas',
  };

  get porteDescricao(): string {
    return this.porte ? this.portes[this.porte] || this.porte : '';
  }

  get possuiCnae(): boolean {
    return !!this.cnae;
  }

  get possuiFiltrosGeograficos(): boolean {
    return !!this.regiao || !!this.municipio;
  }

  // =====================================================
  // ATIVIDADE ECONÔMICA / CNAE
  // =====================================================

  atividadePesquisa = '';
  atividadesFiltradas: CnaeItem[] = [];
  mostrarAtividades = false;
  carregandoAtividades = false;
  atividadeSelecionada: CnaeItem | null = null;

  // =====================================================
  // REGIÕES DO CEARÁ
  // =====================================================

  readonly regioes: string[] = [
    'Cariri',
    'Centro Sul',
    'Grande Fortaleza',
    'Litoral Leste',
    'Litoral Norte',
    'Litoral Oeste/Vale do Curu',
    'Maciço do Baturité',
    'Serra da Ibiapaba',
    'Sertão Central',
    'Sertão de Canindé',
    'Sertão de Sobral',
    'Sertão do Crateús',
    'Sertão dos Inhamus',
    'Vale do Jaguaribe',
  ];

  readonly municipiosPorRegiao = MUNICIPIOS_POR_REGIAO;

  onRegiaoChange(): void {
    this.municipio = '';
    this.mensagemErro = '';

    if (!this.regiao) {
      this.municipiosFiltrados = Object.values(this.municipiosPorRegiao)
        .flat()
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

      return;
    }

    this.municipiosFiltrados = [
      ...(this.municipiosPorRegiao[this.regiao] || []),
    ];
  }

  // =====================================================
  // EMPRESAS SELECIONADAS
  // =====================================================

  empresasSelecionadas = new Map<string, EmpresaCnae>();

  readonly limiteSelecao = 10;

  // =====================================================
  // MODAL PREPARAR CONTATO
  // =====================================================

  modalContatoAberto = false;
  assuntoProspeccao = '';
  servicoProjeto = '';
  responsavelContato = '';
  cargoFuncao = '';
  telefoneContato = '';
  emailContato = '';
  dataLimiteRetorno = '';
  observacoesContato = '';

  get exibirLogosInstitucionais(): boolean {
    const hoje = new Date();
    const dataExibicao = new Date(2026, 10, 1);

    hoje.setHours(0, 0, 0, 0);
    dataExibicao.setHours(0, 0, 0, 0);

    return hoje >= dataExibicao;
  }

  private atividadeSubject = new Subject<string>();

  constructor(private empresaService: EmpresaService) {}

  ngOnInit(): void {
    this.onRegiaoChange();

    this.atividadeSubject
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),

        tap(() => {
          this.carregandoAtividades = true;
          this.atividadePesquisada = false;
        }),

        switchMap((termo) =>
          this.empresaService.listarCnaes(1, 20, termo).pipe(
            finalize(() => {
              this.carregandoAtividades = false;
            }),
          ),
        ),
      )
      .subscribe({
        next: (response) => {
          this.atividadesFiltradas = response.dados;
          this.atividadePesquisada = true;
          this.mostrarAtividades = response.dados.length > 0;
        },

        error: (error) => {
          console.error('Erro ao pesquisar atividades:', error);
          this.atividadesFiltradas = [];
          this.mostrarAtividades = false;
        },
      });
  }

  // =====================================================
  // CONSULTA
  // =====================================================

  pesquisar(): void {
    this.mensagemErro = '';

    const cnaeLimpo = this.limparCnae(this.cnae);

    // CNAE é opcional, mas se informado
    // precisa conter exatamente 7 dígitos.
    if (cnaeLimpo && cnaeLimpo.length !== 7) {
      this.mensagemErro = 'O CNAE deve conter 7 números.';

      return;
    }

    this.cnae = cnaeLimpo;

    // É obrigatório pelo menos um critério.
    if (!this.cnae && !this.regiao && !this.municipio && !this.porte) {
      this.mensagemErro =
        'Informe pelo menos um filtro para realizar a pesquisa.';

      return;
    }

    // Nova pesquisa sempre começa na página 1.
    this.pagina = 1;

    // Empresas de uma pesquisa anterior não devem
    // permanecer selecionadas em uma nova consulta.
    this.empresasSelecionadas.clear();

    // Fecha o autocomplete.
    this.mostrarAtividades = false;
    this.atividadesFiltradas = [];

    this.buscarEmpresas();
  }

  buscarEmpresas(): void {
    this.carregando = true;
    this.mensagemErro = '';

    const municipiosDaRegiao =
      this.regiao && !this.municipio
        ? this.municipiosPorRegiao[this.regiao] || []
        : [];

    this.empresaService
      .pesquisarEmpresas(this.pagina, this.limite, {
        cnae: this.cnae || undefined,
        uf: this.uf,
        regiao: this.regiao || undefined,
        municipio: this.municipio || undefined,
        porte: this.porte || undefined,
        municipios: municipiosDaRegiao,
      })
      .pipe(
        finalize(() => {
          this.carregando = false;
        }),
      )
      .subscribe({
        next: (response: EmpresasPesquisaResponse) => {
          this.pesquisou = true;

          this.empresas = response.dados;
          this.pagina = response.paginacao.pagina;
          this.limite = response.paginacao.limite;
          this.totalItens = response.paginacao.total_itens;
          this.totalPaginas = response.paginacao.total_paginas;
          this.competencia = response.filtros.competencia;

          // ===============================================
          // CNAE
          // ===============================================

          if (response.filtros.cnae) {
            this.cnae = response.filtros.cnae;

            this.cnaeFormatado = response.filtros.cnae_formatado || this.cnae;

            /*
             * Quando o CNAE foi escolhido pelo autocomplete,
             * a descrição já estará preenchida.
             *
             * Caso tenha sido digitado manualmente, podemos
             * aproveitar o primeiro resultado.
             */
            if (!this.cnaeDescricao && response.dados.length > 0) {
              this.cnaeDescricao = response.dados[0].cnae_principal_descricao;
            }
          } else {
            this.cnaeFormatado = '';
            this.cnaeDescricao = '';
          }
        },

        error: (error) => {
          console.error('Erro ao consultar empresas:', error);

          this.empresas = [];
          this.pesquisou = true;

          this.totalItens = 0;
          this.totalPaginas = 0;

          this.mensagemErro =
            error?.error?.message || 'Não foi possível consultar as empresas.';
        },
      });
  }

  empresaPodeSerSelecionada(cnpj: string): boolean {
    return (
      this.empresaSelecionada(cnpj) ||
      this.quantidadeSelecionadas < this.limiteSelecao
    );
  }

  mudarPagina(novaPagina: number): void {
    if (
      novaPagina < 1 ||
      novaPagina > this.totalPaginas ||
      novaPagina === this.pagina ||
      this.carregando
    ) {
      return;
    }

    this.pagina = novaPagina;
    this.buscarEmpresas();
  }

  trackByEmpresa(index: number, empresa: EmpresaCnae): string {
    return empresa.cnpj;
  }

  mudarLimite(): void {
    this.pagina = 1;
    this.buscarEmpresas();
  }

  limparPesquisa(): void {
    // ==========================================
    // FILTROS
    // ==========================================

    this.limparFiltroCnae();
    this.regiao = '';
    this.municipio = '';
    this.porte = '';
    this.uf = 'CE';
    this.onRegiaoChange();

    // ==========================================
    // RESULTADO
    // ==========================================

    this.empresas = [];
    this.pesquisou = false;
    this.carregando = false;
    this.pagina = 1;
    this.limite = 20;
    this.totalItens = 0;
    this.totalPaginas = 0;
    this.competencia = '';

    // ==========================================
    // SELEÇÃO
    // ==========================================

    this.empresasSelecionadas.clear();

    // ==========================================
    // MENSAGENS
    // ==========================================

    this.mensagemErro = '';
  }

  private limparFiltroCnae(): void {
    this.cnae = '';
    this.cnaeFormatado = '';
    this.cnaeDescricao = '';

    this.atividadePesquisa = '';
    this.atividadeSelecionada = null;

    this.atividadesFiltradas = [];
    this.mostrarAtividades = false;
    this.carregandoAtividades = false;
  }

  // =====================================================
  // SELEÇÃO
  // =====================================================

  selecionarEmpresa(empresa: EmpresaCnae, event: Event): void {
    const input = event.target as HTMLInputElement;

    if (input.checked) {
      if (this.empresasSelecionadas.size >= this.limiteSelecao) {
        input.checked = false;

        this.mensagemErro = `Você pode selecionar no máximo ${this.limiteSelecao} empresas.`;

        return;
      }

      this.empresasSelecionadas.set(empresa.cnpj, empresa);

      this.mensagemErro = '';
    } else {
      this.empresasSelecionadas.delete(empresa.cnpj);
    }
  }

  empresaSelecionada(cnpj: string): boolean {
    return this.empresasSelecionadas.has(cnpj);
  }

  removerSelecionada(cnpj: string): void {
    this.empresasSelecionadas.delete(cnpj);

    /*
     * Se o modal estiver aberto e o usuário
     * remover todas as empresas, fecha o modal.
     */
    if (this.modalContatoAberto && this.quantidadeSelecionadas === 0) {
      this.fecharModalContato();
    }
  }

  limparSelecao(): void {
    this.empresasSelecionadas.clear();

    this.fecharModalContato();
  }

  get selecionadas(): EmpresaCnae[] {
    return Array.from(this.empresasSelecionadas.values());
  }

  get quantidadeSelecionadas(): number {
    return this.empresasSelecionadas.size;
  }

  get percentualSelecao(): number {
    return (this.quantidadeSelecionadas / this.limiteSelecao) * 100;
  }

  filtrarAtividades(): void {
    const termo = this.atividadePesquisa.trim();

    // Se havia uma atividade selecionada e o usuário
    // começou a editar o texto, a seleção anterior
    // deixa de ser válida.
    if (this.atividadeSelecionada) {
      const textoSelecionado = `${this.atividadeSelecionada.codigo_formatado} - ${this.atividadeSelecionada.descricao}`;

      if (termo !== textoSelecionado) {
        this.atividadeSelecionada = null;

        this.cnae = '';
        this.cnaeFormatado = '';
        this.cnaeDescricao = '';
      }
    }

    if (termo.length < 2) {
      this.atividadesFiltradas = [];
      this.mostrarAtividades = false;
      this.carregandoAtividades = false;

      return;
    }

    this.atividadeSubject.next(termo);
  }

  selecionarAtividade(atividade: CnaeItem): void {
    this.atividadeSelecionada = atividade;
    this.cnae = atividade.codigo;
    this.cnaeFormatado = atividade.codigo_formatado;
    this.cnaeDescricao = atividade.descricao;
    this.atividadePesquisa = `${atividade.codigo_formatado} - ${atividade.descricao}`;
    this.atividadesFiltradas = [];
    this.mostrarAtividades = false;
    this.mensagemErro = '';
  }

  onCnaeInput(): void {
    const cnaeAtual = this.limparCnae(this.cnae);

    if (
      this.atividadeSelecionada &&
      cnaeAtual !== this.atividadeSelecionada.codigo
    ) {
      this.atividadeSelecionada = null;
      this.atividadePesquisa = '';

      this.cnaeFormatado = '';
      this.cnaeDescricao = '';

      this.atividadesFiltradas = [];
      this.mostrarAtividades = false;
    }

    this.mensagemErro = '';
  }

  abrirListaAtividades(): void {
    if (this.atividadePesquisa.trim().length >= 2) {
      this.filtrarAtividades();
    }
  }

  // =====================================================
  // MODAL
  // =====================================================

  abrirModalContato(): void {
    if (!this.quantidadeSelecionadas) {
      this.mensagemErro =
        'Selecione pelo menos uma empresa para preparar o contato.';

      return;
    }

    this.mensagemErro = '';
    this.mensagemErroModal = '';
    this.modalContatoAberto = true;
  }

  fecharModalContato(): void {
    if (this.gerandoDocumento) {
      return;
    }

    this.modalContatoAberto = false;
    this.mensagemErroModal = '';
  }

  fecharModalBackdrop(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.classList.contains('contact-modal-backdrop')) {
      this.fecharModalContato();
    }
  }

  private validarFormularioContato(): boolean {
    this.mensagemErroModal = '';

    if (!this.quantidadeSelecionadas) {
      this.mensagemErroModal = 'Selecione pelo menos uma empresa.';
      return false;
    }

    if (!this.assuntoProspeccao.trim()) {
      this.mensagemErroModal = 'Informe o assunto da prospecção.';

      return false;
    }

    if (!this.servicoProjeto.trim()) {
      this.mensagemErroModal = 'Informe o serviço, projeto ou demanda.';

      return false;
    }

    if (!this.responsavelContato.trim()) {
      this.mensagemErroModal = 'Informe o responsável pelo contato.';

      return false;
    }

    if (!this.emailContato.trim()) {
      this.mensagemErroModal = 'Informe o e-mail para contato.';

      return false;
    }

    if (!this.emailValido(this.emailContato)) {
      this.mensagemErroModal = 'Informe um e-mail válido.';

      return false;
    }

    return true;
  }

  private obterCriteriosConsulta(): Array<{
    label: string;
    valor: string;
    descricao?: string;
  }> {
    const criterios: Array<{
      label: string;
      valor: string;
      descricao?: string;
    }> = [];

    // CNAE / ATIVIDADE ECONÔMICA
    if (this.cnae) {
      criterios.push({
        label: 'CNAE',
        valor: this.cnaeFormatado || this.formatarCnae(this.cnae),
        descricao: this.cnaeDescricao || undefined,
      });
    }

    // REGIÃO
    if (this.regiao) {
      criterios.push({
        label: 'Região',
        valor: this.regiao,
      });
    }

    // MUNICÍPIO
    if (this.municipio) {
      criterios.push({
        label: 'Município',
        valor: `${this.municipio}/${this.uf}`,
      });
    }

    // PORTE
    if (this.porte) {
      criterios.push({
        label: 'Porte',
        valor: this.porteDescricao || this.porte,
      });
    }

    return criterios;
  }

  async gerarDocumentoPeloModal(): Promise<void> {
    if (this.gerandoDocumento) {
      return;
    }

    if (!this.validarFormularioContato()) {
      return;
    }

    this.gerandoDocumento = true;
    this.mensagemErroModal = '';

    try {
      const gerado = await this.gerarDocumento();

      if (gerado) {
        this.fecharModalContato();
      }
    } finally {
      this.gerandoDocumento = false;
    }
  }

  limparFormularioContato(): void {
    this.assuntoProspeccao = '';
    this.servicoProjeto = '';

    this.responsavelContato = '';
    this.cargoFuncao = '';

    this.telefoneContato = '';
    this.emailContato = '';

    this.dataLimiteRetorno = '';

    this.observacoesContato = '';
  }

  // =====================================================
  // PAGINAÇÃO
  // =====================================================

  get paginasVisiveis(): number[] {
    if (!this.totalPaginas) {
      return [];
    }

    const paginas: number[] = [];

    let inicio = Math.max(this.pagina - 2, 1);

    let fim = Math.min(inicio + 4, this.totalPaginas);

    if (fim - inicio < 4) {
      inicio = Math.max(fim - 4, 1);
    }

    for (let pagina = inicio; pagina <= fim; pagina++) {
      paginas.push(pagina);
    }

    return paginas;
  }

  // =====================================================
  // FORMATAÇÃO
  // =====================================================

  formatarCnae(valor: string): string {
    const numeros = this.limparCnae(valor);

    if (numeros.length !== 7) {
      return valor;
    }

    return numeros.replace(/^(\d{2})(\d{2})(\d)(\d{2})$/, '$1.$2-$3-$4');
  }

  formatarCnpj(cnpj: string): string {
    if (!cnpj) {
      return '-';
    }

    const numeros = cnpj.replace(/\D/g, '');

    if (numeros.length !== 14) {
      return cnpj;
    }

    return numeros.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5',
    );
  }

  formatarTelefone(ddd: string | null, telefone: string | null): string {
    if (!telefone) {
      return 'Não informado';
    }

    const numero = telefone.replace(/\D/g, '');

    const dddFormatado = ddd ? `(${ddd}) ` : '';

    if (numero.length === 9) {
      return dddFormatado + numero.replace(/^(\d{5})(\d{4})$/, '$1-$2');
    }

    if (numero.length === 8) {
      return dddFormatado + numero.replace(/^(\d{4})(\d{4})$/, '$1-$2');
    }

    return dddFormatado + numero;
  }

  formatarCep(cep: string | null): string {
    if (!cep) {
      return '';
    }

    const numeros = cep.replace(/\D/g, '');

    if (numeros.length !== 8) {
      return cep;
    }

    return numeros.replace(/^(\d{5})(\d{3})$/, '$1-$2');
  }

  formatarDataBrasileira(data: string): string {
    if (!data) {
      return 'Não informada';
    }

    const partes = data.split('-');

    if (partes.length !== 3) {
      return data;
    }

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  enderecoCompleto(empresa: EmpresaCnae): string {
    const endereco: string[] = [];

    const logradouro = [empresa.tipo_logradouro, empresa.logradouro]
      .filter(Boolean)
      .join(' ');

    if (logradouro) {
      endereco.push(logradouro);
    }

    if (empresa.numero) {
      endereco.push(empresa.numero);
    }

    if (empresa.complemento) {
      endereco.push(empresa.complemento);
    }

    if (empresa.bairro) {
      endereco.push(empresa.bairro);
    }

    if (empresa.municipio) {
      endereco.push(`${empresa.municipio}/${empresa.uf}`);
    }

    if (empresa.cep) {
      endereco.push(`CEP ${this.formatarCep(empresa.cep)}`);
    }

    return endereco.join(', ') || 'Endereço não informado';
  }

  // =====================================================
  // PDF
  // =====================================================

  async gerarDocumento(): Promise<boolean> {
    if (!this.quantidadeSelecionadas) {
      this.mensagemErroModal =
        'Selecione pelo menos uma empresa para gerar o documento.';

      return false;
    }

    try {
      // ===================================================
      // CARREGAR LOGOS
      // ===================================================

      const [logoFornece, logoSde] = this.exibirLogosInstitucionais
        ? await Promise.all([
            this.carregarImagemBase64(
              'assets/imgs/logo-fornece-horizontal.png',
            ),
            this.carregarImagemBase64('assets/imgs/Logo-SDE---Horizontal.png'),
          ])
        : [null, null];

      // ===================================================
      // CRIAR PDF
      // ===================================================

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const larguraPagina = doc.internal.pageSize.getWidth();
      const alturaPagina = doc.internal.pageSize.getHeight();
      const margem = 18;
      const limiteInferiorConteudo = alturaPagina - 25;
      const larguraConteudo = larguraPagina - margem * 2;
      const dataEmissao = new Intl.DateTimeFormat('pt-BR').format(new Date());
      const criteriosConsulta = this.obterCriteriosConsulta();

      // ===================================================
      // PÁGINA 1 - CAPA / RESUMO
      // ===================================================

      let y = this.adicionarCabecalhoPdf(doc, logoFornece, logoSde);

      // ===================================================
      // TÍTULO
      // ===================================================

      y += 5;

      doc.setTextColor(7, 72, 90);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.text('DOCUMENTO DE PROSPECÇÃO', larguraPagina / 2, y, {
        align: 'center',
      });

      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(90, 105, 110);
      doc.text('Programa ForneCE', larguraPagina / 2, y, {
        align: 'center',
      });

      y += 5;

      doc.setFontSize(8.5);
      doc.text(
        'Fortalecendo a cadeia produtiva e aproximando empresas e oportunidades no Ceará',
        larguraPagina / 2,
        y,
        {
          align: 'center',
        },
      );

      y += 14;

      // ===================================================
      // CARD - OBJETO DA PROSPECÇÃO
      // ===================================================

      const assunto = doc.splitTextToSize(
        this.assuntoProspeccao,
        larguraConteudo - 12,
      );

      const servico = doc.splitTextToSize(
        this.servicoProjeto,
        larguraConteudo - 12,
      );

      const alturaObjeto =
        20 + assunto.length * 4.5 + servico.length * 4.5 + 12;

      doc.setFillColor(247, 251, 252);
      doc.setDrawColor(214, 226, 229);
      doc.roundedRect(margem, y, larguraConteudo, alturaObjeto, 3, 3, 'FD');

      // título da seção

      doc.setTextColor(7, 88, 107);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('OBJETO DA PROSPECÇÃO', margem + 6, y + 8);
      let yObjeto = y + 15;
      // assunto
      doc.setTextColor(120, 135, 140);
      doc.setFontSize(7);
      doc.text('ASSUNTO', margem + 6, yObjeto);
      yObjeto += 4;
      doc.setTextColor(40, 60, 66);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(assunto, margem + 6, yObjeto);
      yObjeto += assunto.length * 4.5;
      yObjeto += 5;
      // serviço / projeto
      doc.setTextColor(120, 135, 140);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('SERVIÇO / PROJETO / DEMANDA', margem + 6, yObjeto);
      yObjeto += 4;
      doc.setTextColor(45, 63, 68);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(servico, margem + 6, yObjeto);
      y += alturaObjeto + 8;

      // ===================================================
      // RESPONSÁVEL PELO CONTATO
      // ===================================================

      doc.setTextColor(7, 72, 90);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Responsável pelo contato', margem, y);
      y += 7;
      const larguraColuna = (larguraConteudo - 8) / 2;

      // ---------------------------------------------------
      // NOME
      // ---------------------------------------------------

      doc.setTextColor(125, 138, 142);
      doc.setFontSize(7);
      doc.text('RESPONSÁVEL', margem, y);
      doc.text('CARGO / FUNÇÃO', margem + larguraColuna + 8, y);
      y += 4;
      doc.setTextColor(40, 58, 63);
      doc.setFontSize(9);
      doc.text(this.responsavelContato || 'Não informado', margem, y);
      doc.text(
        this.cargoFuncao || 'Não informado',
        margem + larguraColuna + 8,
        y,
      );

      y += 9;

      // ---------------------------------------------------
      // TELEFONE / EMAIL
      // ---------------------------------------------------

      doc.setTextColor(125, 138, 142);
      doc.setFontSize(7);
      doc.text('TELEFONE', margem, y);
      doc.text('E-MAIL', margem + larguraColuna + 8, y);
      y += 4;
      doc.setTextColor(40, 58, 63);
      doc.setFontSize(9);
      doc.text(this.telefoneContatoFormatado(), margem, y);
      doc.text(
        this.emailContato || 'Não informado',
        margem + larguraColuna + 8,
        y,
      );

      y += 12;

      // ===================================================
      // CRITÉRIOS DA PROSPECÇÃO
      // ===================================================

      doc.setFillColor(7, 88, 107);
      doc.roundedRect(margem, y, larguraConteudo, 13, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('CRITÉRIOS DA PROSPECÇÃO', margem + 6, y + 8);
      y += 20;

      // ===================================================
      // EMPRESAS SELECIONADAS
      // ===================================================

      doc.setTextColor(120, 135, 140);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('EMPRESAS SELECIONADAS', margem, y);
      y += 5;
      doc.setTextColor(238, 110, 44);
      doc.setFontSize(15);
      doc.text(String(this.quantidadeSelecionadas), margem, y);

      y += 10;

      // ===================================================
      // FILTROS UTILIZADOS
      // ===================================================

      criteriosConsulta.forEach((criterio) => {
        // -----------------------------------------------
        // LABEL
        // -----------------------------------------------

        doc.setTextColor(120, 135, 140);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(criterio.label.toUpperCase(), margem, y);
        y += 4;

        // -----------------------------------------------
        // VALOR
        // -----------------------------------------------

        doc.setTextColor(7, 72, 90);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        const valorLinhas = doc.splitTextToSize(
          criterio.valor,
          larguraConteudo,
        );

        doc.text(valorLinhas, margem, y);
        y += valorLinhas.length * 4;

        // -----------------------------------------------
        // DESCRIÇÃO OPCIONAL
        // -----------------------------------------------

        if (criterio.descricao) {
          y += 1;
          doc.setTextColor(75, 92, 97);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);

          const descricaoLinhas = doc.splitTextToSize(
            criterio.descricao,
            larguraConteudo,
          );

          doc.text(descricaoLinhas, margem, y);
          y += descricaoLinhas.length * 3.8;
        }

        y += 5;
      });

      // ===================================================
      // DATA LIMITE
      // ===================================================

      if (this.dataLimiteRetorno) {
        const alturaDataLimite = 15;

        if (y + alturaDataLimite > alturaPagina - 40) {
          doc.addPage();

          y = this.adicionarCabecalhoPdf(doc, logoFornece, logoSde);

          doc.setTextColor(7, 72, 90);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);

          doc.text('Informações da prospecção — continuação', margem, y);

          y += 10;
        }

        doc.setTextColor(120, 135, 140);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);

        doc.text('DATA LIMITE PARA RETORNO', margem, y);

        y += 4;

        doc.setTextColor(45, 63, 68);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        doc.text(
          this.formatarDataBrasileira(this.dataLimiteRetorno),
          margem,
          y,
        );

        y += 9;
      }

      // ===================================================
      // OBSERVAÇÕES
      // ===================================================

      if (this.observacoesContato.trim()) {
        const observacoes = doc.splitTextToSize(
          this.observacoesContato,
          larguraConteudo,
        );

        /*
         * 4 mm para o espaço entre label e texto,
         * 4 mm aproximadamente por linha,
         * mais uma margem de segurança.
         */
        const alturaObservacoes = 4 + observacoes.length * 4 + 8;

        /*
         * Verifica ANTES de escrever qualquer conteúdo.
         */
        if (y + alturaObservacoes > alturaPagina - 40) {
          doc.addPage();

          y = this.adicionarCabecalhoPdf(doc, logoFornece, logoSde);

          doc.setTextColor(7, 72, 90);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);

          doc.text('Informações da prospecção — continuação', margem, y);

          y += 10;
        }

        // LABEL

        doc.setTextColor(120, 135, 140);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);

        doc.text('OBSERVAÇÕES', margem, y);

        y += 4;

        // CONTEÚDO

        doc.setTextColor(45, 63, 68);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        doc.text(observacoes, margem, y);

        y += observacoes.length * 4;
        y += 6;
      }

      // ===================================================
      // NOVA SEÇÃO - EMPRESAS SELECIONADAS
      // ===================================================

      doc.addPage();

      y = this.adicionarCabecalhoPdf(doc, logoFornece, logoSde);

      // ===================================================
      // TÍTULO PÁGINA 2
      // ===================================================

      doc.setTextColor(7, 72, 90);

      doc.setFont('helvetica', 'bold');

      doc.setFontSize(15);

      doc.text('Empresas selecionadas', margem, y);

      doc.setFont('helvetica', 'normal');

      doc.setFontSize(8.5);

      doc.setTextColor(105, 120, 125);

      doc.text(
        `${this.quantidadeSelecionadas} empresa${
          this.quantidadeSelecionadas > 1 ? 's' : ''
        } selecionada${
          this.quantidadeSelecionadas > 1 ? 's' : ''
        } para contato`,
        margem,
        y + 6,
      );

      y += 15;

      // ===================================================
      // CARDS DAS EMPRESAS
      // ===================================================

      this.selecionadas.forEach((empresa, index) => {
        const larguraCard = larguraPagina - margem * 2;

        const padding = 6;

        const larguraConteudo = larguraCard - padding * 2;

        const larguraColuna = (larguraConteudo - 8) / 2;

        // =================================================
        // PREPARAÇÃO DOS TEXTOS
        // =================================================

        const razaoSocial = doc.splitTextToSize(
          empresa.razao_social,
          larguraCard - 28,
        );

        const cnpj = this.formatarCnpj(empresa.cnpj);

        const nomeFantasia = empresa.nome_fantasia || 'Não informado';

        const porte = empresa.porte_descricao || 'Não informado';

        const municipio = `${empresa.municipio}/${empresa.uf}`;

        const telefone = this.formatarTelefone(
          empresa.ddd_1,
          empresa.telefone_1,
        );

        const email = empresa.email || 'Não informado';

        const enderecoTexto = this.enderecoCompleto(empresa);

        // =================================================
        // QUEBRA DOS TEXTOS
        // =================================================

        const cnpjLinhas = doc.splitTextToSize(cnpj, larguraColuna);

        const fantasiaLinhas = doc.splitTextToSize(nomeFantasia, larguraColuna);

        const porteLinhas = doc.splitTextToSize(porte, larguraColuna);

        const municipioLinhas = doc.splitTextToSize(municipio, larguraColuna);

        const telefoneLinhas = doc.splitTextToSize(telefone, larguraColuna);

        const emailLinhas = doc.splitTextToSize(email, larguraColuna);

        const enderecoLinhas = doc.splitTextToSize(
          enderecoTexto,
          larguraConteudo,
        );

        // =================================================
        // CÁLCULO DA ALTURA DAS COLUNAS
        // =================================================

        const alturaCampo = (linhas: string[]): number => {
          /*
           * 3.5 = espaço depois do label
           * 3.6 = altura aproximada de cada linha
           * 2   = espaço inferior
           */
          return 3.5 + linhas.length * 3.6 + 2;
        };

        const alturaColunaEsquerda =
          alturaCampo(cnpjLinhas) +
          alturaCampo(fantasiaLinhas) +
          alturaCampo(porteLinhas);

        const alturaColunaDireita =
          alturaCampo(municipioLinhas) +
          alturaCampo(telefoneLinhas) +
          alturaCampo(emailLinhas);

        const alturaDados = Math.max(alturaColunaEsquerda, alturaColunaDireita);

        // =================================================
        // ALTURA DO CARD
        // =================================================

        /*
         * 12 = cabeçalho
         * 6  = distância até dados
         * alturaDados
         * 4  = distância da linha do endereço
         * 3.5 = label ENDEREÇO
         * endereço
         * 7 = margem inferior
         */

        const alturaCard =
          12 + 6 + alturaDados + 4 + 3.5 + enderecoLinhas.length * 3.6 + 7;

        // =================================================
        // QUEBRA DE PÁGINA
        // =================================================

        if (y + alturaCard > limiteInferiorConteudo) {
          doc.addPage();

          y = this.adicionarCabecalhoPdf(doc, logoFornece, logoSde);

          doc.setTextColor(7, 72, 90);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);

          doc.text('Empresas selecionadas — continuação', margem, y);

          y += 9;
        }

        // =================================================
        // POSIÇÕES
        // =================================================

        const xCard = margem;
        const yCard = y;

        const xConteudo = xCard + padding;

        const colunaEsquerdaX = xConteudo;

        const colunaDireitaX = xConteudo + larguraColuna + 8;

        // =================================================
        // CARD
        // =================================================

        doc.setFillColor(249, 252, 252);

        doc.setDrawColor(215, 226, 229);

        doc.setLineWidth(0.3);

        doc.roundedRect(xCard, yCard, larguraCard, alturaCard, 3, 3, 'FD');

        // =================================================
        // CABEÇALHO DO CARD
        // =================================================

        doc.setFillColor(7, 88, 107);

        doc.roundedRect(xCard, yCard, larguraCard, 12, 3, 3, 'F');

        /*
         * Remove o arredondamento inferior
         * visualmente.
         */
        doc.rect(xCard, yCard + 6, larguraCard, 6, 'F');

        // =================================================
        // NÚMERO
        // =================================================

        doc.setFillColor(238, 110, 44);

        doc.circle(xCard + 8, yCard + 6, 3.5, 'F');

        doc.setTextColor(255, 255, 255);

        doc.setFont('helvetica', 'bold');

        doc.setFontSize(8);

        doc.text(String(index + 1), xCard + 8, yCard + 7, {
          align: 'center',
        });

        // =================================================
        // RAZÃO SOCIAL
        // =================================================

        doc.setFontSize(9.5);

        doc.text(razaoSocial, xCard + 14, yCard + 5.5);

        // =================================================
        // FUNÇÃO AUXILIAR DOS CAMPOS
        // =================================================

        const escreverCampo = (
          label: string,
          linhas: string[],
          x: number,
          yCampo: number,
        ): number => {
          doc.setTextColor(120, 135, 140);

          doc.setFont('helvetica', 'bold');

          doc.setFontSize(6.8);

          doc.text(label.toUpperCase(), x, yCampo);

          yCampo += 3.5;

          doc.setTextColor(43, 62, 68);

          doc.setFont('helvetica', 'normal');

          doc.setFontSize(8);

          doc.text(linhas, x, yCampo);

          return yCampo + linhas.length * 3.6 + 2;
        };

        // =================================================
        // COLUNA ESQUERDA
        // =================================================

        let yEsquerda = yCard + 18;

        yEsquerda = escreverCampo(
          'CNPJ',
          cnpjLinhas,
          colunaEsquerdaX,
          yEsquerda,
        );

        yEsquerda = escreverCampo(
          'Nome fantasia',
          fantasiaLinhas,
          colunaEsquerdaX,
          yEsquerda,
        );

        yEsquerda = escreverCampo(
          'Porte',
          porteLinhas,
          colunaEsquerdaX,
          yEsquerda,
        );

        // =================================================
        // COLUNA DIREITA
        // =================================================

        let yDireita = yCard + 18;

        yDireita = escreverCampo(
          'Município',
          municipioLinhas,
          colunaDireitaX,
          yDireita,
        );

        yDireita = escreverCampo(
          'Telefone',
          telefoneLinhas,
          colunaDireitaX,
          yDireita,
        );

        yDireita = escreverCampo(
          'E-mail',
          emailLinhas,
          colunaDireitaX,
          yDireita,
        );

        // =================================================
        // DIVISÓRIA
        // =================================================

        const yEndereco = Math.max(yEsquerda, yDireita);

        doc.setDrawColor(228, 235, 237);

        doc.setLineWidth(0.2);

        doc.line(
          xConteudo,
          yEndereco,
          xCard + larguraCard - padding,
          yEndereco,
        );

        // =================================================
        // ENDEREÇO
        // =================================================

        let yEnderecoTexto = yEndereco + 4;

        doc.setTextColor(120, 135, 140);

        doc.setFont('helvetica', 'bold');

        doc.setFontSize(6.8);

        doc.text('ENDEREÇO', xConteudo, yEnderecoTexto);

        yEnderecoTexto += 3.5;

        doc.setTextColor(43, 62, 68);

        doc.setFont('helvetica', 'normal');

        doc.setFontSize(8);

        doc.text(enderecoLinhas, xConteudo, yEnderecoTexto);

        // =================================================
        // PRÓXIMO CARD
        // =================================================

        y = yCard + alturaCard + 6;
      });

      // ===================================================
      // RODAPÉ DE TODAS AS PÁGINAS
      // ===================================================

      const totalPaginasPdf = doc.getNumberOfPages();

      for (let paginaPdf = 1; paginaPdf <= totalPaginasPdf; paginaPdf++) {
        doc.setPage(paginaPdf);

        // Linha

        doc.setDrawColor(225, 232, 234);
        doc.setLineWidth(0.2);

        doc.line(
          margem,
          alturaPagina - 15,
          larguraPagina - margem,
          alturaPagina - 15,
        );

        // Data

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(125, 137, 141);

        doc.text(
          `Documento gerado em ${dataEmissao}`,
          margem,
          alturaPagina - 9,
        );

        // Paginação

        doc.text(
          `Página ${paginaPdf} de ${totalPaginasPdf}`,
          larguraPagina - margem,
          alturaPagina - 9,
          {
            align: 'right',
          },
        );
      }

      // ===================================================
      // SALVAR
      // ===================================================

      const data = this.dataArquivoAtual();
      const identificador = this.gerarIdentificadorArquivoPdf();
      doc.save(`prospeccao-fornece-${identificador}-${data}.pdf`);
      this.mensagemErroModal = '';
      return true;
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      this.mensagemErroModal =
        'Não foi possível gerar o documento PDF. Tente novamente.';
      return false;
    }
  }

  private dataArquivoAtual(): string {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  private gerarIdentificadorArquivoPdf(): string {
    if (this.cnae) {
      return `cnae-${this.cnae}`;
    }

    if (this.municipio) {
      return `municipio-${this.normalizarNomeArquivo(this.municipio)}`;
    }

    if (this.regiao) {
      return `regiao-${this.normalizarNomeArquivo(this.regiao)}`;
    }

    if (this.porte) {
      return `porte-${this.porte}`;
    }

    return 'consulta';
  }

  private normalizarNomeArquivo(valor: string): string {
    return valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private adicionarCampoPdf(
    doc: jsPDF,
    label: string,
    valor: string,
    y: number,
    margem: number,
    larguraPagina: number,
  ): number {
    doc.setFont('helvetica', 'bold');

    doc.text(`${label}:`, margem, y);

    y += 4.5;

    doc.setFont('helvetica', 'normal');

    const linhas = doc.splitTextToSize(
      valor || 'Não informado',
      larguraPagina - margem * 2,
    );

    doc.text(linhas, margem, y);

    y += linhas.length * 4.5;

    y += 2;

    return y;
  }

  // =====================================================
  // AUXILIARES
  // =====================================================

  private limparCnae(valor: string): string {
    return String(valor || '').replace(/\D/g, '');
  }

  private emailValido(email: string): boolean {
    const emailNormalizado = email.trim();

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado);
  }

  private telefoneContatoFormatado(): string {
    const telefone = this.telefoneContato.replace(/\D/g, '');

    if (!telefone) {
      return 'Não informado';
    }

    if (telefone.length === 11) {
      return telefone.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    }

    if (telefone.length === 10) {
      return telefone.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    }

    return this.telefoneContato.trim();
  }

  /**
   * Carrega uma imagem existente em assets e devolve
   * seu conteúdo em Base64 para utilização pelo jsPDF.
   */
  private carregarImagemBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const context = canvas.getContext('2d');

        if (!context) {
          reject(new Error('Não foi possível processar a imagem.'));
          return;
        }

        context.drawImage(img, 0, 0);

        resolve(canvas.toDataURL('image/png'));
      };

      img.onerror = () => {
        reject(new Error(`Não foi possível carregar a imagem: ${url}`));
      };

      img.src = url;
    });
  }

  /**
   * Insere o cabeçalho institucional no PDF.
   */
  private adicionarCabecalhoPdf(
    doc: jsPDF,
    logoFornece: string | null,
    logoSde: string | null,
  ): number {
    const larguraPagina = doc.internal.pageSize.getWidth();

    const margem = 15;

    /*
     * Logo ForneCE
     *
     * Mantemos uma área maior porque a imagem
     * é bastante horizontal.
     */
    if (logoFornece && logoSde) {
      doc.addImage(logoFornece, 'PNG', margem, 10, 78, 31);

      /*
       * Separador vertical entre as marcas.
       */
      doc.setDrawColor(210, 220, 223);

      doc.setLineWidth(0.3);

      doc.line(101, 12, 101, 39);

      /*
       * Logo Governo do Ceará / SDE
       */
      doc.addImage(logoSde, 'PNG', 108, 11, 86, 30);
    }

    /*
     * Linha institucional
     */
    doc.setDrawColor(7, 88, 107);

    doc.setLineWidth(0.7);

    doc.line(margem, 47, larguraPagina - margem, 47);

    /*
     * Linha laranja pequena para reforçar
     * a identidade do ForneCE.
     */
    doc.setDrawColor(238, 110, 44);

    doc.setLineWidth(1.2);

    doc.line(margem, 47, 58, 47);

    /*
     * Retornamos a posição Y onde o conteúdo
     * pode começar.
     */
    return 57;
  }
}
