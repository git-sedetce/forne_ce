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
    Valida se a estrutura necessária para o cálculo existe.
    """

    with conn.cursor() as cur:

        # ----------------------------------------------------
        # TABELA DE ESTABELECIMENTOS
        # ----------------------------------------------------

        cur.execute(
            """
            SELECT EXISTS (

                SELECT 1

                FROM information_schema.tables

                WHERE table_schema = 'public'

                  AND table_name = 'estabelecimentos'
            )
            """
        )

        if not cur.fetchone()[0]:

            raise RuntimeError(
                "Tabela public.estabelecimentos "
                "não encontrada."
            )

        # ----------------------------------------------------
        # TABELA ANALYTICS
        # ----------------------------------------------------

        cur.execute(
            """
            SELECT EXISTS (

                SELECT 1

                FROM information_schema.tables

                WHERE table_schema = 'analytics'

                  AND table_name = 'cociente_locacional'
            )
            """
        )

        if not cur.fetchone()[0]:

            raise RuntimeError(
                "Tabela analytics.cociente_locacional "
                "não encontrada. Atualize o "
                "001_schema.sql."
            )


# ============================================================
# VALIDAR DADOS
# ============================================================

def validar_dados(conn, competencia):
    """
    Verifica se existem estabelecimentos da competência
    antes do cálculo.
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
            "Execute primeiro "
            "etl_estabelecimentos.py."
        )

    print(
        f"Estabelecimentos encontrados: "
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
    Remove resultados anteriores somente da competência
    que será recalculada.

    Permite manter histórico das competências anteriores.
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

    # Não fazemos commit aqui.
    #
    # DELETE + INSERT devem permanecer na mesma transação.
    #
    # Se o cálculo falhar, o rollback restaura o resultado
    # anterior da competência.

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
    Calcula o cociente locacional por município e CNAE.

    Fórmula:

        empresas CNAE município
        -----------------------
        empresas município

                 /

        empresas CNAE Ceará
        -------------------
        empresas Ceará


    Regras:

        - competência informada;
        - estabelecimento localizado no Ceará;
        - situação cadastral ATIVA = 02;
        - CNAE principal;
        - empresa distinta.

    Observação:

    public.estabelecimentos contém também filiais fora do Ceará
    pertencentes às empresas do recorte estadual.

    Portanto o filtro:

        uf = 'CE'

    é obrigatório neste cálculo.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            WITH base AS (

                ------------------------------------------------
                -- BASE ANALÍTICA
                --
                -- Um registro por:
                --
                -- empresa
                -- município
                -- CNAE
                ------------------------------------------------

                SELECT DISTINCT

                    e.empresa_id,

                    e.municipio_codigo,

                    e.cnae_principal_codigo

                FROM public.estabelecimentos e

                WHERE

                    e.competencia = %s

                    AND e.uf = 'CE'

                    AND e.situacao_cadastral_codigo = '02'

                    AND e.empresa_id IS NOT NULL

                    AND e.municipio_codigo IS NOT NULL

                    AND e.cnae_principal_codigo IS NOT NULL
            ),


            ----------------------------------------------------
            -- TOTAL DE EMPRESAS POR MUNICÍPIO
            ----------------------------------------------------

            total_municipio AS (

                SELECT

                    municipio_codigo,

                    COUNT(
                        DISTINCT empresa_id
                    ) AS total_empresas

                FROM base

                GROUP BY municipio_codigo
            ),


            ----------------------------------------------------
            -- EMPRESAS POR MUNICÍPIO / CNAE
            ----------------------------------------------------

            municipio_cnae AS (

                SELECT

                    municipio_codigo,

                    cnae_principal_codigo,

                    COUNT(
                        DISTINCT empresa_id
                    ) AS total_empresas

                FROM base

                GROUP BY

                    municipio_codigo,

                    cnae_principal_codigo
            ),


            ----------------------------------------------------
            -- TOTAL DE EMPRESAS DO ESTADO
            ----------------------------------------------------

            total_estado AS (

                SELECT

                    COUNT(
                        DISTINCT empresa_id
                    ) AS total_empresas

                FROM base
            ),


            ----------------------------------------------------
            -- TOTAL DE EMPRESAS POR CNAE NO ESTADO
            ----------------------------------------------------

            estado_cnae AS (

                SELECT

                    cnae_principal_codigo,

                    COUNT(
                        DISTINCT empresa_id
                    ) AS total_empresas

                FROM base

                GROUP BY

                    cnae_principal_codigo
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
                ------------------------------------------------

                ROUND(

                    (

                        mc.total_empresas::NUMERIC

                        /

                        NULLIF(
                            tm.total_empresas,
                            0
                        )

                    )

                    /

                    (

                        ec.total_empresas::NUMERIC

                        /

                        NULLIF(
                            te.total_empresas,
                            0
                        )

                    ),

                    8

                ) AS cociente_locacional,


                ------------------------------------------------
                -- VALORES UTILIZADOS NO CÁLCULO
                ------------------------------------------------

                mc.total_empresas
                    AS empresas_municipio_cnae,

                tm.total_empresas
                    AS empresas_municipio,

                ec.total_empresas
                    AS empresas_estado_cnae,

                te.total_empresas
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

                mc.total_empresas > 0

                AND tm.total_empresas > 0

                AND ec.total_empresas > 0

                AND te.total_empresas > 0

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
    """
    Obtém informações para conferência do resultado.
    """

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
# EXIBIR MAIORES COCIENTES
# ============================================================

def mostrar_maiores(
    conn,
    competencia,
    limite=10,
):
    """
    Mostra os maiores cocientes apenas para conferência
    da execução.
    """

    with conn.cursor() as cur:

        cur.execute(
            """
            SELECT

                municipio_nome,

                cnae_codigo,

                cnae_descricao,

                cociente_locacional,

                empresas_municipio_cnae

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
    print("=" * 100)
    print("MAIORES COCIENTES LOCACIONAIS")
    print("=" * 100)

    for (
        municipio,
        cnae,
        descricao,
        cociente,
        empresas,
    ) in resultados:

        descricao_curta = (
            descricao[:45]
            if descricao
            else ""
        )

        print(
            f"{municipio[:25]:25} | "
            f"{cnae:7} | "
            f"QL {float(cociente):10.4f} | "
            f"{empresas:7,} empresas | "
            f"{descricao_curta}"
        )

    print("=" * 100)


# ============================================================
# MAIN
# ============================================================

def main():

    inicio = time.time()

    conn = get_connection()

    carga_id = None

    total_estabelecimentos = 0
    registros_inseridos = 0

    try:

        print()
        print("=" * 70)
        print("COCIENTE LOCACIONAL")
        print("=" * 70)
        print(
            f"Competência: "
            f"{COMPETENCIA}"
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
        # VALIDAR ESTABELECIMENTOS
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
            f"Carga criada: "
            f"ID={carga_id}"
        )

        # ----------------------------------------------------
        # REMOVER RESULTADO ANTERIOR
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
        # COMMIT DO DELETE + INSERT
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
                total_estabelecimentos
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
            f"Competência:             "
            f"{COMPETENCIA}"
        )

        print(
            f"Estabelecimentos lidos:  "
            f"{total_estabelecimentos:,}"
        )

        print(
            f"Registros calculados:    "
            f"{estatisticas['registros']:,}"
        )

        print(
            f"Municípios:              "
            f"{estatisticas['municipios']:,}"
        )

        print(
            f"CNAEs:                   "
            f"{estatisticas['cnaes']:,}"
        )

        if estatisticas["minimo"] is not None:

            print(
                f"Menor QL:                "
                f"{estatisticas['minimo']}"
            )

        if estatisticas["maximo"] is not None:

            print(
                f"Maior QL:                "
                f"{estatisticas['maximo']}"
            )

        if estatisticas["media"] is not None:

            print(
                f"QL médio:                "
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
                    total_estabelecimentos
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
                    total_estabelecimentos
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