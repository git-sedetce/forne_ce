import csv
import re
import time
from datetime import datetime
from pathlib import Path

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
# NORMALIZAÇÕES
# ============================================================

def normalizar_texto(valor):
    if valor is None:
        return None

    valor = valor.strip()

    return valor or None


def somente_digitos(valor):
    if not valor:
        return None

    valor = re.sub(
        r"\D",
        "",
        valor,
    )

    return valor or None


def normalizar_cnpj(valor):
    valor = somente_digitos(valor)

    if not valor:
        return None

    if len(valor) != 14:
        return None

    return valor


def normalizar_ddd(valor):
    valor = somente_digitos(valor)

    if not valor:
        return None

    if len(valor) != 2:
        return None

    if valor == "00":
        return None

    return valor


def normalizar_telefone(valor):
    valor = somente_digitos(valor)

    if not valor:
        return None

    if valor in (
        "00000000",
        "000000000",
    ):
        return None

    return valor


def normalizar_simples(valor):
    valor = normalizar_texto(valor)

    if not valor:
        return None

    valor = valor.upper()

    if valor in (
        "S",
        "N",
    ):
        return valor

    return None


def converter_data(valor):
    """
    Formato observado no arquivo da Junta:

        20-06-2018 00:00:00.000

    Também aceita DD-MM-YYYY caso o horário não esteja presente.
    """

    valor = normalizar_texto(valor)

    if not valor:
        return None

    formatos = (
        "%d-%m-%Y %H:%M:%S.%f",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y",
    )

    for formato in formatos:
        try:
            return datetime.strptime(
                valor,
                formato,
            ).date()

        except ValueError:
            continue

    return None


def separar_cnaes(valor):
    """
    Retorna os CNAEs na ordem em que aparecem no CSV.

    IMPORTANTE:
    ordem=1 NÃO significa CNAE principal.
    """

    valor = normalizar_texto(valor)

    if not valor:
        return []

    resultado = []
    vistos = set()

    for item in valor.split(","):
        codigo = somente_digitos(item)

        if not codigo:
            continue

        if len(codigo) != 7:
            continue

        if codigo in vistos:
            continue

        vistos.add(codigo)
        resultado.append(codigo)

    return resultado


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
# CNAES VÁLIDOS
# ============================================================

def carregar_cnaes_validos(conn):
    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT codigo
            FROM public.cnaes
            """
        )

        return {
            str(row[0]).strip()
            for row in cur.fetchall()
            if row[0] is not None
        }


# ============================================================
# ANALISAR STAGING
# ============================================================

def analisar_staging(conn):
    """
    Analisa os dados brutos antes da promoção para public.

    Retorna estatísticas de validação sem alterar os dados.
    """

    with conn.cursor() as cur:

        # ----------------------------------------------------
        # TOTAL
        # ----------------------------------------------------

        cur.execute(
            """
            SELECT COUNT(*)
            FROM staging.junta_empresas
            """
        )

        total = cur.fetchone()[0]

        # ----------------------------------------------------
        # CNPJ INVÁLIDO
        #
        # Aqui validamos apenas estrutura:
        # exatamente 14 dígitos.
        #
        # A validação matemática dos dígitos verificadores
        # poderá ser acrescentada posteriormente.
        # ----------------------------------------------------

        cur.execute(
            """
            SELECT COUNT(*)
            FROM staging.junta_empresas
            WHERE
                NULLIF(
                    regexp_replace(
                        COALESCE(cnpj, ''),
                        '[^0-9]',
                        '',
                        'g'
                    ),
                    ''
                ) IS NULL

                OR length(
                    regexp_replace(
                        COALESCE(cnpj, ''),
                        '[^0-9]',
                        '',
                        'g'
                    )
                ) <> 14
            """
        )

        cnpj_invalido = cur.fetchone()[0]

        # ----------------------------------------------------
        # DATAS INVÁLIDAS
        #
        # Primeiro verificamos apenas o formato textual.
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
        # DUPLICIDADE DE CNPJ NO PRÓPRIO CSV
        # ----------------------------------------------------

        cur.execute(
            """
            SELECT
                COALESCE(
                    SUM(quantidade - 1),
                    0
                )
            FROM (
                SELECT
                    regexp_replace(
                        cnpj,
                        '[^0-9]',
                        '',
                        'g'
                    ) AS cnpj_normalizado,
                    COUNT(*) AS quantidade

                FROM staging.junta_empresas

                WHERE length(
                    regexp_replace(
                        COALESCE(cnpj, ''),
                        '[^0-9]',
                        '',
                        'g'
                    )
                ) = 14

                GROUP BY
                    regexp_replace(
                        cnpj,
                        '[^0-9]',
                        '',
                        'g'
                    )

                HAVING COUNT(*) > 1
            ) duplicados
            """
        )

        duplicados_csv = int(
            cur.fetchone()[0]
        )

    return {
        "total": total,
        "cnpj_invalido": cnpj_invalido,
        "datas_formato_invalido": (
            datas_formato_invalido
        ),
        "duplicados_csv": duplicados_csv,
    }


# ============================================================
# PROCESSAR LOTE PARA PUBLIC
# ============================================================

def preparar_dados_validos(conn):
    """
    Cria uma tabela temporária contendo os registros
    normalizados e estruturalmente válidos.

    DISTINCT ON garante apenas um registro por CNPJ
    dentro do arquivo atual.
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

            SELECT DISTINCT ON (cnpj_normalizado)

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
                            COALESCE(nu_dddtelefone, ''),
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
                        COALESCE(nu_telefone, ''),
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

            FROM (

                SELECT
                    *,
                    regexp_replace(
                        COALESCE(cnpj, ''),
                        '[^0-9]',
                        '',
                        'g'
                    ) AS cnpj_normalizado

                FROM staging.junta_empresas

            ) origem

            WHERE length(cnpj_normalizado) = 14

            ORDER BY
                cnpj_normalizado
            """
        )

    conn.commit()


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
    Insere empresas válidas que ainda não existem
    para a competência atual.

    Retorna:
        quantidade inserida
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
                carga_id

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
                %s

            FROM tmp_junta_empresas_validas origem

            ON CONFLICT (
                cnpj,
                competencia
            )

            DO NOTHING
            """,
            (
                COMPETENCIA_JUNTA,
                carga_id,
            ),
        )

        inseridos = cur.rowcount

    conn.commit()

    return inseridos


