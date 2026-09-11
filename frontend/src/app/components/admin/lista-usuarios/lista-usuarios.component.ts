import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { Perfil } from '../../../models/perfil';

@Component({
  selector: 'app-lista-usuarios',
  standalone: false,
  templateUrl: './lista-usuarios.component.html',
  styleUrl: './lista-usuarios.component.css'
})
export class ListaUsuariosComponent implements OnInit {

  users: any[] = [];
  usersFiltradas: any[] = [];
  paginatedUsers: any[] = [];
  anexos: any[] = [];
  userSelect: any = null;
  userForm!: FormGroup;
  filtro = '';
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  sortField = 'nome';
  sortDirection: 'asc' | 'desc' = 'asc';
  modalDetalhesAberto = false;
  carregando = false;
  salvando = false;
  mensagem = '';
  buscandoCep = false;
  erroCep = '';

  /*===================================
        LISTAS
  ===================================*/

  // sexec_list: Cidade[] = [];
  perfis: Perfil[] = [];

  constructor(
    private userService: UserService,
    private fb: FormBuilder,
  ) {
    this.userForm = this.fb.group({
      nome_representante: ['', Validators.required],
      cpf_cnpj: [
        '',
        [
          Validators.required,
          Validators.minLength(11),
          Validators.maxLength(12),
        ],
      ],
      user_email: ['', [Validators.required, Validators.email]],
      profile_id: ['', Validators.required],
      user_active: [true],
    });
  }

  ngOnInit(): void {
    this.carregarUsers();
    this.loadProfile();
  }

  // ============================================================
  // CARREGAR DADOS
  // ============================================================

  loadProfile(): void {
    this.userService.getProfiles('takeProfiles').subscribe({
      next: (perfis: Perfil[]) => {
        this.perfis = perfis;
      },
      error: (error) => {
        console.error('Erro ao carregar perfis:', error);
      },
    });
  }

  carregarUsers(): void {
    this.carregando = true;
    this.mensagem = '';
    this.userService.getUsers('allUser').subscribe({
      next: (response: any[]) => {
        this.users = Array.isArray(response) ? response : [];
        this.aplicarFiltro();
        this.carregando = false;
      },
      error: (error) => {
        console.error('Erro ao carregar Usuários:', error);
        this.mensagem = 'Não foi possível carregar os Usuários.';
        this.carregando = false;
      },
    });
  }

  // ============================================================
  // FILTRO
  // ============================================================

  aplicarFiltro(): void {
    const termo = this.filtro.trim().toLowerCase();

    this.usersFiltradas = this.users.filter((user) => {
      const nome_representante = user.nome_representante ?? '';
      const cpf_cnpj = user.cpf_cnpj ?? '';
      const email = user.user_email ?? '';
      const perfil = user.ass_user_profile?.perfil ?? '';
      const status = user.user_active ? 'ativo' : 'inativo';

      return (
        !termo ||
        nome_representante.toLowerCase().includes(termo) ||
        cpf_cnpj.toLowerCase().includes(termo) ||
        email.toLowerCase().includes(termo) ||
        perfil.toLowerCase().includes(termo) ||
        status.includes(termo)
      );
    });

    this.ordenarUsers();
    this.totalPages = Math.max(
      1,
      Math.ceil(this.usersFiltradas.length / this.pageSize),
    );
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

    this.atualizarPagina();
  }

  // ============================================================
  // ORDENAÇÃO
  // ============================================================

  ordenarUsers(): void {
    this.usersFiltradas.sort((a, b) => {
      const valorA = this.getValorCampoOrdenacao(a, this.sortField);
      const valorB = this.getValorCampoOrdenacao(b, this.sortField);
      const comparacao = String(valorA).localeCompare(String(valorB), 'pt-BR', {
        numeric: true,
        sensitivity: 'base',
      });

      return this.sortDirection === 'asc' ? comparacao : -comparacao;
    });
  }

  getValorCampoOrdenacao(user: any, campo: string): string {
    switch (campo) {
      case 'cpf':
        return user.cpf_cnpj ?? '';
      case 'nome':
        return user.nome_representante ?? '';
      case 'email':
        return user.user_email ?? '';
      case 'perfil':
        return user.ass_user_profile?.perfil ?? '';
      case 'status':
        return user.user_active ? 'Ativo' : 'Inativo';
      default:
        return '';
    }
  }

  ordenarPor(campo: string): void {
    if (this.sortField === campo) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = campo;
      this.sortDirection = 'asc';
    }

    this.ordenarUsers();
    this.atualizarPagina();
  }

  getOrdenacaoIcone(campo: string): string {
    if (this.sortField !== campo) {
      return 'fa-arrows-up-down';
    }

    return this.sortDirection === 'asc'
      ? 'fa-arrow-up-short-wide'
      : 'fa-arrow-down-short-wide';
  }

  // ============================================================
  // PAGINAÇÃO
  // ============================================================

  atualizarPagina(): void {
    const inicio = (this.currentPage - 1) * this.pageSize;
    const fim = inicio + this.pageSize;
    this.paginatedUsers = this.usersFiltradas.slice(inicio, fim);
  }

  get paginas(): number[] {
    return Array.from({ length: this.totalPages }, (_, index) => index + 1);
  }

  mudarPagina(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.atualizarPagina();
  }

  // ============================================================
  // ABRIR USUÁRIO
  // ============================================================

  abrirUser(id: number): void {
    this.carregando = true;

    this.userService.userId(id).subscribe({
      next: (user) => {
        this.userSelect = user;

        const profileId =
          user.profile_id ?? user.ass_user_profile?.id ?? '';

        this.userForm.patchValue({
          nome_representante: user.nome_representante ?? '',
          cpf_cnpj: user.cpf_cnpj ?? '',
          user_email: user.user_email ?? '',
          profile_id: profileId,
          user_active: user.user_active ?? false,
        });

        this.erroCep = '';
        this.modalDetalhesAberto = true;
        this.carregando = false;
      },

      error: (error) => {
        console.error('Erro ao carregar usuário:', error);
        this.mensagem = 'Não foi possível abrir os dados do usuário.';
        this.carregando = false;
      },
    });
  }

  // ============================================================
  // SALVAR
  // ============================================================

  salvarUser(): void {
    if (!this.userSelect || this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.salvando = true;

    const payload = {
      ...this.userForm.value,
      profile_id: Number(this.userForm.value.profile_id),
    };

    this.userService
      .atualizarUser(this.userSelect.id, payload)
      .subscribe({
        next: () => {
          this.mensagem = 'Usuário atualizado com sucesso.';
          this.salvando = false;
          this.modalDetalhesAberto = false;
          this.carregarUsers();
        },

        error: (error) => {
          console.error('Erro ao atualizar usuário:', error);
          this.mensagem = 'Não foi possível salvar as alterações.';
          this.salvando = false;
        },
      });
  }

  // ============================================================
  // FECHAR MODAL
  // ============================================================

  fecharModais(): void {
    if (this.salvando) {
      return;
    }
    this.modalDetalhesAberto = false;
    this.userSelect = null;
    this.userForm.reset({ user_active: true });
  }

  // ============================================================
  // GETTERS
  // ============================================================

  get nomeResponsavelControl() {
    return this.userForm.get('nome_representante');
  }

  get cpfControl() {
    return this.userForm.get('cpf_cnpj');
  }

  get emailControl() {
    return this.userForm.get('user_email');
  }

  get profileControl() {
    return this.userForm.get('profile_id');
  }

}
