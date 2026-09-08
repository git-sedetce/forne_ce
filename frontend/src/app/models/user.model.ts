export class User {
  constructor(
    public id?: number,
    public nome_representante?: string,
    public cpf_cnpj?: string,
    public user_email?: string,
    public user_active?: boolean,
    public user_pin?: boolean,
    public user_password?: string,
    public confirm_password?: string,
    public profile_id?: number,
    public sexec_id: number | '' = '',
  ) {}
}
