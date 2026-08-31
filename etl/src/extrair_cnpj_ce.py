import csv
import io
import zipfile

from config import RAW_DIR, COMPETENCIA
from database import get_connection
from services.carga_service import (
    iniciar_carga,
    atualizar_carga,
    concluir_carga,
    falhar_carga,
    interromper_carga,
)


TIPO_CARGA = "CNPJ_CE"
UF_CEARA = "CE"
TAMANHO_LOTE = 100_000


# ============================================================
# INSERIR LOTE
# ============================================================

def inserir_lote(
    conn,
    lote,
    competencia,
    carga_id,
):
    """
    Insere CNPJs básicos identificados no Ceará.

    A unicidade é definida por:

        cnpj_basico + competencia

    Retorna a quantidade efetivamente inserida.
    """

    if not lote:
        return 0

    with conn.cursor() as cur:

        # ----------------------------------------------------
        # Tabela temporária
        # ----------------------------------------------------

        cur.execute(
            """
            CREATE TEMP TABLE IF NOT EXISTS tmp_cnpj_ce (
                cnpj_basico VARCHAR(8)
            )
            ON COMMIT DELETE ROWS
            """
        )

        # ----------------------------------------------------
        # COPY
        # ----------------------------------------------------

        with cur.copy(
            """
            COPY tmp_cnpj_ce (
                cnpj_basico
            )
            FROM STDIN
            WITH (
                FORMAT CSV
            )
            """
        ) as copy:

            for cnpj in lote:
                copy.write_row((cnpj,))

        # ----------------------------------------------------
        # Inserção definitiva
        # ----------------------------------------------------

        cur.execute(
            """
            INSERT INTO public.cnpj_ce (
                cnpj_basico,
                competencia,
                carga_id
            )

            SELECT DISTINCT
                TRIM(cnpj_basico),
                %s,
                %s

            FROM tmp_cnpj_ce

            WHERE
                cnpj_basico IS NOT NULL

                AND LENGTH(
                    TRIM(cnpj_basico)
                ) = 8

            ON CONFLICT (
                cnpj_basico,
                competencia
            )

            DO NOTHING

            RETURNING cnpj_basico
            """,
            (
                competencia,
                carga_id,
            ),
        )

        inseridos = cur.fetchall()

    conn.commit()

    return len(inseridos)


# ============================================================
# PROCESSAR UM ZIP
# ============================================================

def processar_arquivo(
    conn,
    arquivo_zip,
    competencia,
    carga_id,
    totais,
):
    """
    Processa um arquivo Estabelecimentos*.zip.

    Apenas estabelecimentos fisicamente localizados no Ceará
    são utilizados para formar o conjunto de CNPJs básicos.
    """

    print()
    print("#" * 70)
    print(f"PROCESSANDO: {arquivo_zip.name}")
    print("#" * 70)

    lote = set()

    with zipfile.ZipFile(arquivo_zip, "r") as z:

        arquivos = [
            nome
            for nome in z.namelist()
            if nome.upper().endswith(".ESTABELE")
        ]

        if not arquivos:
            raise RuntimeError(
                f"Nenhum arquivo .ESTABELE encontrado em "
                f"{arquivo_zip.name}"
            )

        nome_arquivo = arquivos[0]

        print(f"Arquivo interno: {nome_arquivo}")
        print()

        with z.open(nome_arquivo) as arquivo:

            texto = io.TextIOWrapper(
                arquivo,
                encoding="latin1",
                errors="replace",
                newline="",
            )

            leitor = csv.reader(
                texto,
                delimiter=";",
                quotechar='"',
            )

            for linha in leitor:

                totais["lidos"] += 1

                # --------------------------------------------
                # Layout inválido
                # --------------------------------------------

                if len(linha) < 20:
                    totais["erros"] += 1
                    continue

                cnpj_basico = linha[0].strip()
                uf = linha[19].strip().upper()

                # --------------------------------------------
                # Somente estabelecimentos localizados no CE
                # --------------------------------------------

                if uf != UF_CEARA:
                    continue

                totais["estabelecimentos_ce"] += 1

                # --------------------------------------------
                # Validação do CNPJ básico
                # --------------------------------------------

                if len(cnpj_basico) != 8:
                    totais["erros"] += 1
                    continue

                lote.add(cnpj_basico)

                # --------------------------------------------
                # Processar lote
                # --------------------------------------------

                if len(lote) >= TAMANHO_LOTE:

                    inseridos = inserir_lote(
                        conn=conn,
                        lote=lote,
                        competencia=competencia,
                        carga_id=carga_id,
                    )

                    totais["processados"] += len(lote)
                    totais["inseridos"] += inseridos
                    totais["duplicados"] += (
                        len(lote) - inseridos
                    )

                    lote.clear()

                    atualizar_carga(
                        conn,
                        carga_id,
                        registros_lidos=totais["lidos"],
                        registros_processados=totais["processados"],
                        registros_inseridos=totais["inseridos"],
                        registros_duplicados=totais["duplicados"],
                        registros_erro=totais["erros"],
                    )

                    print(
                        f"Linhas analisadas: "
                        f"{totais['lidos']:,} | "
                        f"Estabelecimentos CE: "
                        f"{totais['estabelecimentos_ce']:,} | "
                        f"CNPJs inseridos: "
                        f"{totais['inseridos']:,} | "
                        f"Duplicados: "
                        f"{totais['duplicados']:,}"
                    )

            # ------------------------------------------------
            # Último lote do ZIP
            # ------------------------------------------------

            if lote:

                tamanho_lote = len(lote)

                inseridos = inserir_lote(
                    conn=conn,
                    lote=lote,
                    competencia=competencia,
                    carga_id=carga_id,
                )

                totais["processados"] += tamanho_lote
                totais["inseridos"] += inseridos
                totais["duplicados"] += (
                    tamanho_lote - inseridos
                )

                lote.clear()

                atualizar_carga(
                    conn,
                    carga_id,
                    registros_lidos=totais["lidos"],
                    registros_processados=totais["processados"],
                    registros_inseridos=totais["inseridos"],
                    registros_duplicados=totais["duplicados"],
                    registros_erro=totais["erros"],
                )


