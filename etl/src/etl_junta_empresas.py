import argparse
import csv
import time
from datetime import datetime, timedelta

from config import RAW_DIR, COMPETENCIA_JUNTA
from database import get_connection
from services.carga_service import (
    iniciar_carga,
    atualizar_carga,
    concluir_carga,
    falhar_carga,
    interromper_carga,
)


# ============================================================
# CONFIGURAÇÕES
# ============================================================

TIPO_CARGA = "JUNTA_EMPRESAS"

JUNTA_RAW_DIR = RAW_DIR / "junta"

PADRAO_ARQUIVO = "DADOS_DE_EMPRESAS_NO_ESTADO_CE_*.csv"

TAMANHO_LOTE = 10_000


CABECALHO_ESPERADO = [
    "CNPJ",
    "CNAES",
    "RAZAO_SOCIAL",
    "NOME_FANTASIA",
    "STATUS",
    "PORTE",
    "MUNICIPIO",
    "REGIAO",
    "NU_DDDTELEFONE",
    "NU_TELEFONE",
    "EMAIL",
    "TIPO_LOGRADOURO",
    "NOME_LOGRADOURO",
    "NUM_LOGRADOURO",
    "BAIRRO",
    "CD_OPCAO_SIMPLES_NACIONAL",
    "DATA_ABERTURA",
    "DATA_ENCERRAMENTO",
]

# ============================================================
# LOCALIZAR ARQUIVO
# ============================================================

def localizar_arquivo():
    if not JUNTA_RAW_DIR.exists():
        raise FileNotFoundError(
            "Diretório da Junta não encontrado: "
            f"{JUNTA_RAW_DIR}"
        )

    arquivos = sorted(
        JUNTA_RAW_DIR.glob(PADRAO_ARQUIVO)
    )

    if not arquivos:
        raise FileNotFoundError(
            "Nenhum arquivo da Junta encontrado em "
            f"{JUNTA_RAW_DIR}. "
            f"Padrão esperado: {PADRAO_ARQUIVO}"
        )

    if len(arquivos) > 1:
        nomes = "\n".join(
            f" - {arquivo.name}"
            for arquivo in arquivos
        )

        raise RuntimeError(
            "Foi encontrado mais de um arquivo da Junta.\n"
            "Mantenha somente o arquivo que deseja processar "
            "no diretório etl/data/raw/junta.\n\n"
            f"{nomes}"
        )

    return arquivos[0]


# ============================================================
# DESCOBRIR ENCODING
# ============================================================

def detectar_encoding(arquivo):
    """
    Testa encodings comuns para arquivos CSV brasileiros.
    """

    candidatos = (
        "utf-8-sig",
        "utf-8",
        "latin1",
    )

    for encoding in candidatos:
        try:
            with arquivo.open(
                "r",
                encoding=encoding,
                newline="",
            ) as f:
                f.read(100_000)

            return encoding

        except UnicodeDecodeError:
            continue

    raise RuntimeError(
        f"Não foi possível determinar o encoding de {arquivo.name}"
    )


# ============================================================
# VALIDAR CABEÇALHO
# ============================================================

def validar_cabecalho(
    arquivo,
    encoding,
):
    with arquivo.open(
        "r",
        encoding=encoding,
        newline="",
    ) as f:

        leitor = csv.reader(
            f,
            delimiter=",",
            quotechar='"',
        )

        try:
            cabecalho = next(leitor)

        except StopIteration:
            raise RuntimeError(
                "O arquivo da Junta está vazio."
            )

    cabecalho = [
        coluna.strip().upper()
        for coluna in cabecalho
    ]

    if cabecalho != CABECALHO_ESPERADO:
        print()
        print("Cabeçalho encontrado:")

        for coluna in cabecalho:
            print(f" - {coluna}")

        raise RuntimeError(
            "O cabeçalho do CSV da Junta não corresponde "
            "ao layout esperado."
        )


# ============================================================
# LIMPAR STAGING
# ============================================================

