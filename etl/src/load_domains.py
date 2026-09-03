from config import RAW_DIR, COMPETENCIA
from database import get_connection
from loaders.dominios import carregar_dominio_zip

from services.carga_service import (
    iniciar_carga,
    atualizar_carga,
    concluir_carga,
    falhar_carga,
    interromper_carga,
)


TIPO_CARGA = "DOMINIOS"


DOMINIOS = [
    {
        "nome": "CNAEs",
        "zip": "Cnaes",
        "staging": "staging.cnaes",
        "destino": "public.cnaes",
    },
    {
        "nome": "Motivos de situação",
        "zip": "Motivos",
        "staging": "staging.motivos",
        "destino": "public.motivos_situacao",
    },
    {
        "nome": "Municípios",
        "zip": "Municipios",
        "staging": "staging.municipios",
        "destino": "public.municipios",
    },
    {
        "nome": "Naturezas jurídicas",
        "zip": "Naturezas",
        "staging": "staging.naturezas",
        "destino": "public.naturezas_juridicas",
    },
    {
        "nome": "Países",
        "zip": "Paises",
        "staging": "staging.paises",
        "destino": "public.paises",
    },
    {
        "nome": "Qualificações",
        "zip": "Qualificacoes",
        "staging": "staging.qualificacoes",
        "destino": "public.qualificacoes",
    },
]


def validar_arquivos():

    print()
    print("Validando arquivos de domínio...")

    ausentes = []

    for dominio in DOMINIOS:

        arquivo = RAW_DIR / f"{dominio['zip']}.zip"

        if not arquivo.exists():

            ausentes.append(
                arquivo
            )

    if ausentes:

        print()
        print("=" * 70)
        print("ARQUIVOS DE DOMÍNIO AUSENTES")
        print("=" * 70)

        for arquivo in ausentes:
            print(f" - {arquivo}")

        raise FileNotFoundError(
            "Existem arquivos de domínio ausentes."
        )

    print(
        f"Arquivos encontrados: "
        f"{len(DOMINIOS)}"
    )


def main():

    conn = get_connection()

    carga_id = None

    totais = {
        "processados": 0,
        "erros": 0,
    }

    try:

        validar_arquivos()

        carga_id = iniciar_carga(
            conn,
            TIPO_CARGA,
            COMPETENCIA,
        )

        print()
        print("=" * 70)
        print("CARGA DAS TABELAS DE DOMÍNIO")
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

        for indice, dominio in enumerate(
            DOMINIOS,
            start=1,
        ):

            print()
            print(
                f"[{indice}/{len(DOMINIOS)}] "
                f"{dominio['nome']}"
            )

            total = carregar_dominio_zip(
                conn=conn,
                raw_dir=RAW_DIR,
                nome_zip=dominio["zip"],
                tabela_staging=dominio["staging"],
                tabela_destino=dominio["destino"],
            )

            totais["processados"] += total

            atualizar_carga(
                conn,
                carga_id,
                registros_processados=(
                    totais["processados"]
                ),
                registros_erro=(
                    totais["erros"]
                ),
            )

        concluir_carga(
            conn,
            carga_id,
            registros_processados=(
                totais["processados"]
            ),
            registros_erro=(
                totais["erros"]
            ),
        )

        print()
        print("=" * 70)
        print("DOMÍNIOS CARREGADOS COM SUCESSO")
        print("=" * 70)

        print(
            f"Registros processados: "
            f"{totais['processados']:,}"
        )

        print("=" * 70)

    except KeyboardInterrupt:

        if carga_id is not None:

            interromper_carga(
                conn,
                carga_id,
                registros_processados=(
                    totais["processados"]
                ),
                registros_erro=(
                    totais["erros"]
                ),
            )

        print()
        print(
            "Carga de domínios interrompida."
        )

        raise

    except Exception as erro:

        totais["erros"] += 1

        if carga_id is not None:

            falhar_carga(
                conn,
                carga_id,
                erro,
                registros_processados=(
                    totais["processados"]
                ),
                registros_erro=(
                    totais["erros"]
                ),
            )

        print()
        print("=" * 70)
        print("ERRO NA CARGA DOS DOMÍNIOS")
        print("=" * 70)
        print(erro)
        print("=" * 70)

        raise

    finally:

        conn.close()


if __name__ == "__main__":
    main()