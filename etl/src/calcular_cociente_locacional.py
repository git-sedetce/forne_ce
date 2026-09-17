import time

from config import COMPETENCIA
from database import get_connection
from services.carga_service import (
    iniciar_carga,
    concluir_carga,
    falhar_carga,
    interromper_carga,
)


TIPO_CARGA = "COCIENTE_LOCACIONAL"


# ============================================================
# VALIDAR ESTRUTURA
# ============================================================

def validar_estrutura(conn):
    """
    Valida se as tabelas necessárias para o cálculo existem.
    """

    tabelas = [
        ("public", "estabelecimentos"),
        ("public", "municipios"),
        ("public", "cnaes"),
        ("analytics", "cociente_locacional"),
    ]

    with conn.cursor() as cur:

        for schema, tabela in tabelas:

            cur.execute(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = %s
                      AND table_name = %s
                )
                """,
                (schema, tabela),
            )

            if not cur.fetchone()[0]:

                raise RuntimeError(
                    f"Tabela {schema}.{tabela} "
                    "não encontrada."
                )


# ============================================================
# VALIDAR DADOS
# ============================================================

def validar_dados(conn, competencia):
    """
    Verifica se existem estabelecimentos da competência.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT COUNT(*)
            FROM public.estabelecimentos
            WHERE competencia = %s
            """,
            (competencia,),
        )

        total = cur.fetchone()[0]

    if total == 0:

        raise RuntimeError(
            "Nenhum estabelecimento encontrado "
            f"para a competência {competencia}. "
            "Execute primeiro etl_estabelecimentos.py."
        )

    print(
        f"Estabelecimentos encontrados: {total:,}"
    )

    return total


# ============================================================
# VALIDAR BASE ANALÍTICA
# ============================================================

def validar_base_analitica(conn, competencia):
    """
    Exibe a quantidade de estabelecimentos ativos do Ceará
    que efetivamente participarão do cálculo.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT COUNT(*)
            FROM public.estabelecimentos
            WHERE competencia = %s
              AND uf = 'CE'
              AND situacao_cadastral_codigo = '02'
              AND municipio_codigo IS NOT NULL
              AND cnae_principal_codigo IS NOT NULL
            """,
            (competencia,),
        )

        total = cur.fetchone()[0]

    if total == 0:

        raise RuntimeError(
            "Nenhum estabelecimento ativo do Ceará "
            f"encontrado para {competencia}."
        )

    print(
        f"Estabelecimentos ativos utilizados no QL: "
        f"{total:,}"
    )

    return total


# ============================================================
# LIMPAR COMPETÊNCIA
# ============================================================

def limpar_competencia(
    conn,
    competencia,
):
    """
    Remove somente os resultados da competência que será
    recalculada.

    O DELETE não recebe commit aqui. Assim, DELETE + INSERT
    permanecem na mesma transação.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            DELETE
            FROM analytics.cociente_locacional
            WHERE competencia = %s
            """,
            (competencia,),
        )

        removidos = cur.rowcount

    return removidos


# ============================================================
# CALCULAR COCIENTE LOCACIONAL
# ============================================================

def calcular(
    conn,
    competencia,
    carga_id,
):
    """
    Calcula o cociente locacional por município e CNAE
    principal.

    Fórmula:

        estabelecimentos CNAE município
        -------------------------------
        estabelecimentos município

                     /

        estabelecimentos CNAE Ceará
        ---------------------------
        estabelecimentos Ceará


    Regras:

        - competência informada;
        - estabelecimento localizado no Ceará;
        - situação cadastral ativa (02);
        - CNAE principal;
        - cada estabelecimento ativo é uma unidade da contagem.

    IMPORTANTE:

    Não utilizamos COUNT(DISTINCT empresa_id).

    Uma empresa pode possuir vários estabelecimentos em municípios
    diferentes. Para análise da concentração territorial, cada
    estabelecimento deve participar da contagem.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            WITH base AS (

                ------------------------------------------------
                -- BASE ANALÍTICA
                --
                -- Cada linha representa um estabelecimento
                -- ativo localizado no Ceará.
                ------------------------------------------------

                SELECT

                    e.id AS estabelecimento_id,

                    e.municipio_codigo,

                    e.cnae_principal_codigo

                FROM public.estabelecimentos e

                WHERE

                    e.competencia = %s

                    AND e.uf = 'CE'

                    AND e.situacao_cadastral_codigo = '02'

                    AND e.municipio_codigo IS NOT NULL

                    AND e.cnae_principal_codigo IS NOT NULL
            ),


            ----------------------------------------------------
            -- TOTAL DE ESTABELECIMENTOS POR MUNICÍPIO
            ----------------------------------------------------

            total_municipio AS (

                SELECT

                    municipio_codigo,

                    COUNT(*) AS total_estabelecimentos

                FROM base

                GROUP BY municipio_codigo
            ),


            ----------------------------------------------------
            -- ESTABELECIMENTOS POR MUNICÍPIO / CNAE
            ----------------------------------------------------

            municipio_cnae AS (

                SELECT

                    municipio_codigo,

                    cnae_principal_codigo,

                    COUNT(*) AS total_estabelecimentos

                FROM base

                GROUP BY

                    municipio_codigo,

                    cnae_principal_codigo
            ),


            ----------------------------------------------------
            -- TOTAL DE ESTABELECIMENTOS NO CEARÁ
            ----------------------------------------------------

            total_estado AS (

                SELECT

                    COUNT(*) AS total_estabelecimentos

                FROM base
            ),


            ----------------------------------------------------
            -- TOTAL DE ESTABELECIMENTOS POR CNAE NO CEARÁ
            ----------------------------------------------------

            estado_cnae AS (

                SELECT

                    cnae_principal_codigo,

                    COUNT(*) AS total_estabelecimentos

                FROM base

                GROUP BY cnae_principal_codigo
            )


            ----------------------------------------------------
            -- INSERÇÃO
            ----------------------------------------------------

            INSERT INTO analytics.cociente_locacional (

                competencia,

                municipio_codigo,

                municipio_nome,

                cnae_codigo,

                cnae_descricao,

                cociente_locacional,

                empresas_municipio_cnae,

                empresas_municipio,

                empresas_estado_cnae,

                empresas_estado,

                carga_id
            )

            SELECT

                %s AS competencia,

                mc.municipio_codigo,

                m.nome AS municipio_nome,

                mc.cnae_principal_codigo
                    AS cnae_codigo,

                c.descricao
                    AS cnae_descricao,


                ------------------------------------------------
                -- COCIENTE LOCACIONAL
                --
                -- (Emc / Em) / (Eec / Ee)
                ------------------------------------------------

                ROUND(

                    (
                        mc.total_estabelecimentos::NUMERIC
                        /
                        NULLIF(
                            tm.total_estabelecimentos,
                            0
                        )
                    )

                    /

                    (
                        ec.total_estabelecimentos::NUMERIC
                        /
                        NULLIF(
                            te.total_estabelecimentos,
                            0
                        )
                    ),

                    8

                ) AS cociente_locacional,


                ------------------------------------------------
                -- VALORES UTILIZADOS NO CÁLCULO
                ------------------------------------------------

                mc.total_estabelecimentos
                    AS empresas_municipio_cnae,

                tm.total_estabelecimentos
                    AS empresas_municipio,

                ec.total_estabelecimentos
                    AS empresas_estado_cnae,

                te.total_estabelecimentos
                    AS empresas_estado,

                %s AS carga_id


            FROM municipio_cnae mc


            INNER JOIN total_municipio tm

                ON tm.municipio_codigo =
                   mc.municipio_codigo


            INNER JOIN estado_cnae ec

                ON ec.cnae_principal_codigo =
                   mc.cnae_principal_codigo


            CROSS JOIN total_estado te


            INNER JOIN public.municipios m

                ON m.codigo =
                   mc.municipio_codigo


            INNER JOIN public.cnaes c

                ON c.codigo =
                   mc.cnae_principal_codigo


            WHERE

                mc.total_estabelecimentos > 0

                AND tm.total_estabelecimentos > 0

                AND ec.total_estabelecimentos > 0

                AND te.total_estabelecimentos > 0


            ORDER BY

                mc.municipio_codigo,

                mc.cnae_principal_codigo
            """,
            (
                competencia,
                competencia,
                carga_id,
            ),
        )

        inseridos = cur.rowcount

    return inseridos


# ============================================================
# ESTATÍSTICAS
# ============================================================

def obter_estatisticas(
    conn,
    competencia,
):

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT

                COUNT(*),

                COUNT(
                    DISTINCT municipio_codigo
                ),

                COUNT(
                    DISTINCT cnae_codigo
                ),

                MIN(
                    cociente_locacional
                ),

                MAX(
                    cociente_locacional
                ),

                AVG(
                    cociente_locacional
                )

            FROM analytics.cociente_locacional

            WHERE competencia = %s
            """,
            (competencia,),
        )

        resultado = cur.fetchone()

    return {
        "registros": resultado[0],
        "municipios": resultado[1],
        "cnaes": resultado[2],
        "minimo": resultado[3],
        "maximo": resultado[4],
        "media": resultado[5],
    }