def limpar_staging(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            TRUNCATE TABLE staging.junta_empresas
            """
        )

    conn.commit()


# ============================================================
# COPY DO LOTE PARA STAGING
# ============================================================

def inserir_lote_staging(
    conn,
    lote,
):
    if not lote:
        return

    with conn.cursor() as cur:

        with cur.copy(
            """
            COPY staging.junta_empresas (
                cnpj,
                cnaes,
                razao_social,
                nome_fantasia,
                status,
                porte,
                municipio,
                regiao,
                nu_dddtelefone,
                nu_telefone,
                email,
                tipo_logradouro,
                nome_logradouro,
                num_logradouro,
                bairro,
                cd_opcao_simples_nacional,
                data_abertura,
                data_encerramento
            )
            FROM STDIN
            """
        ) as copy:

            for registro in lote:
                copy.write_row(registro)

    conn.commit()


# ============================================================
# CARREGAR CSV NO STAGING
# ============================================================

def carregar_staging(
    conn,
    arquivo,
    encoding,
    carga_id,
    totais,
):
    print()
    print("=" * 70)
    print("CARREGANDO CSV NO STAGING")
    print("=" * 70)

    lote = []

    with arquivo.open(
        "r",
        encoding=encoding,
        newline="",
    ) as f:

        leitor = csv.reader(
            f,
            delimiter=",",
            quotechar='"',
        )

        # Cabeçalho
        next(leitor)

        for numero_linha, linha in enumerate(
            leitor,
            start=2,
        ):
            totais["lidos"] += 1

            if len(linha) != 18:
                totais["erros"] += 1

                if totais["erros"] <= 20:
                    print(
                        f"AVISO: linha física {numero_linha:,} "
                        f"possui {len(linha)} colunas. "
                        "Esperado: 18."
                    )

                continue

            lote.append(
                tuple(
                    valor.strip()
                    if valor is not None
                    else None
                    for valor in linha
                )
            )

            if len(lote) >= TAMANHO_LOTE:
                inserir_lote_staging(
                    conn,
                    lote,
                )

                lote.clear()

                atualizar_carga(
                    conn,
                    carga_id,
                    registros_lidos=totais["lidos"],
                    registros_erro=totais["erros"],
                )

                print(
                    f"Linhas lidas: "
                    f"{totais['lidos']:,} | "
                    f"Erros de layout: "
                    f"{totais['erros']:,}"
                )

        if lote:
            inserir_lote_staging(
                conn,
                lote,
            )

            lote.clear()

    atualizar_carga(
        conn,
        carga_id,
        registros_lidos=totais["lidos"],
        registros_erro=totais["erros"],
    )

# ============================================================
# ANALISAR STAGING
# ============================================================

def analisar_staging(conn):
    """
    Analisa os dados brutos antes da promoção para public.

    Distingue:
    - registros sem CNPJ;
    - registros com CNPJ estruturalmente inválido;
    - CNPJ 00000000000000;
    - datas com formato inválido;
    - CNPJs com múltiplas ocorrências;
    - ocorrências adicionais;
    - duplicatas técnicas exatas.

    Não altera os dados.
    """

    with conn.cursor() as cur:

        # ----------------------------------------------------
        # TOTAL / CNPJ
        # ----------------------------------------------------

        cur.execute(
            """
            SELECT
                COUNT(*) AS total,

                COUNT(*) FILTER (
                    WHERE NULLIF(TRIM(cnpj), '') IS NULL
                ) AS sem_cnpj,

                COUNT(*) FILTER (
                    WHERE NULLIF(TRIM(cnpj), '') IS NOT NULL
                      AND (
                            length(
                                regexp_replace(
                                    cnpj,
                                    '[^0-9]',
                                    '',
                                    'g'
                                )
                            ) <> 14

                            OR regexp_replace(
                                cnpj,
                                '[^0-9]',
                                '',
                                'g'
                            ) = '00000000000000'
                      )
                ) AS cnpj_invalido

            FROM staging.junta_empresas
            """
        )

        (
            total,
            sem_cnpj,
            cnpj_invalido,
        ) = cur.fetchone()

        # ----------------------------------------------------
        # DATAS COM FORMATO INVÁLIDO
        # ----------------------------------------------------

        cur.execute(
            """
            SELECT COUNT(*)
            FROM staging.junta_empresas
            WHERE
                (
                    NULLIF(TRIM(data_abertura), '') IS NOT NULL
                    AND TRIM(data_abertura)
                        !~ '^\\d{2}-\\d{2}-\\d{4}( \\d{2}:\\d{2}:\\d{2}(\\.\\d+)?)?$'
                )
                OR
                (
                    NULLIF(TRIM(data_encerramento), '') IS NOT NULL
                    AND TRIM(data_encerramento)
                        !~ '^\\d{2}-\\d{2}-\\d{4}( \\d{2}:\\d{2}:\\d{2}(\\.\\d+)?)?$'
                )
            """
        )

        datas_formato_invalido = cur.fetchone()[0]

        # ----------------------------------------------------
        # CNPJS COM MÚLTIPLAS OCORRÊNCIAS
        # ----------------------------------------------------

        cur.execute(
            """
            WITH grupos AS (
                SELECT
                    regexp_replace(
                        cnpj,
                        '[^0-9]',
                        '',
                        'g'
                    ) AS cnpj_normalizado,

                    COUNT(*) AS quantidade

                FROM staging.junta_empresas

                WHERE NULLIF(TRIM(cnpj), '') IS NOT NULL

                  AND length(
                        regexp_replace(
                            cnpj,
                            '[^0-9]',
                            '',
                            'g'
                        )
                  ) = 14

                  AND regexp_replace(
                        cnpj,
                        '[^0-9]',
                        '',
                        'g'
                  ) <> '00000000000000'

                GROUP BY 1

                HAVING COUNT(*) > 1
            )

            SELECT
                COUNT(*) AS cnpjs_multiplas_ocorrencias,
                COALESCE(
                    SUM(quantidade - 1),
                    0
                ) AS ocorrencias_adicionais

            FROM grupos
            """
        )

        (
            cnpjs_multiplas_ocorrencias,
            ocorrencias_adicionais,
        ) = cur.fetchone()

        # ----------------------------------------------------
        # DUPLICATAS TÉCNICAS EXATAS
        # ----------------------------------------------------

        cur.execute(
            """
            WITH base AS (
                SELECT
                    regexp_replace(
                        cnpj,
                        '[^0-9]',
                        '',
                        'g'
                    ) AS cnpj,

                    NULLIF(TRIM(cnaes), '') AS cnaes,
                    NULLIF(TRIM(razao_social), '') AS razao_social,
                    NULLIF(TRIM(nome_fantasia), '') AS nome_fantasia,
                    NULLIF(TRIM(status), '') AS status,
                    NULLIF(TRIM(porte), '') AS porte,
                    NULLIF(TRIM(municipio), '') AS municipio,
                    NULLIF(TRIM(regiao), '') AS regiao,
                    NULLIF(TRIM(nu_dddtelefone), '') AS ddd,
                    NULLIF(TRIM(nu_telefone), '') AS telefone,
                    NULLIF(TRIM(email), '') AS email,
                    NULLIF(TRIM(tipo_logradouro), '') AS tipo_logradouro,
                    NULLIF(TRIM(nome_logradouro), '') AS logradouro,
                    NULLIF(TRIM(num_logradouro), '') AS numero,
                    NULLIF(TRIM(bairro), '') AS bairro,
                    NULLIF(
                        TRIM(cd_opcao_simples_nacional),
                        ''
                    ) AS simples,
                    NULLIF(TRIM(data_abertura), '') AS data_abertura,
                    NULLIF(
                        TRIM(data_encerramento),
                        ''
                    ) AS data_encerramento

                FROM staging.junta_empresas

                WHERE length(
                    regexp_replace(
                        COALESCE(cnpj, ''),
                        '[^0-9]',
                        '',
                        'g'
                    )
                ) = 14

                AND regexp_replace(
                    cnpj,
                    '[^0-9]',
                    '',
                    'g'
                ) <> '00000000000000'
            ),

            repetidos AS (
                SELECT
                    COUNT(*) AS quantidade

                FROM base

                GROUP BY
                    cnpj,
                    cnaes,
                    razao_social,
                    nome_fantasia,
                    status,
                    porte,
                    municipio,
                    regiao,
                    ddd,
                    telefone,
                    email,
                    tipo_logradouro,
                    logradouro,
                    numero,
                    bairro,
                    simples,
                    data_abertura,
                    data_encerramento

                HAVING COUNT(*) > 1
            )

            SELECT
                COALESCE(
                    SUM(quantidade - 1),
                    0
                )
            FROM repetidos
            """
        )

        duplicatas_exatas = int(
            cur.fetchone()[0]
        )

    return {
        "total": total,
        "sem_cnpj": sem_cnpj,
        "cnpj_invalido": cnpj_invalido,
        "datas_formato_invalido": datas_formato_invalido,
        "cnpjs_multiplas_ocorrencias": (
            cnpjs_multiplas_ocorrencias
        ),
        "ocorrencias_adicionais": ocorrencias_adicionais,
        "duplicatas_exatas": duplicatas_exatas,
    }


# ============================================================
# PROCESSAR LOTE PARA PUBLIC
# ============================================================

def preparar_dados_validos(conn):
    """
    Cria tabela temporária com as ocorrências válidas da Junta.

    Regras:
    - remove CNPJ vazio;
    - remove CNPJ estruturalmente inválido;
    - remove CNPJ 00000000000000;
    - preserva múltiplas ocorrências do mesmo CNPJ;
    - remove apenas duplicatas técnicas 100% idênticas.

    ocorrencia_id é uma chave técnica usada somente durante
    esta execução para relacionar a ocorrência aos seus CNAEs.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            DROP TABLE IF EXISTS tmp_junta_empresas_validas
            """
        )

        cur.execute(
            """
            CREATE TEMP TABLE tmp_junta_empresas_validas
            ON COMMIT PRESERVE ROWS
            AS

            WITH origem AS (

                SELECT
                    regexp_replace(
                        COALESCE(cnpj, ''),
                        '[^0-9]',
                        '',
                        'g'
                    ) AS cnpj_normalizado,

                    cnaes,
                    razao_social,
                    nome_fantasia,
                    status,
                    porte,
                    municipio,
                    regiao,
                    nu_dddtelefone,
                    nu_telefone,
                    email,
                    tipo_logradouro,
                    nome_logradouro,
                    num_logradouro,
                    bairro,
                    cd_opcao_simples_nacional,
                    data_abertura,
                    data_encerramento

                FROM staging.junta_empresas
            ),

            validos AS (

                SELECT *

                FROM origem

                WHERE length(cnpj_normalizado) = 14
                  AND cnpj_normalizado <> '00000000000000'
            ),

            sem_duplicata_exata AS (

                SELECT
                    *,

                    ROW_NUMBER() OVER (
                        PARTITION BY
                            cnpj_normalizado,
                            COALESCE(cnaes, ''),
                            COALESCE(razao_social, ''),
                            COALESCE(nome_fantasia, ''),
                            COALESCE(status, ''),
                            COALESCE(porte, ''),
                            COALESCE(municipio, ''),
                            COALESCE(regiao, ''),
                            COALESCE(nu_dddtelefone, ''),
                            COALESCE(nu_telefone, ''),
                            COALESCE(email, ''),
                            COALESCE(tipo_logradouro, ''),
                            COALESCE(nome_logradouro, ''),
                            COALESCE(num_logradouro, ''),
                            COALESCE(bairro, ''),
                            COALESCE(
                                cd_opcao_simples_nacional,
                                ''
                            ),
                            COALESCE(data_abertura, ''),
                            COALESCE(data_encerramento, '')

                        ORDER BY cnpj_normalizado
                    ) AS rn

                FROM validos
            ),

            normalizados AS (

                SELECT
                    cnpj_normalizado AS cnpj,

                    NULLIF(
                        TRIM(razao_social),
                        ''
                    ) AS razao_social,

                    NULLIF(
                        TRIM(nome_fantasia),
                        ''
                    ) AS nome_fantasia,

                    UPPER(
                        NULLIF(
                            TRIM(status),
                            ''
                        )
                    ) AS status,

                    UPPER(
                        NULLIF(
                            TRIM(porte),
                            ''
                        )
                    ) AS porte,

                    NULLIF(
                        TRIM(municipio),
                        ''
                    ) AS municipio,

                    NULLIF(
                        TRIM(regiao),
                        ''
                    ) AS regiao,

                    CASE
                        WHEN length(
                            regexp_replace(
                                COALESCE(
                                    nu_dddtelefone,
                                    ''
                                ),
                                '[^0-9]',
                                '',
                                'g'
                            )
                        ) = 2
                        THEN regexp_replace(
                            nu_dddtelefone,
                            '[^0-9]',
                            '',
                            'g'
                        )
                        ELSE NULL
                    END AS ddd_telefone,

                    NULLIF(
                        regexp_replace(
                            COALESCE(
                                nu_telefone,
                                ''
                            ),
                            '[^0-9]',
                            '',
                            'g'
                        ),
                        ''
                    ) AS telefone,

                    NULLIF(
                        TRIM(email),
                        ''
                    ) AS email,

                    NULLIF(
                        TRIM(tipo_logradouro),
                        ''
                    ) AS tipo_logradouro,

                    NULLIF(
                        TRIM(nome_logradouro),
                        ''
                    ) AS logradouro,

                    NULLIF(
                        TRIM(num_logradouro),
                        ''
                    ) AS numero,

                    NULLIF(
                        TRIM(bairro),
                        ''
                    ) AS bairro,

                    CASE
                        WHEN UPPER(
                            TRIM(
                                COALESCE(
                                    cd_opcao_simples_nacional,
                                    ''
                                )
                            )
                        ) IN ('S', 'N')
                        THEN UPPER(
                            TRIM(
                                cd_opcao_simples_nacional
                            )
                        )
                        ELSE NULL
                    END AS opcao_simples_nacional,

                    CASE
                        WHEN NULLIF(
                            TRIM(data_abertura),
                            ''
                        ) IS NULL
                        THEN NULL

                        WHEN TRIM(data_abertura)
                            ~ '^\\d{2}-\\d{2}-\\d{4}'
                        THEN TO_DATE(
                            SUBSTRING(
                                TRIM(data_abertura)
                                FROM 1 FOR 10
                            ),
                            'DD-MM-YYYY'
                        )

                        ELSE NULL
                    END AS data_abertura,

                    CASE
                        WHEN NULLIF(
                            TRIM(data_encerramento),
                            ''
                        ) IS NULL
                        THEN NULL

                        WHEN TRIM(data_encerramento)
                            ~ '^\\d{2}-\\d{2}-\\d{4}'
                        THEN TO_DATE(
                            SUBSTRING(
                                TRIM(data_encerramento)
                                FROM 1 FOR 10
                            ),
                            'DD-MM-YYYY'
                        )

                        ELSE NULL
                    END AS data_encerramento,

                    cnaes

                FROM sem_duplicata_exata

                WHERE rn = 1
            )

            SELECT
                ROW_NUMBER() OVER ()::BIGINT
                    AS ocorrencia_id,

                normalizados.*

            FROM normalizados
            """
        )

        cur.execute(
            """
            CREATE UNIQUE INDEX
            ON tmp_junta_empresas_validas (
                ocorrencia_id
            )
            """
        )

        cur.execute(
            """
            SELECT COUNT(*)
            FROM tmp_junta_empresas_validas
            """
        )

        total_validos = cur.fetchone()[0]

    conn.commit()

    return total_validos


# ============================================================
# ANALISAR DATAS
# ============================================================

def analisar_qualidade_datas(conn):
    """
    Analisa anomalias de qualidade nas datas dos registros válidos
    da Junta Comercial.

    As anomalias não impedem a carga.
    """

    # Último dia da competência.
    ano, mes = map(int, COMPETENCIA_JUNTA.split("-"))

    if mes == 12:
        proximo_ano = ano + 1
        proximo_mes = 1
    else:
        proximo_ano = ano
        proximo_mes = mes + 1

    limite_competencia = (
        datetime(proximo_ano, proximo_mes, 1).date()
        - timedelta(days=1)
    )

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (
                    WHERE data_abertura < DATE '1800-01-01'
                ) AS abertura_antes_1800,

                COUNT(*) FILTER (
                    WHERE data_abertura > %s
                ) AS abertura_futura,

                COUNT(*) FILTER (
                    WHERE data_encerramento > %s
                ) AS encerramento_futuro,

                COUNT(*) FILTER (
                    WHERE data_abertura IS NOT NULL
                      AND data_encerramento IS NOT NULL
                      AND data_encerramento < data_abertura
                ) AS encerramento_antes_abertura

            FROM tmp_junta_empresas_validas
            """,
            (
                limite_competencia,
                limite_competencia,
            ),
        )

        resultado = cur.fetchone()

    return {
        "abertura_antes_1800": resultado[0],
        "abertura_futura": resultado[1],
        "encerramento_futuro": resultado[2],
        "encerramento_antes_abertura": resultado[3],
    }

