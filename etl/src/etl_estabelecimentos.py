import csv
import time
import zipfile
from datetime import datetime

from config import RAW_DIR, COMPETENCIA
from database import get_connection
from services.carga_service import (
    iniciar_carga,
    atualizar_carga,
    concluir_carga,
    falhar_carga,
    interromper_carga,
)


TIPO_CARGA = "ESTABELECIMENTOS"
TAMANHO_LOTE = 10_000


# ============================================================
# DOMÍNIOS
# ============================================================

def carregar_codigos_validos(conn, tabela):
    """
    Carrega os códigos válidos de uma tabela de domínio.
    """

    with conn.cursor() as cur:

        cur.execute(
            f"""
            SELECT codigo
            FROM public.{tabela}
            """
        )

        return {
            str(row[0]).strip()
            for row in cur.fetchall()
            if row[0] is not None
        }


# ============================================================
# CNPJS DO CEARÁ
# ============================================================

def carregar_cnpjs_ce(conn, competencia):
    """
    Carrega somente os CNPJs do Ceará pertencentes à
    competência que está sendo processada.
    """

    print(
        f"Carregando CNPJs do Ceará da competência "
        f"{competencia}..."
    )

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT cnpj_basico
            FROM public.cnpj_ce
            WHERE competencia = %s
            """,
            (competencia,),
        )

        cnpjs = {
            str(row[0]).strip()
            for row in cur.fetchall()
        }

    print(
        f"CNPJs do Ceará carregados em memória: "
        f"{len(cnpjs):,}"
    )

    return cnpjs


# ============================================================
# EMPRESAS
# ============================================================

def carregar_empresas(conn, competencia):
    """
    Retorna:

        {
            cnpj_basico: empresa_id
        }

    somente para a competência atual.
    """

    print(
        f"Carregando empresas da competência "
        f"{competencia}..."
    )

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT
                id,
                cnpj_basico
            FROM public.empresas
            WHERE competencia = %s
            """,
            (competencia,),
        )

        empresas = {
            str(row[1]).strip(): row[0]
            for row in cur.fetchall()
        }

    print(
        f"Empresas carregadas em memória: "
        f"{len(empresas):,}"
    )

    return empresas


# ============================================================
# CONVERSÕES / NORMALIZAÇÕES
# ============================================================

def converter_data(valor):

    if not valor:
        return None

    valor = valor.strip()

    if not valor:
        return None

    try:

        return datetime.strptime(
            valor,
            "%Y%m%d",
        ).date()

    except ValueError:

        return None


def normalizar_ddd(valor):

    if not valor:
        return None

    valor = valor.strip()

    if not valor:
        return None

    if valor in (
        "0000",
        "000",
        "00",
    ):
        return None

    if (
        len(valor) == 2
        and valor.isdigit()
    ):
        return valor

    return None


def normalizar_telefone(valor):

    if not valor:
        return None

    valor = valor.strip()

    if not valor:
        return None

    if valor == "00000000":
        return None

    return valor


def normalizar_texto(valor):

    if not valor:
        return None

    valor = valor.strip()

    return valor or None


# ============================================================
# INSERÇÃO DO LOTE
# ============================================================

