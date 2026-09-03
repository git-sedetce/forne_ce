import csv
import time
import zipfile
from decimal import Decimal, InvalidOperation

from config import RAW_DIR, COMPETENCIA
from database import get_connection
from services.carga_service import (
    iniciar_carga,
    atualizar_carga,
    concluir_carga,
    falhar_carga,
    interromper_carga,
)


TIPO_CARGA = "EMPRESAS"
TAMANHO_LOTE = 10_000


# ============================================================
# DOMÍNIOS
# ============================================================

def carregar_qualificacoes_validas(conn):

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT codigo
            FROM public.qualificacoes
            """
        )

        return {
            str(row[0]).strip()
            for row in cur.fetchall()
        }


def carregar_naturezas_validas(conn):

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT codigo
            FROM public.naturezas_juridicas
            """
        )

        return {
            str(row[0]).strip()
            for row in cur.fetchall()
        }


# ============================================================
# CNPJS DO CEARÁ
# ============================================================

def carregar_cnpjs_ce(
    conn,
    competencia,
):
    """
    Carrega em memória somente os CNPJs básicos pertencentes
    à competência que está sendo processada.
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
            row[0]
            for row in cur.fetchall()
        }

    print(
        f"CNPJs do Ceará carregados em memória: "
        f"{len(cnpjs):,}"
    )

    return cnpjs


# ============================================================
# CONVERSÕES
# ============================================================

def converter_decimal(valor):
    """
    Converte:

        5000,00

    para:

        Decimal('5000.00')
    """

    if not valor:
        return None

    valor = valor.strip()

    if not valor:
        return None

    try:

        return Decimal(
            valor.replace(",", ".")
        )

    except InvalidOperation:

        return None


# ============================================================
# INSERÇÃO DO LOTE
# ============================================================

def inserir_lote(
    conn,
    lote,
    carga_id,
):
    """
    Insere um lote de empresas.

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
            # TEMP
            # ------------------------------------------------

            cur.execute(
                """
                CREATE TEMP TABLE IF NOT EXISTS tmp_empresas (

                    cnpj_basico VARCHAR(8),

                    razao_social TEXT,

                    natureza_juridica_codigo VARCHAR(4),

                    qualificacao_responsavel_codigo VARCHAR(2),

                    capital_social NUMERIC(18,2),

                    porte_codigo VARCHAR(2),

                    ente_federativo_responsavel TEXT

                )
                ON COMMIT DELETE ROWS
                """
            )

            # ------------------------------------------------
            # COPY
            # ------------------------------------------------

            with cur.copy(
                """
                COPY tmp_empresas (
                    cnpj_basico,
                    razao_social,
                    natureza_juridica_codigo,
                    qualificacao_responsavel_codigo,
                    capital_social,
                    porte_codigo,
                    ente_federativo_responsavel
                )
                FROM STDIN
                """
            ) as copy:

                for registro in lote:

                    copy.write_row(registro)

            # ------------------------------------------------
            # INSERT
            # ------------------------------------------------

            cur.execute(
                """
                INSERT INTO public.empresas (

                    cnpj_basico,

                    razao_social,

                    natureza_juridica_codigo,

                    qualificacao_responsavel_codigo,

                    capital_social,

                    porte_codigo,

                    ente_federativo_responsavel,

                    competencia,

                    carga_id
                )

                SELECT
                    cnpj_basico,
                    razao_social,
                    natureza_juridica_codigo,
                    qualificacao_responsavel_codigo,
                    capital_social,
                    porte_codigo,
                    ente_federativo_responsavel,
                    %s,
                    %s

                FROM tmp_empresas

                ON CONFLICT (
                    cnpj_basico,
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
        print("ERRO AO INSERIR LOTE")
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
    qualificacoes_validas,
    naturezas_validas,
    carga_id,
    totais,
):
    """
    Processa um Empresas*.zip.
    """

    print()
    print("=" * 70)
    print(f"PROCESSANDO: {arquivo.name}")
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
                ".EMPRECSV"
            )
        ]

        if not csv_files:

            raise RuntimeError(
                f"Nenhum arquivo EMPRECSV "
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
                    # Layout
                    # ----------------------------------------

                    if len(linha) != 7:

                        totais["erros"] += 1

                        continue

                    # ----------------------------------------
                    # CNPJ
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
                    # Apenas empresas pertencentes ao recorte
                    # CE da competência
                    # ----------------------------------------

                    if (
                        cnpj_basico
                        not in cnpjs_ce
                    ):

                        continue

                    # ----------------------------------------
                    # Razão social
                    # ----------------------------------------

                    razao_social = (
                        linha[1].strip()
                        or None
                    )

                    # ----------------------------------------
                    # Natureza jurídica
                    # ----------------------------------------

                    natureza = (
                        linha[2].strip()
                        or None
                    )

                    if (
                        natureza
                        and natureza
                        not in naturezas_validas
                    ):

                        natureza = None

                    # ----------------------------------------
                    # Qualificação
                    # ----------------------------------------

                    qualificacao = (
                        linha[3].strip()
                        or None
                    )

                    if (
                        qualificacao
                        and qualificacao
                        not in qualificacoes_validas
                    ):

                        qualificacao = None

                    # ----------------------------------------
                    # Capital
                    # ----------------------------------------

                    capital = converter_decimal(
                        linha[4]
                    )

                    # ----------------------------------------
                    # Porte
                    # ----------------------------------------

                    porte = (
                        linha[5].strip()
                        or None
                    )

                    # ----------------------------------------
                    # Ente
                    # ----------------------------------------

                    ente = (
                        linha[6].strip()
                        or None
                    )

                    # ----------------------------------------
                    # Lote
                    # ----------------------------------------

                    lote.append(
                        (
                            cnpj_basico,
                            razao_social,
                            natureza,
                            qualificacao,
                            capital,
                            porte,
                            ente,
                        )
                    )

                    totais[
                        "processados"
                    ] += 1

                    # ----------------------------------------
                    # Inserção
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
                                totais[
                                    "erros"
                                ]
                            ),
                        )

                        print(
                            f"Linhas: "
                            f"{totais['lidos']:,} | "
                            f"Empresas CE: "
                            f"{totais['processados']:,} | "
                            f"Inseridas: "
                            f"{totais['inseridos']:,} | "
                            f"Duplicadas: "
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
            # Último lote
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
                        totais[
                            "erros"
                        ]
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
        # Carga
        # ----------------------------------------------------

        carga_id = iniciar_carga(
            conn,
            TIPO_CARGA,
            COMPETENCIA,
        )

        print()
        print("=" * 70)
        print("CARGA DE EMPRESAS DO CEARÁ")
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
        # Qualificações
        # ----------------------------------------------------

        qualificacoes_validas = (
            carregar_qualificacoes_validas(
                conn
            )
        )

        print(
            f"Qualificações válidas: "
            f"{len(qualificacoes_validas):,}"
        )

        # ----------------------------------------------------
        # Naturezas
        # ----------------------------------------------------

        naturezas_validas = (
            carregar_naturezas_validas(
                conn
            )
        )

        print(
            f"Naturezas jurídicas válidas: "
            f"{len(naturezas_validas):,}"
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
        # Arquivos
        # ----------------------------------------------------

        arquivos = sorted(
            RAW_DIR.glob(
                "Empresas*.zip"
            )
        )

        if not arquivos:

            raise FileNotFoundError(
                "Nenhum Empresas*.zip encontrado "
                f"em {RAW_DIR}"
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
        # Processamento
        # ----------------------------------------------------

        for arquivo in arquivos:

            processar_arquivo(
                arquivo=arquivo,
                conn=conn,
                cnpjs_ce=cnpjs_ce,
                qualificacoes_validas=(
                    qualificacoes_validas
                ),
                naturezas_validas=(
                    naturezas_validas
                ),
                carga_id=carga_id,
                totais=totais,
            )

        # ----------------------------------------------------
        # Conclusão
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
        print("CARGA DE EMPRESAS CONCLUÍDA")
        print("=" * 70)

        print(
            f"Linhas lidas:       "
            f"{totais['lidos']:,}"
        )

        print(
            f"Empresas CE:        "
            f"{totais['processados']:,}"
        )

        print(
            f"Empresas inseridas: "
            f"{totais['inseridos']:,}"
        )

        print(
            f"Duplicadas:         "
            f"{totais['duplicados']:,}"
        )

        print(
            f"Erros:              "
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