def promover_cnaes(
    conn,
    carga_id,
):
    """
    Separa a lista de CNAEs usando PostgreSQL.

    ordem representa somente a posição do código no CSV.
    NÃO significa CNAE principal.
    """

    with conn.cursor() as cur:

        # ----------------------------------------------------
        # CNAES DESCONHECIDOS
        # ----------------------------------------------------

        cur.execute(
            """
            WITH cnaes_separados AS (

                SELECT DISTINCT

                    empresa.cnpj,

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
        # INSERT
        # ----------------------------------------------------

        cur.execute(
            """
            WITH cnaes_separados AS (

                SELECT

                    empresa.cnpj,

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
            ),

            cnaes_sem_duplicidade AS (

                SELECT DISTINCT ON (
                    cnpj,
                    cnae_codigo
                )

                    cnpj,
                    cnae_codigo,
                    ordem

                FROM cnaes_separados

                ORDER BY
                    cnpj,
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
                ON empresa.cnpj = origem.cnpj
               AND empresa.competencia = %s

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

    conn.commit()

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
):
    print()
    print("=" * 70)
    print("PROCESSANDO STAGING")
    print("=" * 70)

    # --------------------------------------------------------
    # ANÁLISE
    # --------------------------------------------------------

    estatisticas = analisar_staging(
        conn
    )

    print(
        f"Registros staging:      "
        f"{estatisticas['total']:,}"
    )

    print(
        f"CNPJs inválidos:         "
        f"{estatisticas['cnpj_invalido']:,}"
    )

    print(
        f"Datas formato inválido:  "
        f"{estatisticas['datas_formato_invalido']:,}"
    )

    print(
        f"Duplicados no CSV:       "
        f"{estatisticas['duplicados_csv']:,}"
    )

    # --------------------------------------------------------
    # PREPARAÇÃO
    # --------------------------------------------------------

    print()
    print(
        "Preparando registros válidos..."
    )

    preparar_dados_validos(
        conn
    )

    # --------------------------------------------------------
    # QUANTIDADE VÁLIDA
    # --------------------------------------------------------

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT COUNT(*)
            FROM tmp_junta_empresas_validas
            """
        )

        validos = cur.fetchone()[0]

    print(
        f"Empresas válidas:        "
        f"{validos:,}"
    )

    # --------------------------------------------------------
    # EMPRESAS
    # --------------------------------------------------------

    print()
    print(
        "Inserindo empresas..."
    )

    inseridos = promover_empresas(
        conn,
        carga_id,
    )

    # --------------------------------------------------------
    # CNAES
    # --------------------------------------------------------

    print(
        "Relacionando CNAEs..."
    )

    (
        cnaes_inseridos,
        cnaes_desconhecidos,
    ) = promover_cnaes(
        conn,
        carga_id,
    )

    # --------------------------------------------------------
    # CONTADORES
    # --------------------------------------------------------

    totais["processados"] = validos

    totais["inseridos"] = inseridos

    totais["duplicados"] = (
        validos
        - inseridos
        + estatisticas["duplicados_csv"]
    )

    totais["erros"] += (
        estatisticas["cnpj_invalido"]
        + estatisticas["datas_formato_invalido"]
    )

    totais[
        "cnaes_inseridos"
    ] = cnaes_inseridos

    totais[
        "cnaes_desconhecidos"
    ] = cnaes_desconhecidos

    atualizar_carga(
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

        registros_atualizados=0,

        registros_duplicados=(
            totais["duplicados"]
        ),

        registros_erro=(
            totais["erros"]
        ),
    )

    print()
    print("-" * 70)

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

    print("-" * 70)


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