def inserir_lote(
    conn,
    lote,
    carga_id,
):
    """
    Insere lote de estabelecimentos.

    Retorna:

        inseridos
        duplicados
        erros
    """

    if not lote:
        return 0, 0, 0

    quantidade_lote = len(lote)

    try:

        with conn.cursor() as cur:

            # ------------------------------------------------
            # TABELA TEMPORÁRIA
            # ------------------------------------------------

            cur.execute(
                """
                CREATE TEMP TABLE IF NOT EXISTS
                tmp_estabelecimentos (

                    empresa_id BIGINT,

                    cnpj_basico VARCHAR(8),

                    cnpj_ordem VARCHAR(4),

                    cnpj_dv VARCHAR(2),

                    cnpj_completo VARCHAR(14),

                    identificador_matriz_filial VARCHAR(1),

                    nome_fantasia TEXT,

                    situacao_cadastral_codigo VARCHAR(2),

                    data_situacao_cadastral DATE,

                    motivo_situacao_codigo VARCHAR(2),

                    nome_cidade_exterior TEXT,

                    pais_codigo VARCHAR(3),

                    data_inicio_atividade DATE,

                    cnae_principal_codigo VARCHAR(7),

                    cnae_secundario_codigo TEXT,

                    tipo_logradouro TEXT,

                    logradouro TEXT,

                    numero TEXT,

                    complemento TEXT,

                    bairro TEXT,

                    cep VARCHAR(8),

                    uf VARCHAR(2),

                    municipio_codigo VARCHAR(4),

                    ddd_1 VARCHAR(3),

                    telefone_1 VARCHAR(20),

                    ddd_2 VARCHAR(3),

                    telefone_2 VARCHAR(20),

                    fax VARCHAR(20),

                    email TEXT,

                    situacao_especial TEXT,

                    data_situacao_especial DATE
                )
                ON COMMIT DELETE ROWS
                """
            )

            # ------------------------------------------------
            # COPY
            # ------------------------------------------------

            with cur.copy(
                """
                COPY tmp_estabelecimentos (

                    empresa_id,

                    cnpj_basico,

                    cnpj_ordem,

                    cnpj_dv,

                    cnpj_completo,

                    identificador_matriz_filial,

                    nome_fantasia,

                    situacao_cadastral_codigo,

                    data_situacao_cadastral,

                    motivo_situacao_codigo,

                    nome_cidade_exterior,

                    pais_codigo,

                    data_inicio_atividade,

                    cnae_principal_codigo,

                    cnae_secundario_codigo,

                    tipo_logradouro,

                    logradouro,

                    numero,

                    complemento,

                    bairro,

                    cep,

                    uf,

                    municipio_codigo,

                    ddd_1,

                    telefone_1,

                    ddd_2,

                    telefone_2,

                    fax,

                    email,

                    situacao_especial,

                    data_situacao_especial
                )

                FROM STDIN
                """
            ) as copy:

                for registro in lote:

                    copy.write_row(registro)

            # ------------------------------------------------
            # INSERT DEFINITIVO
            # ------------------------------------------------

            cur.execute(
                """
                INSERT INTO public.estabelecimentos (

                    empresa_id,

                    cnpj_basico,

                    cnpj_ordem,

                    cnpj_dv,

                    cnpj_completo,

                    identificador_matriz_filial,

                    nome_fantasia,

                    situacao_cadastral_codigo,

                    data_situacao_cadastral,

                    motivo_situacao_codigo,

                    nome_cidade_exterior,

                    pais_codigo,

                    data_inicio_atividade,

                    cnae_principal_codigo,

                    cnae_secundario_codigo,

                    tipo_logradouro,

                    logradouro,

                    numero,

                    complemento,

                    bairro,

                    cep,

                    uf,

                    municipio_codigo,

                    ddd_1,

                    telefone_1,

                    ddd_2,

                    telefone_2,

                    fax,

                    email,

                    situacao_especial,

                    data_situacao_especial,

                    competencia,

                    carga_id
                )

                SELECT

                    empresa_id,

                    cnpj_basico,

                    cnpj_ordem,

                    cnpj_dv,

                    cnpj_completo,

                    identificador_matriz_filial,

                    nome_fantasia,

                    situacao_cadastral_codigo,

                    data_situacao_cadastral,

                    motivo_situacao_codigo,

                    nome_cidade_exterior,

                    pais_codigo,

                    data_inicio_atividade,

                    cnae_principal_codigo,

                    cnae_secundario_codigo,

                    tipo_logradouro,

                    logradouro,

                    numero,

                    complemento,

                    bairro,

                    cep,

                    uf,

                    municipio_codigo,

                    ddd_1,

                    telefone_1,

                    ddd_2,

                    telefone_2,

                    fax,

                    email,

                    situacao_especial,

                    data_situacao_especial,

                    %s,

                    %s

                FROM tmp_estabelecimentos

                ON CONFLICT (
                    cnpj_completo,
                    competencia
                )

                DO NOTHING

                RETURNING id
                """,
                (
                    COMPETENCIA,
                    carga_id,
                ),
            )

            inseridos = cur.rowcount

        conn.commit()

        duplicados = (
            quantidade_lote
            - inseridos
        )

        return (
            inseridos,
            duplicados,
            0,
        )

    except Exception as erro:

        conn.rollback()

        print()
        print("=" * 70)
        print(
            "ERRO AO INSERIR LOTE "
            "DE ESTABELECIMENTOS"
        )
        print("=" * 70)

        print(
            f"Tamanho do lote: "
            f"{quantidade_lote:,}"
        )

        print(
            f"Erro: {erro}"
        )

        print("=" * 70)

        return (
            0,
            0,
            quantidade_lote,
        )


