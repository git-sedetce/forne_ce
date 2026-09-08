import { Directive, ElementRef, HostListener, Input } from '@angular/core';

@Directive({
  selector: '[appCpfcnpjMask]',
  standalone: false,
})
export class CpfcnpjMaskDirective {
  @Input('appCpfcnpjMask') tipo: 'cpf' | 'cnpj' | 'cpf_cnpj' = 'cpf';

  constructor(private el: ElementRef) {}

  @HostListener('input', ['$event'])
  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    let valor = input.value;

    if (this.tipo === 'cpf') {
      valor = valor.replace(/\D/g, '');
      valor = this.formatarCPF(valor);
    } else if (this.tipo === 'cnpj') {
      valor = valor.replace(/[^a-zA-Z0-9]/g, '');
      valor = valor.toUpperCase();
      valor = this.formatarCNPJ(valor);
    } else if (this.tipo === 'cpf_cnpj') {
      // mantém letras/números para detectar CNPJ
      let limpo = valor.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      const temLetras = /[A-Z]/.test(limpo);

      // CPF: até 11 dígitos e sem letras
      if (!temLetras && limpo.length <= 11) {
        limpo = limpo.replace(/\D/g, '');
        valor = this.formatarCPF(limpo);
      } else {
        // CNPJ: letras ou >11 chars
        valor = this.formatarCNPJ(limpo);
      }
    }

    input.value = valor;
  }

  private formatarCPF(valor: string): string {
    valor = valor.substring(0, 11);

    if (valor.length <= 3) return valor;

    if (valor.length <= 6) {
      return valor.replace(/^(\d{3})(\d+)/, '$1.$2');
    }

    if (valor.length <= 9) {
      return valor.replace(/^(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
    }

    return valor.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4');
  }

  private formatarCNPJ(valor: string): string {
    valor = valor.substring(0, 14);

    if (valor.length <= 2) return valor;

    if (valor.length <= 5) {
      return valor.replace(/^([A-Z0-9]{2})([A-Z0-9]+)/, '$1.$2');
    }

    if (valor.length <= 8) {
      return valor.replace(
        /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]+)/,
        '$1.$2.$3',
      );
    }

    if (valor.length <= 12) {
      return valor.replace(
        /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]+)/,
        '$1.$2.$3/$4',
      );
    }

    return valor.replace(
      /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})([A-Z0-9]{2}).*/,
      '$1.$2.$3/$4-$5',
    );
  }
}
