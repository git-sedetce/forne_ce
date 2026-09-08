import {
  Directive,
  forwardRef,
  Input
} from '@angular/core';

import {
  AbstractControl,
  NG_VALIDATORS,
  ValidationErrors,
  Validator
} from '@angular/forms';

@Directive({
  selector: '[appCpfCnpjValidacao]',
  standalone: false,
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => CpfCnpjValidacaoDirective),
      multi: true
    }
  ]
})
export class CpfCnpjValidacaoDirective implements Validator {

  @Input('appCpfCnpjValidacao')
  tipo: 'cpf' | 'cnpj' | 'cpf_cnpj' = 'cpf_cnpj';


  validate(control: AbstractControl): ValidationErrors | null {

    const valor = control.value;

    // Deixa o "required" cuidar de campo vazio
    if (!valor) {
      return null;
    }

    if (this.tipo === 'cpf') {
      return CpfCnpjValidacaoDirective.validarCPF(valor)
        ? null
        : { cpfInvalido: true };
    }

    if (this.tipo === 'cnpj') {
      return CpfCnpjValidacaoDirective.validarCNPJ(valor)
        ? null
        : { cnpjInvalido: true };
    }

    /*
     * cpf_cnpj:
     *
     * CPF:
     * - somente números
     * - 11 caracteres
     *
     * CNPJ:
     * - 14 caracteres
     * - pode conter letras
     */
    const limpo = CpfCnpjValidacaoDirective.limparAlfanumerico(valor);

    const temLetras = /[A-Z]/.test(limpo);

    if (!temLetras && limpo.length <= 11) {

      return CpfCnpjValidacaoDirective.validarCPF(valor)
        ? null
        : { cpfInvalido: true };
    }

    return CpfCnpjValidacaoDirective.validarCNPJ(valor)
      ? null
      : { cnpjInvalido: true };
  }


  /* ==========================================================
     CPF
  ========================================================== */

  static limparCPF(cpf: string): string {

    return String(cpf).replace(/\D/g, '');

  }


  static validarCPF(cpf: string): boolean {

    const valor = this.limparCPF(cpf);

    /*
     * CPF deve possuir exatamente 11 dígitos
     */
    if (valor.length !== 11) {
      return false;
    }


    /*
     * Rejeita:
     *
     * 00000000000
     * 11111111111
     * ...
     * 99999999999
     */
    if (/^(\d)\1{10}$/.test(valor)) {
      return false;
    }


    /*
     * Primeiro dígito verificador
     */

    let soma1 = 0;

    for (let i = 0; i < 9; i++) {

      soma1 += Number(valor[i]) * (10 - i);

    }

    let resto1 = (soma1 * 10) % 11;

    if (resto1 === 10) {
      resto1 = 0;
    }


    /*
     * Confere o primeiro DV
     */
    if (resto1 !== Number(valor[9])) {
      return false;
    }


    /*
     * Segundo dígito verificador
     */

    let soma2 = 0;

    for (let i = 0; i < 10; i++) {

      soma2 += Number(valor[i]) * (11 - i);

    }

    let resto2 = (soma2 * 10) % 11;

    if (resto2 === 10) {
      resto2 = 0;
    }


    /*
     * Confere o segundo DV
     */
    return resto2 === Number(valor[10]);

  }


  /* ==========================================================
     CNPJ
  ========================================================== */

  static limparAlfanumerico(valor: string): string {

    return String(valor)
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();

  }


  private static valorCaracter(caractere: string): number {

    const codigo = caractere.charCodeAt(0);

    /*
     * 0 até 9
     */
    if (codigo >= 48 && codigo <= 57) {
      return codigo - 48;
    }

    /*
     * A até Z
     *
     * Mantido conforme seu algoritmo atual.
     */
    if (codigo >= 65 && codigo <= 90) {
      return codigo - 48;
    }

    throw new Error(
      `Caractere inválido no CNPJ: ${caractere}`
    );

  }


  private static calcularDV(
    texto: string,
    pesos: number[]
  ): number {

    let soma = 0;

    for (let i = 0; i < texto.length; i++) {

      soma +=
        this.valorCaracter(texto[i]) *
        pesos[i];

    }

    const resto = soma % 11;

    return resto < 2
      ? 0
      : 11 - resto;

  }


  static validarCNPJ(cnpj: string): boolean {

    const valor = this.limparAlfanumerico(cnpj);

    /*
     * CNPJ possui 14 caracteres
     */
    if (valor.length !== 14) {
      return false;
    }


    /*
     * Os dois últimos caracteres obrigatoriamente
     * devem ser dígitos verificadores numéricos.
     */
    if (!/^\d{2}$/.test(valor.substring(12, 14))) {
      return false;
    }


    /*
     * Evita sequências inválidas tradicionais
     * no caso de CNPJ exclusivamente numérico.
     */
    if (
      /^\d{14}$/.test(valor) &&
      /^(\d)\1{13}$/.test(valor)
    ) {
      return false;
    }


    const base = valor.substring(0, 12);

    const dvInformado1 = Number(valor[12]);
    const dvInformado2 = Number(valor[13]);


    const dv1 = this.calcularDV(
      base,
      [
        5, 4, 3, 2,
        9, 8, 7, 6,
        5, 4, 3, 2
      ]
    );


    const dv2 = this.calcularDV(
      base + dv1,
      [
        6, 5, 4, 3, 2,
        9, 8, 7, 6,
        5, 4, 3, 2
      ]
    );


    return (
      dvInformado1 === dv1 &&
      dvInformado2 === dv2
    );

  }

}