# ============================================================
# CONFERIR CNAE / MUNICÍPIO
# ============================================================

def mostrar_maiores(
    conn,
    competencia,
    limite=10,
):

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT

                municipio_nome,

                cnae_codigo,

                cnae_descricao,

                cociente_locacional,

                empresas_municipio_cnae,

                empresas_municipio,

                empresas_estado_cnae,

                empresas_estado

            FROM analytics.cociente_locacional

            WHERE competencia = %s

            ORDER BY
                cociente_locacional DESC,
                municipio_nome,
                cnae_codigo

            LIMIT %s
            """,
            (
                competencia,
                limite,
            ),
        )

        resultados = cur.fetchall()

    print()
    print("=" * 120)
    print("MAIORES COCIENTES LOCACIONAIS")
    print("=" * 120)

    for (
        municipio,
        cnae,
        descricao,
        cociente,
        municipio_cnae,
        total_municipio,
        estado_cnae,
        total_estado,
    ) in resultados:

        descricao_curta = (
            descricao[:40]
            if descricao
            else ""
        )

        print(
            f"{municipio[:22]:22} | "
            f"{cnae:7} | "
            f"QL {float(cociente):10.4f} | "
            f"M/CNAE {municipio_cnae:6,} | "
            f"M {total_municipio:7,} | "
            f"CE/CNAE {estado_cnae:7,} | "
            f"CE {total_estado:9,} | "
            f"{descricao_curta}"
        )

    print("=" * 120)


# ============================================================
# MAIN
# ============================================================

def main():

    inicio = time.time()

    conn = get_connection()

    carga_id = None

    total_estabelecimentos = 0
    total_base_analitica = 0
    registros_inseridos = 0

    try:

        print()
        print("=" * 70)
        print("COCIENTE LOCACIONAL")
        print("=" * 70)
        print(
            f"Competência: {COMPETENCIA}"
        )
        print("=" * 70)

        # ----------------------------------------------------
        # VALIDAR ESTRUTURA
        # ----------------------------------------------------

        print()
        print(
            "Validando estrutura do banco..."
        )

        validar_estrutura(conn)

        print(
            "Estrutura validada."
        )

        # ----------------------------------------------------
        # VALIDAR DADOS
        # ----------------------------------------------------

        print()
        print(
            "Validando dados da competência..."
        )

        total_estabelecimentos = (
            validar_dados(
                conn,
                COMPETENCIA,
            )
        )

        total_base_analitica = (
            validar_base_analitica(
                conn,
                COMPETENCIA,
            )
        )

        # ----------------------------------------------------
        # CRIAR CARGA
        # ----------------------------------------------------

        carga_id = iniciar_carga(
            conn,
            TIPO_CARGA,
            COMPETENCIA,
        )

        print()
        print(
            f"Carga criada: ID={carga_id}"
        )

        # ----------------------------------------------------
        # LIMPAR RESULTADO ANTERIOR
        # ----------------------------------------------------

        print()
        print(
            "Removendo cálculo anterior "
            "da competência..."
        )

        removidos = limpar_competencia(
            conn,
            COMPETENCIA,
        )

        print(
            f"Registros anteriores: "
            f"{removidos:,}"
        )

        # ----------------------------------------------------
        # CALCULAR
        # ----------------------------------------------------

        print()
        print(
            "Calculando cociente locacional..."
        )

        inicio_calculo = time.time()

        registros_inseridos = calcular(
            conn,
            COMPETENCIA,
            carga_id,
        )

        tempo_calculo = (
            time.time()
            - inicio_calculo
        )

        print(
            f"Cálculo concluído em "
            f"{tempo_calculo / 60:.2f} minutos."
        )

        print(
            f"Registros gerados: "
            f"{registros_inseridos:,}"
        )

        # ----------------------------------------------------
        # COMMIT
        # ----------------------------------------------------

        conn.commit()

        # ----------------------------------------------------
        # ESTATÍSTICAS
        # ----------------------------------------------------

        estatisticas = obter_estatisticas(
            conn,
            COMPETENCIA,
        )

        # ----------------------------------------------------
        # CONCLUIR CARGA
        # ----------------------------------------------------

        concluir_carga(
            conn,
            carga_id,
            registros_lidos=(
                total_base_analitica
            ),
            registros_processados=(
                registros_inseridos
            ),
            registros_inseridos=(
                registros_inseridos
            ),
            registros_duplicados=0,
            registros_erro=0,
        )

        # ----------------------------------------------------
        # RESULTADO
        # ----------------------------------------------------

        print()
        print("=" * 70)
        print("RESULTADO")
        print("=" * 70)

        print(
            f"Competência:                    "
            f"{COMPETENCIA}"
        )

        print(
            f"Estabelecimentos carregados:    "
            f"{total_estabelecimentos:,}"
        )

        print(
            f"Estabelecimentos usados no QL:  "
            f"{total_base_analitica:,}"
        )

        print(
            f"Registros calculados:           "
            f"{estatisticas['registros']:,}"
        )

        print(
            f"Municípios:                     "
            f"{estatisticas['municipios']:,}"
        )

        print(
            f"CNAEs:                          "
            f"{estatisticas['cnaes']:,}"
        )

        if estatisticas["minimo"] is not None:

            print(
                f"Menor QL:                       "
                f"{estatisticas['minimo']}"
            )

        if estatisticas["maximo"] is not None:

            print(
                f"Maior QL:                       "
                f"{estatisticas['maximo']}"
            )

        if estatisticas["media"] is not None:

            print(
                f"QL médio:                       "
                f"{estatisticas['media']:.8f}"
            )

        print("=" * 70)

        mostrar_maiores(
            conn,
            COMPETENCIA,
        )

        tempo_total = (
            time.time()
            - inicio
        )

        print()
        print(
            f"Tempo total: "
            f"{tempo_total / 60:.2f} minutos"
        )

    except KeyboardInterrupt:

        if carga_id is not None:

            interromper_carga(
                conn,
                carga_id,
                registros_lidos=(
                    total_base_analitica
                ),
                registros_processados=(
                    registros_inseridos
                ),
                registros_inseridos=(
                    registros_inseridos
                ),
                registros_duplicados=0,
                registros_erro=0,
            )

        print()
        print("=" * 70)
        print(
            "CÁLCULO INTERROMPIDO PELO USUÁRIO"
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
                    total_base_analitica
                ),
                registros_processados=(
                    registros_inseridos
                ),
                registros_inseridos=(
                    registros_inseridos
                ),
                registros_duplicados=0,
                registros_erro=1,
            )

        print()
        print("=" * 70)
        print("ERRO NO COCIENTE LOCACIONAL")
        print("=" * 70)
        print(erro)
        print("=" * 70)

        raise

    finally:

        conn.close()


if __name__ == "__main__":
    main()