# ============================================================
# ESTATÍSTICAS DO STAGING
# ============================================================

def exibir_estatisticas_staging(conn):
    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT COUNT(*)
            FROM staging.junta_empresas
            """
        )

        total = cur.fetchone()[0]

        cur.execute(
            """
            SELECT COUNT(DISTINCT cnpj)
            FROM staging.junta_empresas
            WHERE NULLIF(TRIM(cnpj), '') IS NOT NULL
            """
        )

        cnpjs_distintos = cur.fetchone()[0]

        cur.execute(
            """
            SELECT
                status,
                COUNT(*)
            FROM staging.junta_empresas
            GROUP BY status
            ORDER BY COUNT(*) DESC
            """
        )

        status = cur.fetchall()

    print()
    print("=" * 70)
    print("ESTATÍSTICAS DO STAGING")
    print("=" * 70)

    print(
        f"Registros no staging: "
        f"{total:,}"
    )

    print(
        f"CNPJs distintos:       "
        f"{cnpjs_distintos:,}"
    )

    print()
    print("Status encontrados:")

    for descricao, quantidade in status:
        print(
            f" - {descricao or '(vazio)'}: "
            f"{quantidade:,}"
        )

    print("=" * 70)


def promover_empresas(
    conn,
    carga_id,
):
    """
    Insere em massa todas as ocorrências válidas da Junta.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            INSERT INTO public.junta_empresas (
                cnpj,
                razao_social,
                nome_fantasia,
                status,
                porte,
                municipio,
                regiao,
                ddd_telefone,
                telefone,
                email,
                tipo_logradouro,
                logradouro,
                numero,
                bairro,
                opcao_simples_nacional,
                data_abertura,
                data_encerramento,
                competencia,
                carga_id,
                ocorrencia_arquivo
            )

            SELECT
                origem.cnpj,
                origem.razao_social,
                origem.nome_fantasia,
                origem.status,
                origem.porte,
                origem.municipio,
                origem.regiao,
                origem.ddd_telefone,
                origem.telefone,
                origem.email,
                origem.tipo_logradouro,
                origem.logradouro,
                origem.numero,
                origem.bairro,
                origem.opcao_simples_nacional,
                origem.data_abertura,
                origem.data_encerramento,
                %s,
                %s,
                origem.ocorrencia_id

            FROM tmp_junta_empresas_validas origem
            """,
            (
                COMPETENCIA_JUNTA,
                carga_id,
            ),
        )

        inseridos = cur.rowcount

    return inseridos


def promover_cnaes(
    conn,
    carga_id,
):
    """
    Relaciona os CNAEs à ocorrência exata da Junta.

    ordem representa somente a posição do CNAE
    na lista recebida no CSV.

    Não significa CNAE principal.
    """

    with conn.cursor() as cur:

        # ----------------------------------------------------
        # CNAES DESCONHECIDOS
        # ----------------------------------------------------

        cur.execute(
            """
            WITH cnaes_separados AS (

                SELECT DISTINCT
                    empresa.ocorrencia_id,
                    TRIM(item.codigo)
                        AS cnae_codigo

                FROM tmp_junta_empresas_validas empresa

                CROSS JOIN LATERAL
                    regexp_split_to_table(
                        COALESCE(
                            empresa.cnaes,
                            ''
                        ),
                        ','
                    ) AS item(codigo)

                WHERE
                    TRIM(item.codigo)
                        ~ '^[0-9]{7}$'

                    AND TRIM(item.codigo)
                        <> '0000000'
            )

            SELECT COUNT(*)

            FROM cnaes_separados origem

            LEFT JOIN public.cnaes dominio
                ON dominio.codigo
                    = origem.cnae_codigo

            WHERE dominio.codigo IS NULL
            """
        )

        desconhecidos = cur.fetchone()[0]

        # ----------------------------------------------------
        # INSERT DOS CNAES
        # ----------------------------------------------------

        cur.execute(
            """
            WITH cnaes_separados AS (

                SELECT
                    empresa.ocorrencia_id,

                    TRIM(item.codigo)
                        AS cnae_codigo,

                    item.ordem::SMALLINT
                        AS ordem

                FROM tmp_junta_empresas_validas empresa

                CROSS JOIN LATERAL
                    regexp_split_to_table(
                        COALESCE(
                            empresa.cnaes,
                            ''
                        ),
                        ','
                    )

                    WITH ORDINALITY
                    AS item(
                        codigo,
                        ordem
                    )

                WHERE
                    TRIM(item.codigo)
                        ~ '^[0-9]{7}$'

                    AND TRIM(item.codigo)
                        <> '0000000'
            ),

            cnaes_sem_duplicidade AS (

                SELECT DISTINCT ON (
                    ocorrencia_id,
                    cnae_codigo
                )

                    ocorrencia_id,
                    cnae_codigo,
                    ordem

                FROM cnaes_separados

                ORDER BY
                    ocorrencia_id,
                    cnae_codigo,
                    ordem
            )

            INSERT INTO public.junta_empresa_cnaes (
                junta_empresa_id,
                cnae_codigo,
                ordem,
                carga_id
            )

            SELECT
                empresa.id,
                origem.cnae_codigo,
                origem.ordem,
                %s

            FROM cnaes_sem_duplicidade origem

            INNER JOIN public.junta_empresas empresa
                ON empresa.competencia = %s
               AND empresa.ocorrencia_arquivo
                    = origem.ocorrencia_id

            INNER JOIN public.cnaes dominio
                ON dominio.codigo
                    = origem.cnae_codigo

            ON CONFLICT (
                junta_empresa_id,
                cnae_codigo
            )
            DO NOTHING
            """,
            (
                carga_id,
                COMPETENCIA_JUNTA,
            ),
        )

        inseridos = cur.rowcount

    return (
        inseridos,
        desconhecidos,
    )


# ============================================================
# LER STAGING
# ============================================================

def processar_staging(
    conn,
    carga_id,
    totais,
    reprocessar=False,
):
    print()
    print("=" * 70)
    print("PROCESSANDO STAGING")
    print("=" * 70)

    # --------------------------------------------------------
    # ANÁLISE DO STAGING
    # --------------------------------------------------------

    estatisticas = analisar_staging(conn)

    print(
        f"Registros staging:       "
        f"{estatisticas['total']:,}"
    )

    print(
        f"Sem CNPJ:                "
        f"{estatisticas['sem_cnpj']:,}"
    )

    print(
        f"CNPJ inválido:            "
        f"{estatisticas['cnpj_invalido']:,}"
    )

    print(
        f"Datas formato inválido:   "
        f"{estatisticas['datas_formato_invalido']:,}"
    )

    print(
    f"CNPJs com múltiplas ocorrências: "
    f"{estatisticas['cnpjs_multiplas_ocorrencias']:,}"
    )

    print(
    f"Ocorrências adicionais:          "
    f"{estatisticas['ocorrencias_adicionais']:,}"
    )

    print(
    f"Duplicatas técnicas exatas:      "
    f"{estatisticas['duplicatas_exatas']:,}"
    )

    # --------------------------------------------------------
    # PREPARAÇÃO DOS REGISTROS VÁLIDOS
    # --------------------------------------------------------

    print()
    print("Preparando registros válidos...")

    validos = preparar_dados_validos(conn)

    print(
    f"Ocorrências válidas:      "
    f"{validos:,}"
    )

    # --------------------------------------------------------
    # QUALIDADE DAS DATAS
    # --------------------------------------------------------

    qualidade_datas = analisar_qualidade_datas(conn)

    print()
    print("Anomalias de qualidade das datas:")

    print(
        f" - Abertura antes de 1800:       "
        f"{qualidade_datas['abertura_antes_1800']:,}"
    )

    print(
        f" - Abertura futura:               "
        f"{qualidade_datas['abertura_futura']:,}"
    )

    print(
        f" - Encerramento futuro:           "
        f"{qualidade_datas['encerramento_futuro']:,}"
    )

    print(
        f" - Encerramento antes abertura:   "
        f"{qualidade_datas['encerramento_antes_abertura']:,}"
    )

        # --------------------------------------------------------
    # PROMOÇÃO PARA PUBLIC
    # --------------------------------------------------------

    try:

        if reprocessar:

            print()
            print("Substituindo competência existente...")

            removidos = limpar_competencia(
                conn
            )

            print(
                f"Ocorrências removidas:       "
                f"{removidos['empresas']:,}"
            )

            print(
                f"Vínculos CNAE removidos:  "
                f"{removidos['cnaes']:,}"
            )

        print()
        print("Inserindo empresas...")

        inseridos = promover_empresas(
            conn,
            carga_id,
        )

        print("Relacionando CNAEs...")

        (
            cnaes_inseridos,
            cnaes_desconhecidos,
        ) = promover_cnaes(
            conn,
            carga_id,
        )

        # DELETE + empresas + CNAEs tornam-se permanentes
        # somente aqui.
        conn.commit()

    except Exception:

        # Se qualquer operação da promoção falhar,
        # desfaz DELETE + INSERT empresas + INSERT CNAEs.
        conn.rollback()

        raise

    # --------------------------------------------------------
    # CONTADORES
    # --------------------------------------------------------

    totais["processados"] = validos

    totais["inseridos"] = inseridos

    totais["duplicados"] = (estatisticas["duplicatas_exatas"])

    totais["erros"] += (
        estatisticas["sem_cnpj"]
        + estatisticas["cnpj_invalido"]
        + estatisticas["datas_formato_invalido"]
    )

    totais["cnaes_inseridos"] = (
        cnaes_inseridos
    )

    totais["cnaes_desconhecidos"] = (
        cnaes_desconhecidos
    )

    # --------------------------------------------------------
    # ATUALIZAR CARGA
    # --------------------------------------------------------

    atualizar_carga(
        conn,
        carga_id,
        registros_lidos=totais["lidos"],
        registros_processados=totais["processados"],
        registros_inseridos=totais["inseridos"],
        registros_atualizados=0,
        registros_duplicados=totais["duplicados"],
        registros_erro=totais["erros"],
    )

    # --------------------------------------------------------
    # RESUMO
    # --------------------------------------------------------

    print()
    print("-" * 70)

    print(
        f"Ocorrências processadas:    "
        f"{totais['processados']:,}"
    )

    print(
        f"Ocorrências inseridas:      "
        f"{totais['inseridos']:,}"
    )

    print(
        f"Duplicados:               "
        f"{totais['duplicados']:,}"
    )

    print(
        f"Erros:                    "
        f"{totais['erros']:,}"
    )

    print(
        f"CNAEs vinculados:         "
        f"{totais['cnaes_inseridos']:,}"
    )

    print(
        f"CNAEs desconhecidos:      "
        f"{totais['cnaes_desconhecidos']:,}"
    )

    print("-" * 70)


# ============================================================
# REPROCESSAR
# ============================================================

def obter_argumentos():
    parser = argparse.ArgumentParser(
        description=(
            "Carga de empresas da Junta Comercial "
            "do Estado do Ceará."
        )
    )

    parser.add_argument(
        "--reprocessar",
        action="store_true",
        help=(
            "Remove e recria os dados da competência "
            "da Junta caso ela já tenha sido carregada."
        ),
    )

    return parser.parse_args()

def verificar_competencia_existente(conn):
    """
    Verifica quantas empresas da competência atual
    já existem em public.junta_empresas.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT COUNT(*)
            FROM public.junta_empresas
            WHERE competencia = %s
            """,
            (
                COMPETENCIA_JUNTA,
            ),
        )

        return cur.fetchone()[0]

def limpar_competencia(conn):
    """
    Remove os dados da competência da Junta.

    Os registros de public.junta_empresa_cnaes são
    removidos automaticamente pelo ON DELETE CASCADE.

    Não remove registros de public.cargas, preservando
    o histórico das execuções.
    """

    with conn.cursor() as cur:

        # ----------------------------------------------------
        # CONTAGEM ANTES DA EXCLUSÃO
        # ----------------------------------------------------

        cur.execute(
            """
            SELECT COUNT(*)
            FROM public.junta_empresas
            WHERE competencia = %s
            """,
            (
                COMPETENCIA_JUNTA,
            ),
        )

        empresas = cur.fetchone()[0]

        cur.execute(
            """
            SELECT COUNT(*)
            FROM public.junta_empresa_cnaes jec

            INNER JOIN public.junta_empresas je
                ON je.id = jec.junta_empresa_id

            WHERE je.competencia = %s
            """,
            (
                COMPETENCIA_JUNTA,
            ),
        )

        cnaes = cur.fetchone()[0]

        # ----------------------------------------------------
        # EXCLUSÃO
        # ----------------------------------------------------

        cur.execute(
            """
            DELETE FROM public.junta_empresas
            WHERE competencia = %s
            """,
            (
                COMPETENCIA_JUNTA,
            ),
        )

    return {
        "empresas": empresas,
        "cnaes": cnaes,
    }



# ============================================================
# MAIN
# ============================================================

def main():

    args = obter_argumentos()
    conn = get_connection()
    carga_id = None
    totais = {
        "lidos": 0,
        "processados": 0,
        "inseridos": 0,
        "atualizados": 0,
        "duplicados": 0,
        "erros": 0,

        # Contadores específicos da Junta.
        # Não são gravados em public.cargas.
        "cnaes_inseridos": 0,
        "cnaes_desconhecidos": 0,
    }

    inicio = time.time()

    try:

        # ----------------------------------------------------
        # ARQUIVO
        # ----------------------------------------------------

        arquivo = localizar_arquivo()
        encoding = detectar_encoding(
            arquivo
        )

        validar_cabecalho(
            arquivo,
            encoding,
        )

        # ----------------------------------------------------
        # VERIFICAR COMPETÊNCIA
        # ----------------------------------------------------

        registros_existentes = (
            verificar_competencia_existente(
                conn
            )
        )

        substituir_competencia = (
            args.reprocessar
            and registros_existentes > 0
        )

        if registros_existentes > 0:
            if not args.reprocessar:

                print()
                print("*" * 70)
                print("CARGA NÃO EXECUTADA")
                print("*" * 70)

                print(
                    f"A competência {COMPETENCIA_JUNTA}"
                    "da Junta Comercial já foi carregado."
                    )
                print(
                    f"Empresas existentes: "
                    f"{registros_existentes:,}"
                )
                print()
                print("Para substituir essa competência:")
                print()
                print(
                    "    python etl_junta_empresas.py "
                    "--reprocessar"
                )

                print("=" * 70)

                return
            print()
            print("=" * 70)
            print("REPROCESSAMENTO DA JUNTA COMERCIAL")
            print("=" * 70)

            print(
                f"Competência: "
                f"{COMPETENCIA_JUNTA}"
            )

            print(
                f"Empresas existentes: "
                f"{registros_existentes:,}"
            )

            print()
            print(
                "A competência existente será substituída "
                "somente após a validação do novo arquivo."
            )
            print("=" * 70)

        # ----------------------------------------------------
        # CARGA
        # ----------------------------------------------------

        carga_id = iniciar_carga(
            conn,
            TIPO_CARGA,
            COMPETENCIA_JUNTA,
        )

        print()
        print("=" * 70)
        print("CARGA DE EMPRESAS - JUNTA COMERCIAL")
        print("=" * 70)

        print(
            f"Competência: "
            f"{COMPETENCIA_JUNTA}"
        )

        print(
            f"Carga ID:    "
            f"{carga_id}"
        )

        print(
            f"Modo:        "
            f"{'REPROCESSAMENTO' if args.reprocessar else 'CARGA NORMAL'}"
        )

        print(
            f"Arquivo:     "
            f"{arquivo.name}"
        )

        print(
            f"Encoding:    "
            f"{encoding}"
        )

        print("=" * 70)

        # ----------------------------------------------------
        # STAGING
        # ----------------------------------------------------

        print()
        print("Limpando staging...")

        limpar_staging(
            conn
        )

        carregar_staging(
            conn=conn,
            arquivo=arquivo,
            encoding=encoding,
            carga_id=carga_id,
            totais=totais,
        )

        exibir_estatisticas_staging(
            conn
        )

        # ----------------------------------------------------
        # PUBLIC
        # ----------------------------------------------------

        processar_staging(
            conn=conn,
            carga_id=carga_id,
            totais=totais,
            reprocessar=substituir_competencia,
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
            registros_atualizados=(
                totais["atualizados"]
            ),
            registros_duplicados=(
                totais["duplicados"]
            ),
            registros_erro=(
                totais["erros"]
            ),
        )

        tempo = (
            time.time()
            - inicio
        )

        print(
            f"Modo:        "
            f"{'REPROCESSAMENTO' if substituir_competencia else 'CARGA NORMAL'}"
        )

        print()
        print("=" * 70)
        print("CARGA DA JUNTA COMERCIAL CONCLUÍDA")
        print("=" * 70)

        print(
            f"Linhas lidas:           "
            f"{totais['lidos']:,}"
        )

        print(
            f"Empresas processadas:   "
            f"{totais['processados']:,}"
        )

        print(
            f"Empresas inseridas:     "
            f"{totais['inseridos']:,}"
        )

        print(
            f"Duplicados:              "
            f"{totais['duplicados']:,}"
        )

        print(
            f"Erros:                   "
            f"{totais['erros']:,}"
        )

        print(
            f"CNAEs vinculados:        "
            f"{totais['cnaes_inseridos']:,}"
        )

        print(
            f"CNAEs desconhecidos:     "
            f"{totais['cnaes_desconhecidos']:,}"
        )

        print(
            f"Tempo:                   "
            f"{tempo / 60:.2f} minutos"
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
                registros_atualizados=(
                    totais["atualizados"]
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
            "PROCESSAMENTO INTERROMPIDO PELO USUÁRIO"
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
                registros_atualizados=(
                    totais["atualizados"]
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
        print("ERRO NA CARGA DA JUNTA")
        print("=" * 70)
        print(erro)
        print("=" * 70)

        raise

    finally:

        conn.close()


if __name__ == "__main__":
    main()