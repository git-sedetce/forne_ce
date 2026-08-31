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


TIPO_CARGA = "SOCIOS"
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

def carregar_cnpjs_ce(
    conn,
    competencia,
):
    """
    Carrega somente os CNPJs pertencentes à competência
    que está sendo processada.
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

def carregar_empresas(
    conn,
    competencia,
):
    """
    Retorna um mapa:

        cnpj_basico -> empresa_id

    somente da competência atual.
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
    Insere um lote de sócios.

    A constraint UNIQUE da tabela public.socios é responsável
    pela identificação das duplicidades.

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
                CREATE TEMP TABLE IF NOT EXISTS tmp_socios (

                    empresa_id BIGINT,

                    tipo_socio_codigo VARCHAR(2),

                    nome_socio TEXT,

                    documento_socio VARCHAR(20),

                    qualificacao_codigo VARCHAR(2),

                    data_entrada DATE,

                    pais_codigo VARCHAR(3),

                    representante_legal_documento VARCHAR(20),

                    representante_legal_nome TEXT,

                    qualificacao_representante_codigo VARCHAR(2),

                    faixa_etaria VARCHAR(2)
                )
                ON COMMIT DELETE ROWS
                """
            )

            # ------------------------------------------------
            # COPY
            # ------------------------------------------------

            with cur.copy(
                """
                COPY tmp_socios (

                    empresa_id,

                    tipo_socio_codigo,

                    nome_socio,

                    documento_socio,

                    qualificacao_codigo,

                    data_entrada,

                    pais_codigo,

                    representante_legal_documento,

                    representante_legal_nome,

                    qualificacao_representante_codigo,

                    faixa_etaria
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
                INSERT INTO public.socios (

                    empresa_id,

                    tipo_socio_codigo,

                    nome_socio,

                    documento_socio,

                    qualificacao_codigo,

                    data_entrada,

                    pais_codigo,

                    representante_legal_documento,

                    representante_legal_nome,

                    qualificacao_representante_codigo,

                    faixa_etaria,

                    competencia,

                    carga_id
                )

                SELECT

                    empresa_id,

                    tipo_socio_codigo,

                    nome_socio,

                    documento_socio,

                    qualificacao_codigo,

                    data_entrada,

                    pais_codigo,

                    representante_legal_documento,

                    representante_legal_nome,

                    qualificacao_representante_codigo,

                    faixa_etaria,

                    %s,

                    %s

                FROM tmp_socios

                ON CONFLICT (
                    empresa_id,
                    tipo_socio_codigo,
                    documento_socio,
                    qualificacao_codigo,
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
        print("ERRO AO INSERIR LOTE DE SÓCIOS")
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
    qualificacoes_validas,
    paises_validos,
    carga_id,
    totais,
):
    """
    Processa um arquivo Socios*.zip.
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
                ".SOCIOCSV"
            )
        ]

        if not csv_files:

            raise RuntimeError(
                "Nenhum arquivo SOCIOCSV "
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

                    if len(linha) != 11:

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
                    # FILTRO CE
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
                    # TIPO DO SÓCIO
                    # ----------------------------------------

                    tipo_socio = (
                        normalizar_texto(
                            linha[1]
                        )
                    )

                    # ----------------------------------------
                    # NOME
                    # ----------------------------------------

                    nome_socio = (
                        normalizar_texto(
                            linha[2]
                        )
                    )

                    # ----------------------------------------
                    # DOCUMENTO
                    # ----------------------------------------

                    documento_socio = (
                        normalizar_texto(
                            linha[3]
                        )
                    )

                    # ----------------------------------------
                    # QUALIFICAÇÃO
                    # ----------------------------------------

                    qualificacao = (
                        normalizar_texto(
                            linha[4]
                        )
                    )

                    if (
                        qualificacao
                        and qualificacao
                        not in qualificacoes_validas
                    ):

                        qualificacao = None

                    # ----------------------------------------
                    # DATA ENTRADA
                    # ----------------------------------------

                    data_entrada = converter_data(
                        linha[5]
                    )

                    # ----------------------------------------
                    # PAÍS
                    # ----------------------------------------

                    pais = (
                        normalizar_texto(
                            linha[6]
                        )
                    )

                    if (
                        pais
                        and pais
                        not in paises_validos
                    ):

                        pais = None

                    # ----------------------------------------
                    # REPRESENTANTE LEGAL
                    # ----------------------------------------

                    representante_documento = (
                        normalizar_texto(
                            linha[7]
                        )
                    )

                    representante_nome = (
                        normalizar_texto(
                            linha[8]
                        )
                    )

                    # Importante:
                    #
                    # qualificacao_representante_codigo
                    # atualmente não possui FK para a tabela
                    # qualificacoes, portanto preservamos o valor
                    # original da Receita.

                    qualificacao_representante = (
                        normalizar_texto(
                            linha[9]
                        )
                    )

                    # ----------------------------------------
                    # FAIXA ETÁRIA
                    # ----------------------------------------

                    faixa_etaria = (
                        normalizar_texto(
                            linha[10]
                        )
                    )

                    # ----------------------------------------
                    # LOTE
                    # ----------------------------------------

                    lote.append(
                        (
                            empresa_id,
                            tipo_socio,
                            nome_socio,
                            documento_socio,
                            qualificacao,
                            data_entrada,
                            pais,
                            representante_documento,
                            representante_nome,
                            qualificacao_representante,
                            faixa_etaria,
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
                            f"Sócios CE: "
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
        print("CARGA DE SÓCIOS DO CEARÁ")
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

        qualificacoes_validas = (
            carregar_codigos_validos(
                conn,
                "qualificacoes",
            )
        )

        paises_validos = (
            carregar_codigos_validos(
                conn,
                "paises",
            )
        )

        print(
            f"Qualificações válidas: "
            f"{len(qualificacoes_validas):,}"
        )

        print(
            f"Países válidos:        "
            f"{len(paises_validos):,}"
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
        # ARQUIVOS
        # ----------------------------------------------------

        arquivos = sorted(
            RAW_DIR.glob(
                "Socios*.zip"
            )
        )

        if not arquivos:

            raise FileNotFoundError(
                "Nenhum Socios*.zip encontrado "
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
        # PROCESSAMENTO
        # ----------------------------------------------------

        for arquivo in arquivos:

            processar_arquivo(
                arquivo=arquivo,
                conn=conn,
                cnpjs_ce=cnpjs_ce,
                empresas=empresas,
                qualificacoes_validas=(
                    qualificacoes_validas
                ),
                paises_validos=paises_validos,
                carga_id=carga_id,
                totais=totais,
            )

        # ----------------------------------------------------
        # CONCLUSÃO
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
        print("CARGA DE SÓCIOS CONCLUÍDA")
        print("=" * 70)

        print(
            f"Linhas lidas: "
            f"{totais['lidos']:,}"
        )

        print(
            f"Sócios CE:    "
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
        print("ERRO NA CARGA")
        print("=" * 70)
        print(erro)
        print("=" * 70)

        raise

    finally:

        conn.close()


if __name__ == "__main__":
    main()