# ============================================================
# EXECUTAR ETL CNPJ CE
# ============================================================

def executar():
    """
    Identifica os CNPJs básicos que possuem pelo menos um
    estabelecimento localizado no Ceará.
    """

    arquivos = sorted(
        RAW_DIR.glob("Estabelecimentos*.zip")
    )

    if not arquivos:
        raise FileNotFoundError(
            "Nenhum ZIP de estabelecimentos encontrado em: "
            f"{RAW_DIR}"
        )

    conn = get_connection()

    carga_id = None

    totais = {
        "lidos": 0,
        "estabelecimentos_ce": 0,
        "processados": 0,
        "inseridos": 0,
        "duplicados": 0,
        "erros": 0,
    }

    try:

        # ----------------------------------------------------
        # Criar carga
        # ----------------------------------------------------

        carga_id = iniciar_carga(
            conn,
            TIPO_CARGA,
            COMPETENCIA,
        )

        print()
        print("=" * 70)
        print("IDENTIFICAÇÃO DOS CNPJS DO CEARÁ")
        print("=" * 70)
        print(f"Competência: {COMPETENCIA}")
        print(f"Carga ID:    {carga_id}")
        print(f"UF:          {UF_CEARA}")
        print()

        print("ARQUIVOS:")
        print()

        for arquivo in arquivos:
            print(f" - {arquivo.name}")

        print()
        print(f"Total de arquivos: {len(arquivos)}")

        # ----------------------------------------------------
        # Processar ZIPs
        # ----------------------------------------------------

        for arquivo in arquivos:

            processar_arquivo(
                conn=conn,
                arquivo_zip=arquivo,
                competencia=COMPETENCIA,
                carga_id=carga_id,
                totais=totais,
            )

        # ----------------------------------------------------
        # Quantidade da competência no banco
        # ----------------------------------------------------

        with conn.cursor() as cur:

            cur.execute(
                """
                SELECT COUNT(*)
                FROM public.cnpj_ce
                WHERE competencia = %s
                """,
                (COMPETENCIA,),
            )

            total_banco = cur.fetchone()[0]

        # ----------------------------------------------------
        # Finalizar carga
        # ----------------------------------------------------

        concluir_carga(
            conn,
            carga_id,
            registros_lidos=totais["lidos"],
            registros_processados=totais["processados"],
            registros_inseridos=totais["inseridos"],
            registros_duplicados=totais["duplicados"],
            registros_erro=totais["erros"],
        )

        # ----------------------------------------------------
        # Resultado
        # ----------------------------------------------------

        print()
        print("=" * 70)
        print("RESULTADO")
        print("=" * 70)

        print(
            f"Competência:              "
            f"{COMPETENCIA}"
        )

        print(
            f"Linhas analisadas:         "
            f"{totais['lidos']:,}"
        )

        print(
            f"Estabelecimentos no CE:    "
            f"{totais['estabelecimentos_ce']:,}"
        )

        print(
            f"CNPJs processados:         "
            f"{totais['processados']:,}"
        )

        print(
            f"CNPJs inseridos:           "
            f"{totais['inseridos']:,}"
        )

        print(
            f"CNPJs já existentes:       "
            f"{totais['duplicados']:,}"
        )

        print(
            f"Registros com erro:        "
            f"{totais['erros']:,}"
        )

        print(
            f"CNPJs na competência:      "
            f"{total_banco:,}"
        )

        print("=" * 70)

    except KeyboardInterrupt:

        if carga_id is not None:

            interromper_carga(
                conn,
                carga_id,
                registros_lidos=totais["lidos"],
                registros_processados=totais["processados"],
                registros_inseridos=totais["inseridos"],
                registros_duplicados=totais["duplicados"],
                registros_erro=totais["erros"],
            )

        print()
        print("Carga interrompida pelo usuário.")

        raise

    except Exception as erro:

        if carga_id is not None:

            falhar_carga(
                conn,
                carga_id,
                erro,
                registros_lidos=totais["lidos"],
                registros_processados=totais["processados"],
                registros_inseridos=totais["inseridos"],
                registros_duplicados=totais["duplicados"],
                registros_erro=totais["erros"],
            )

        print()
        print(f"Erro durante a carga CNPJ CE: {erro}")

        raise

    finally:

        conn.close()


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    executar()