# ============================================================
# PROCESSAR ARQUIVO
# ============================================================

def processar_arquivo(
    arquivo,
    conn,
    cnpjs_ce,
    empresas,
    motivos_validos,
    paises_validos,
    municipios_validos,
    cnaes_validos,
    carga_id,
    totais,
):
    """
    Processa um arquivo Estabelecimentos*.zip.

    Importante:

    O filtro NÃO é:

        uf == 'CE'

    O filtro é:

        cnpj_basico in cnpjs_ce

    Portanto são carregados todos os estabelecimentos pertencentes
    às empresas do recorte Ceará, inclusive eventuais filiais
    localizadas em outros estados.
    """

    print()
    print("=" * 70)
    print(
        f"PROCESSANDO: "
        f"{arquivo.name}"
    )
    print("=" * 70)

    inicio = time.time()

    lote = []

    with zipfile.ZipFile(
        arquivo,
        "r",
    ) as z:

        csv_files = [
            nome
            for nome in z.namelist()
            if nome.upper().endswith(
                ".ESTABELE"
            )
        ]

        if not csv_files:

            raise RuntimeError(
                "Nenhum arquivo ESTABELE "
                f"encontrado em {arquivo}"
            )

        nome_csv = csv_files[0]

        print(
            f"Arquivo interno: "
            f"{nome_csv}"
        )

        with z.open(nome_csv) as arquivo_csv:

            texto = (
                linha.decode(
                    "latin1"
                )
                for linha in arquivo_csv
            )

            leitor = csv.reader(
                texto,
                delimiter=";",
                quotechar='"',
            )

            for linha in leitor:

                totais["lidos"] += 1

                try:

                    # ----------------------------------------
                    # LAYOUT
                    # ----------------------------------------

                    if len(linha) != 30:

                        totais["erros"] += 1

                        continue

                    # ----------------------------------------
                    # CNPJ BÁSICO
                    # ----------------------------------------

                    cnpj_basico = (
                        linha[0].strip()
                    )

                    if (
                        not cnpj_basico
                        or len(cnpj_basico) != 8
                    ):

                        totais["erros"] += 1

                        continue

                    # ----------------------------------------
                    # FILTRO DO RECORTE CE
                    #
                    # Não filtrar linha[19] == CE.
                    # ----------------------------------------

                    if (
                        cnpj_basico
                        not in cnpjs_ce
                    ):

                        continue

                    # ----------------------------------------
                    # EMPRESA
                    # ----------------------------------------

                    empresa_id = empresas.get(
                        cnpj_basico
                    )

                    if empresa_id is None:

                        totais["erros"] += 1

                        continue

                    # ----------------------------------------
                    # CNPJ COMPLETO
                    # ----------------------------------------

                    cnpj_ordem = (
                        linha[1].strip()
                    )

                    cnpj_dv = (
                        linha[2].strip()
                    )

                    if (
                        not cnpj_ordem
                        or not cnpj_dv
                    ):

                        totais["erros"] += 1

                        continue

                    cnpj_completo = (
                        cnpj_basico
                        + cnpj_ordem
                        + cnpj_dv
                    )

                    if len(cnpj_completo) != 14:

                        totais["erros"] += 1

                        continue

                    # ----------------------------------------
                    # IDENTIFICAÇÃO
                    # ----------------------------------------

                    identificador = (
                        normalizar_texto(
                            linha[3]
                        )
                    )

                    nome_fantasia = (
                        normalizar_texto(
                            linha[4]
                        )
                    )

                    # ----------------------------------------
                    # SITUAÇÃO CADASTRAL
                    # ----------------------------------------

                    situacao = (
                        normalizar_texto(
                            linha[5]
                        )
                    )

                    if (
                        situacao
                        and (
                            len(situacao) != 2
                            or not situacao.isdigit()
                        )
                    ):

                        situacao = None

                    data_situacao = (
                        converter_data(
                            linha[6]
                        )
                    )

                    motivo = (
                        normalizar_texto(
                            linha[7]
                        )
                    )

                    if (
                        motivo
                        and motivo
                        not in motivos_validos
                    ):

                        motivo = None

                    # ----------------------------------------
                    # EXTERIOR / PAÍS
                    # ----------------------------------------

                    nome_cidade_exterior = (
                        normalizar_texto(
                            linha[8]
                        )
                    )

                    pais = (
                        normalizar_texto(
                            linha[9]
                        )
                    )

                    if (
                        pais
                        and pais
                        not in paises_validos
                    ):

                        pais = None

                    # ----------------------------------------
                    # ATIVIDADE
                    # ----------------------------------------

                    data_inicio = (
                        converter_data(
                            linha[10]
                        )
                    )

                    cnae_principal = (
                        normalizar_texto(
                            linha[11]
                        )
                    )

                    if (
                        cnae_principal
                        and cnae_principal
                        not in cnaes_validos
                    ):

                        cnae_principal = None

                    cnae_secundario = (
                        normalizar_texto(
                            linha[12]
                        )
                    )

                    # ----------------------------------------
                    # ENDEREÇO
                    # ----------------------------------------

                    tipo_logradouro = (
                        normalizar_texto(
                            linha[13]
                        )
                    )

                    logradouro = (
                        normalizar_texto(
                            linha[14]
                        )
                    )

                    numero = (
                        normalizar_texto(
                            linha[15]
                        )
                    )

                    complemento = (
                        normalizar_texto(
                            linha[16]
                        )
                    )

                    bairro = (
                        normalizar_texto(
                            linha[17]
                        )
                    )

                    cep = (
                        normalizar_texto(
                            linha[18]
                        )
                    )

                    uf = (
                        normalizar_texto(
                            linha[19]
                        )
                    )

                    municipio = (
                        normalizar_texto(
                            linha[20]
                        )
                    )

                    if (
                        municipio
                        and municipio
                        not in municipios_validos
                    ):

                        municipio = None

                    # ----------------------------------------
                    # TELEFONES
                    # ----------------------------------------

                    ddd_1 = normalizar_ddd(
                        linha[21]
                    )

                    telefone_1 = (
                        normalizar_telefone(
                            linha[22]
                        )
                    )

                    ddd_2 = normalizar_ddd(
                        linha[23]
                    )

                    telefone_2 = (
                        normalizar_telefone(
                            linha[24]
                        )
                    )

                    fax = normalizar_telefone(
                        linha[25]
                    )

                    # ----------------------------------------
                    # EMAIL
                    # ----------------------------------------

                    email = (
                        normalizar_texto(
                            linha[26]
                        )
                    )

                    # ----------------------------------------
                    # SITUAÇÃO ESPECIAL
                    # ----------------------------------------

                    situacao_especial = (
                        normalizar_texto(
                            linha[27]
                        )
                    )

                    data_situacao_especial = (
                        converter_data(
                            linha[28]
                        )
                    )

                    # linha[29] é ignorada

                    # ----------------------------------------
                    # LOTE
                    # ----------------------------------------

                    lote.append(
                        (
                            empresa_id,
                            cnpj_basico,
                            cnpj_ordem,
                            cnpj_dv,
                            cnpj_completo,
                            identificador,
                            nome_fantasia,
                            situacao,
                            data_situacao,
                            motivo,
                            nome_cidade_exterior,
                            pais,
                            data_inicio,
                            cnae_principal,
                            cnae_secundario,
                            tipo_logradouro,
                            logradouro,
                            numero,
                            complemento,
                            bairro,
                            cep,
                            uf,
                            municipio,
                            ddd_1,
                            telefone_1,
                            ddd_2,
                            telefone_2,
                            fax,
                            email,
                            situacao_especial,
                            data_situacao_especial,
                        )
                    )

                    totais[
                        "processados"
                    ] += 1

                    # ----------------------------------------
                    # PROCESSAR LOTE
                    # ----------------------------------------

                    if (
                        len(lote)
                        >= TAMANHO_LOTE
                    ):

                        (
                            inseridos,
                            duplicados,
                            erros,
                        ) = inserir_lote(
                            conn,
                            lote,
                            carga_id,
                        )

                        totais[
                            "inseridos"
                        ] += inseridos

                        totais[
                            "duplicados"
                        ] += duplicados

                        totais[
                            "erros"
                        ] += erros

                        lote.clear()

                        atualizar_carga(
                            conn,
                            carga_id,
                            registros_lidos=(
                                totais["lidos"]
                            ),
                            registros_processados=(
                                totais[
                                    "processados"
                                ]
                            ),
                            registros_inseridos=(
                                totais[
                                    "inseridos"
                                ]
                            ),
                            registros_duplicados=(
                                totais[
                                    "duplicados"
                                ]
                            ),
                            registros_erro=(
                                totais["erros"]
                            ),
                        )

                        print(
                            f"Linhas: "
                            f"{totais['lidos']:,} | "
                            f"Estabelecimentos: "
                            f"{totais['processados']:,} | "
                            f"Inseridos: "
                            f"{totais['inseridos']:,} | "
                            f"Duplicados: "
                            f"{totais['duplicados']:,} | "
                            f"Erros: "
                            f"{totais['erros']:,}"
                        )

                except Exception as erro:

                    totais["erros"] += 1

                    print(
                        f"Erro na linha "
                        f"{totais['lidos']}: "
                        f"{erro}"
                    )

            # --------------------------------------------
            # ÚLTIMO LOTE
            # --------------------------------------------

            if lote:

                (
                    inseridos,
                    duplicados,
                    erros,
                ) = inserir_lote(
                    conn,
                    lote,
                    carga_id,
                )

                totais[
                    "inseridos"
                ] += inseridos

                totais[
                    "duplicados"
                ] += duplicados

                totais[
                    "erros"
                ] += erros

                lote.clear()

                atualizar_carga(
                    conn,
                    carga_id,
                    registros_lidos=(
                        totais["lidos"]
                    ),
                    registros_processados=(
                        totais[
                            "processados"
                        ]
                    ),
                    registros_inseridos=(
                        totais[
                            "inseridos"
                        ]
                    ),
                    registros_duplicados=(
                        totais[
                            "duplicados"
                        ]
                    ),
                    registros_erro=(
                        totais["erros"]
                    ),
                )

    tempo = (
        time.time()
        - inicio
    )

    print()

    print(
        f"Tempo do arquivo: "
        f"{tempo / 60:.2f} minutos"
    )


