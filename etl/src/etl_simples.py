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


TIPO_CARGA = "SIMPLES"
TAMANHO_LOTE = 10_000


# ============================================================
# CNPJS DO CEARÁ
# ============================================================

def carregar_cnpjs_ce(conn, competencia):
    """
    Carrega somente os CNPJs pertencentes à competência atual.
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
            if row[0] is not None
        }

    print(
        f"CNPJs CE carregados: "
        f"{len(cnpjs):,}"
    )

    return cnpjs


# ============================================================
# CONVERSÕES
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


def normalizar_texto(valor):

    if valor is None:
        return None

    valor = valor.strip()

    return valor or None


# ============================================================
# INSERIR LOTE
# ============================================================

def inserir_lote(
    conn,
    lote,
    carga_id,
):
    """
    Insere um lote de registros do Simples Nacional / MEI.

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
                CREATE TEMP TABLE IF NOT EXISTS tmp_simples (

                    cnpj_basico VARCHAR(8),

                    opcao_simples VARCHAR(1),

                    data_opcao_simples DATE,

                    data_exclusao_simples DATE,

                    opcao_mei VARCHAR(1),

                    data_opcao_mei DATE,

                    data_exclusao_mei DATE
                )
                ON COMMIT DELETE ROWS
                """
            )

            # ------------------------------------------------
            # COPY
            # ------------------------------------------------

            with cur.copy(
                """
                COPY tmp_simples (

                    cnpj_basico,

                    opcao_simples,

                    data_opcao_simples,

                    data_exclusao_simples,

                    opcao_mei,

                    data_opcao_mei,

                    data_exclusao_mei
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
                INSERT INTO public.simples (

                    cnpj_basico,

                    opcao_simples,

                    data_opcao_simples,

                    data_exclusao_simples,

                    opcao_mei,

                    data_opcao_mei,

                    data_exclusao_mei,

                    competencia,

                    carga_id
                )

                SELECT

                    cnpj_basico,

                    opcao_simples,

                    data_opcao_simples,

                    data_exclusao_simples,

                    opcao_mei,

                    data_opcao_mei,

                    data_exclusao_mei,

                    %s,

                    %s

                FROM tmp_simples

                ON CONFLICT (
                    cnpj_basico,
                    competencia
                )

                DO NOTHING

                RETURNING cnpj_basico
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
        print("ERRO AO INSERIR LOTE DO SIMPLES")
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
    carga_id,
    totais,
):
    """
    Processa o arquivo Simples.zip.
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

        arquivos_csv = [
            nome
            for nome in z.namelist()
            if ".SIMPLES.CSV." in nome.upper()
        ]

        if not arquivos_csv:

            raise RuntimeError(
                "Nenhum arquivo SIMPLES "
                f"encontrado em {arquivo}"
            )

        nome_csv = arquivos_csv[0]

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
                    # FILTRO CE
                    # ----------------------------------------

                    if (
                        cnpj_basico
                        not in cnpjs_ce
                    ):

                        continue

                    # ----------------------------------------
                    # SIMPLES
                    # ----------------------------------------

                    opcao_simples = (
                        normalizar_texto(
                            linha[1]
                        )
                    )

                    data_opcao_simples = (
                        converter_data(
                            linha[2]
                        )
                    )

                    data_exclusao_simples = (
                        converter_data(
                            linha[3]
                        )
                    )

                    # ----------------------------------------
                    # MEI
                    # ----------------------------------------

                    opcao_mei = (
                        normalizar_texto(
                            linha[4]
                        )
                    )

                    data_opcao_mei = (
                        converter_data(
                            linha[5]
                        )
                    )

                    data_exclusao_mei = (
                        converter_data(
                            linha[6]
                        )
                    )

                    # ----------------------------------------
                    # LOTE
                    # ----------------------------------------

                    lote.append(
                        (
                            cnpj_basico,
                            opcao_simples,
                            data_opcao_simples,
                            data_exclusao_simples,
                            opcao_mei,
                            data_opcao_mei,
                            data_exclusao_mei,
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
                            f"Simples CE: "
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
            "CARGA DO SIMPLES NACIONAL / MEI - CEARÁ"
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
        # ARQUIVO
        # ----------------------------------------------------

        arquivo = (
            RAW_DIR
            / "Simples.zip"
        )

        if not arquivo.exists():

            raise FileNotFoundError(
                f"Arquivo não encontrado: "
                f"{arquivo}"
            )

        # ----------------------------------------------------
        # PROCESSAMENTO
        # ----------------------------------------------------

        processar_arquivo(
            arquivo=arquivo,
            conn=conn,
            cnpjs_ce=cnpjs_ce,
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
        print("CARGA DO SIMPLES CONCLUÍDA")
        print("=" * 70)

        print(
            f"Linhas lidas: "
            f"{totais['lidos']:,}"
        )

        print(
            f"Simples CE:   "
            f"{totais['processados']:,}"
        )

        print(
            f"Inseridos:    "
            f"{totais['inseridos']:,}"
        )

        print(
            f"Duplicados:   "
            f"{totais['duplicados']:,}"
        )

        print(
            f"Erros:        "
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
        print("ERRO NA CARGA DO SIMPLES")
        print("=" * 70)
        print(erro)
        print("=" * 70)

        raise

    finally:

        conn.close()


if __name__ == "__main__":
    main()