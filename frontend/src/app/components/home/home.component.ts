import {
  AfterViewInit,
  HostListener,
  Component,
  OnDestroy,
  ViewChild,
  ElementRef,
  OnInit,
} from '@angular/core';
import {
  CnaeRanking,
  EmpresaPorMunicipio,
  RespostaCnaes,
  RespostaMunicipios,
} from '../../interfaces/dashboard.interface';
import { DashboardService } from '../../services/dashboard.service';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import * as L from 'leaflet';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnDestroy, OnInit {
  @ViewChild('mapCard')
  mapCard!: ElementRef<HTMLElement>;
  mapaTelaCheia = false;
  private mapa?: L.Map;
  private geoJsonLayer?: L.GeoJSON;
  municipios: EmpresaPorMunicipio[] = [];
  rankingCnaes: CnaeRanking[] = [];
  quantidadePorMunicipio = new Map<string, EmpresaPorMunicipio>();
  loading = true;
  erroCarregamento = false;
  competencia = '';
  totalEmpresasAtivas = 0;
  maiorQuantidadeMunicipio = 0;
  readonly coresMapa = [
    '#eff6ff',
    '#dbeafe',
    '#bfdbfe',
    '#93c5fd',
    '#60a5fa',
    '#2563eb',
    '#1e3a8a',
  ];

  constructor(
    private dashboardService: DashboardService,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  // ngAfterViewInit(): void {
  //   this.criarMapa();
  //   this.carregarDashboard();
  // }

  ngOnInit(): void {
    this.criarMapa();
    this.carregarDashboard();
  }

  ngOnDestroy(): void {
    if (this.mapa) {
      this.mapa.remove();
      this.mapa = undefined;
    }
  }

  private criarMapa(): void {
    this.mapa = L.map('mapa-ceara', {
      center: [-5.2, -39.5],
      zoom: 7,
      minZoom: 6,
      maxZoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,

      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.mapa);
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.mapaTelaCheia =
      document.fullscreenElement === this.mapCard?.nativeElement;

    window.setTimeout(() => {
      this.mapa?.invalidateSize();

      if (this.geoJsonLayer) {
        const limites = this.geoJsonLayer.getBounds();

        if (limites.isValid()) {
          this.mapa?.fitBounds(limites, {
            padding: [15, 15],
          });
        }
      }
    }, 200);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    window.setTimeout(() => {
      this.mapa?.invalidateSize();
    }, 150);
  }

  private carregarDashboard(): void {
    this.loading = true;
    this.erroCarregamento = false;

    forkJoin({
      municipios: this.dashboardService.empresasPorMunicipio(),

      cnaes: this.dashboardService.cnaesMaisUtilizados(),
    }).subscribe({
      next: (resultado) => {
        this.processarMunicipios(resultado.municipios);
        this.processarCnaes(resultado.cnaes);
        this.carregarGeoJson();
        this.loading = false;

        console.log('Resultado:', resultado);
      },

      error: (error) => {
        console.error('Erro ao carregar dashboard:', error);

        this.loading = false;
        this.erroCarregamento = true;
      },
    });
  }

  private processarMunicipios(resposta: RespostaMunicipios): void {
    this.municipios = resposta.dados || [];

    this.competencia = resposta.filtros?.competencia || '';

    this.totalEmpresasAtivas = this.municipios.reduce(
      (total: number, municipio: EmpresaPorMunicipio) => {
        return total + Number(municipio.quantidade_empresas || 0);
      },
      0,
    );

    this.maiorQuantidadeMunicipio = Math.max(
      ...this.municipios.map((municipio) =>
        Number(municipio.quantidade_empresas || 0),
      ),
      0,
    );

    this.quantidadePorMunicipio.clear();

    this.municipios.forEach((municipio) => {
      const chave = this.normalizarTexto(municipio.municipio);

      this.quantidadePorMunicipio.set(chave, municipio);
    });
  }

  private processarCnaes(resposta: RespostaCnaes): void {
    this.rankingCnaes = (resposta.dados || []).slice(0, 10);

    if (!this.competencia) {
      this.competencia = resposta.filtros?.competencia || '';
    }
  }

  private carregarGeoJson(): void {
    fetch('assets/geojson/geojs-mun.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error('GeoJSON do Ceará não encontrado.');
        }

        return response.json();
      })
      .then((geoJson) => {
        this.desenharMunicipios(geoJson);
      })
      .catch((error) => {
        console.error('Erro ao carregar GeoJSON:', error);

        this.erroCarregamento = true;
      });
  }

  private desenharMunicipios(geoJson: GeoJSON.GeoJsonObject): void {
    if (!this.mapa) {
      return;
    }

    if (this.geoJsonLayer) {
      this.geoJsonLayer.remove();
    }

    this.geoJsonLayer = L.geoJSON(geoJson, {
      style: (feature) => this.estiloMunicipio(feature),

      onEachFeature: (feature, layer) => {
        this.configurarMunicipio(feature, layer);
      },
    }).addTo(this.mapa);

    const limites = this.geoJsonLayer.getBounds();

    window.setTimeout(() => {
      this.mapa?.invalidateSize();

      if (limites.isValid()) {
        this.mapa?.fitBounds(limites, {
          padding: [12, 12],
        });
      }
    }, 100);
  }

  private estiloMunicipio(feature?: GeoJSON.Feature): L.PathOptions {
    const nomeMunicipio = this.obterNomeMunicipio(feature);

    const dados = this.quantidadePorMunicipio.get(
      this.normalizarTexto(nomeMunicipio),
    );

    const quantidade = Number(dados?.quantidade_empresas || 0);

    return {
      fillColor: this.obterCorPorQuantidade(quantidade),

      weight: 1,
      opacity: 1,
      color: '#ffffff',
      fillOpacity: 0.85,
    };
  }

  private configurarMunicipio(feature: GeoJSON.Feature, layer: L.Layer): void {
    const nomeMunicipio = this.obterNomeMunicipio(feature);

    const dados = this.quantidadePorMunicipio.get(
      this.normalizarTexto(nomeMunicipio),
    );

    const quantidadeEmpresas = Number(dados?.quantidade_empresas || 0);

    const quantidadeEstabelecimentos = Number(
      dados?.quantidade_estabelecimentos || 0,
    );

    layer.bindTooltip(
      `
        <div class="map-tooltip">
          <strong>${nomeMunicipio}</strong>
          <span>
            ${this.formatarNumero(quantidadeEmpresas)} empresas
          </span>
          <span>
            ${this.formatarNumero(quantidadeEstabelecimentos)} estabelecimentos
          </span>
        </div>
      `,
      {
        sticky: true,
        direction: 'top',
      },
    );

    layer.on({
      mouseover: (event: L.LeafletMouseEvent) => {
        const target = event.target as L.Path;

        target.setStyle({
          weight: 2,
          color: '#13233f',
          fillOpacity: 1,
        });

        target.bringToFront();
      },

      mouseout: () => {
        if (this.geoJsonLayer && layer instanceof L.Path) {
          this.geoJsonLayer.resetStyle(layer);
        }
      },
    });
  }

  private obterNomeMunicipio(feature?: GeoJSON.Feature): string {
    const propriedades = feature?.properties || {};

    return (
      propriedades['NM_MUN'] ||
      propriedades['NM_MUNICIP'] ||
      propriedades['name'] ||
      propriedades['nome'] ||
      'Município não identificado'
    );
  }

  private obterCorPorQuantidade(quantidade: number): string {
    if (quantidade <= 0 || this.maiorQuantidadeMunicipio <= 0) {
      return '#f1f5f9';
    }

    /*
     * A escala logarítmica evita que Fortaleza deixe
     * todos os municípios pequenos com a mesma cor.
     */
    const proporcao =
      Math.log1p(quantidade) / Math.log1p(this.maiorQuantidadeMunicipio);

    const indice = Math.min(
      Math.floor(proporcao * this.coresMapa.length),
      this.coresMapa.length - 1,
    );

    return this.coresMapa[indice];
  }

  private normalizarTexto(texto: string): string {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  formatarNumero(valor: number): string {
    return Number(valor || 0).toLocaleString('pt-BR');
  }

  irParaLogin(): void {
    this.router.navigate(['/login']);
  }

  tentarNovamente(): void {
    this.carregarDashboard();
  }

  async alternarTelaCheia(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await this.mapCard.nativeElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Erro ao alterar tela cheia:', error);

      this.toastr.error(
        'Não foi possível abrir o mapa em tela cheia.',
        'Erro no mapa',
      );
    }
  }
}