# ============================================================
# MAIN
# ============================================================

def main():

    conn = get_connection()

    carga_id = None

    totais = {

        "lidos": 0,

        "processados": 0,

        "inseridos": 0,

        "duplicados": 0,

        "erros": 0,
    }

    try:

        # ----------------------------------------------------
        # CARGA
        # ----------------------------------------------------

        carga_id = iniciar_carga(
            conn,
            TIPO_CARGA,
            COMPETENCIA,
        )

        print()
        print("=" * 70)
        print(
            "CARGA DE ESTABELECIMENTOS "
            "DO RECORTE CEARÁ"
        )
        print("=" * 70)

        print(
            f"Competência: "
            f"{COMPETENCIA}"
        )

        print(
            f"Carga ID:    "
            f"{carga_id}"
        )

        print()

        # ----------------------------------------------------
        # DOMÍNIOS
        # ----------------------------------------------------

        print(
            "Carregando tabelas de domínio..."
        )

        motivos_validos = (
            carregar_codigos_validos(
                conn,
                "motivos_situacao",
            )
        )

        paises_validos = (
            carregar_codigos_validos(
                conn,
                "paises",
            )
        )

        municipios_validos = (
            carregar_codigos_validos(
                conn,
                "municipios",
            )
        )

        cnaes_validos = (
            carregar_codigos_validos(
                conn,
                "cnaes",
            )
        )

        print(
            f"Motivos válidos:     "
            f"{len(motivos_validos):,}"
        )

        print(
            f"Países válidos:      "
            f"{len(paises_validos):,}"
        )

        print(
            f"Municípios válidos:  "
            f"{len(municipios_validos):,}"
        )

        print(
            f"CNAEs válidos:       "
            f"{len(cnaes_validos):,}"
        )

        # ----------------------------------------------------
        # CNPJ CE
        # ----------------------------------------------------

        cnpjs_ce = carregar_cnpjs_ce(
            conn,
            COMPETENCIA,
        )

        if not cnpjs_ce:

            raise RuntimeError(
                "Nenhum CNPJ do Ceará encontrado "
                f"para a competência "
                f"{COMPETENCIA}. "
                "Execute primeiro "
                "extrair_cnpj_ce.py."
            )

        # ----------------------------------------------------
        # EMPRESAS
        # ----------------------------------------------------

        empresas = carregar_empresas(
            conn,
            COMPETENCIA,
        )

        if not empresas:

            raise RuntimeError(
                "Nenhuma empresa encontrada "
                f"para a competência "
                f"{COMPETENCIA}. "
                "Execute primeiro "
                "load_empresas_ce.py."
            )

        # ----------------------------------------------------
        # VALIDAÇÃO DE CONSISTÊNCIA
        # ----------------------------------------------------

        faltantes = (
            len(cnpjs_ce)
            - len(empresas)
        )

        print()

        print(
            f"CNPJs CE:             "
            f"{len(cnpjs_ce):,}"
        )

        print(
            f"Empresas carregadas:  "
            f"{len(empresas):,}"
        )

        if faltantes > 0:

            print(
                f"Atenção: existem "
                f"{faltantes:,} CNPJs CE "
                f"sem empresa carregada."
            )

        # ----------------------------------------------------
        # ARQUIVOS
        # ----------------------------------------------------

        arquivos = sorted(
            RAW_DIR.glob(
                "Estabelecimentos*.zip"
            )
        )

        if not arquivos:

            raise FileNotFoundError(
                "Nenhum Estabelecimentos*.zip "
                f"encontrado em {RAW_DIR}"
            )

        print()
        print("Arquivos encontrados:")

        for arquivo in arquivos:

            print(
                f" - {arquivo.name}"
            )

        print()

        print(
            f"Total: "
            f"{len(arquivos)} arquivos"
        )

        # ----------------------------------------------------
        # PROCESSAMENTO
        # ----------------------------------------------------

        for arquivo in arquivos:

            processar_arquivo(
                arquivo=arquivo,
                conn=conn,
                cnpjs_ce=cnpjs_ce,
                empresas=empresas,
                motivos_validos=motivos_validos,
                paises_validos=paises_validos,
                municipios_validos=(
                    municipios_validos
                ),
                cnaes_validos=cnaes_validos,
                carga_id=carga_id,
                totais=totais,
            )

        # ----------------------------------------------------
        # CONCLUIR
        # ----------------------------------------------------

        concluir_carga(
            conn,
            carga_id,
            registros_lidos=(
                totais["lidos"]
            ),
            registros_processados=(
                totais["processados"]
            ),
            registros_inseridos=(
                totais["inseridos"]
            ),
            registros_duplicados=(
                totais["duplicados"]
            ),
            registros_erro=(
                totais["erros"]
            ),
        )

        print()
        print("=" * 70)
        print(
            "CARGA DE ESTABELECIMENTOS "
            "CONCLUÍDA"
        )
        print("=" * 70)

        print(
            f"Linhas lidas:          "
            f"{totais['lidos']:,}"
        )

        print(
            f"Estabelecimentos:      "
            f"{totais['processados']:,}"
        )

        print(
            f"Inseridos:             "
            f"{totais['inseridos']:,}"
        )

        print(
            f"Duplicados:            "
            f"{totais['duplicados']:,}"
        )

        print(
            f"Erros:                 "
            f"{totais['erros']:,}"
        )

        print("=" * 70)

    except KeyboardInterrupt:

        if carga_id is not None:

            interromper_carga(
                conn,
                carga_id,
                registros_lidos=(
                    totais["lidos"]
                ),
                registros_processados=(
                    totais["processados"]
                ),
                registros_inseridos=(
                    totais["inseridos"]
                ),
                registros_duplicados=(
                    totais["duplicados"]
                ),
                registros_erro=(
                    totais["erros"]
                ),
            )

        print()
        print("=" * 70)
        print(
            "PROCESSAMENTO INTERROMPIDO "
            "PELO USUÁRIO"
        )
        print("=" * 70)

        raise

    except Exception as erro:

        if carga_id is not None:

            falhar_carga(
                conn,
                carga_id,
                erro,
                registros_lidos=(
                    totais["lidos"]
                ),
                registros_processados=(
                    totais["processados"]
                ),
                registros_inseridos=(
                    totais["inseridos"]
                ),
                registros_duplicados=(
                    totais["duplicados"]
                ),
                registros_erro=(
                    totais["erros"]
                ),
            )

        print()
        print("=" * 70)
        print("ERRO NA CARGA")
        print("=" * 70)
        print(erro)
        print("=" * 70)

        raise

    finally:

        conn.close()


if __name__ == "__main__":
    main()