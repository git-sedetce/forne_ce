from pathlib import Path
import zipfile


def encontrar_zip(raw_dir, nome):

    arquivo = Path(raw_dir) / f"{nome}.zip"

    if not arquivo.exists():
        raise FileNotFoundError(
            f"Arquivo não encontrado: {arquivo}"
        )

    return arquivo


def carregar_dominio_zip(
    conn,
    raw_dir,
    nome_zip,
    tabela_staging,
    tabela_destino
):
    """
    Carrega um domínio diretamente do ZIP localizado em data/raw.

    Fluxo:

        ZIP
         ↓
        staging
         ↓
        tabela definitiva
    """

    arquivo_zip = encontrar_zip(raw_dir, nome_zip)

    print()
    print("=" * 70)
    print(f"CARREGANDO DOMÍNIO: {tabela_destino}")
    print("=" * 70)
    print(f"ZIP: {arquivo_zip}")

    try:

        with zipfile.ZipFile(arquivo_zip, "r") as z:

            arquivos = [
                nome
                for nome in z.namelist()
                if not nome.endswith("/")
            ]

            if not arquivos:
                raise RuntimeError(
                    f"Nenhum arquivo encontrado em {arquivo_zip}"
                )

            nome_interno = arquivos[0]

            print(f"Arquivo interno: {nome_interno}")

            with conn.cursor() as cur:

                # ------------------------------------------------
                # Limpa staging
                # ------------------------------------------------

                cur.execute(
                    f"TRUNCATE TABLE {tabela_staging}"
                )

                # ------------------------------------------------
                # COPY ZIP -> staging
                # ------------------------------------------------

                with z.open(nome_interno) as arquivo:

                    texto = (
                        linha.decode("latin1")
                        for linha in arquivo
                    )

                    with cur.copy(
                        f"""
                        COPY {tabela_staging}
                        FROM STDIN
                        WITH (
                            FORMAT CSV,
                            DELIMITER ';',
                            QUOTE '"'
                        )
                        """
                    ) as copy:

                        for linha in texto:
                            copy.write(linha)

                # ------------------------------------------------
                # staging -> tabela definitiva
                # ------------------------------------------------

                if tabela_destino == "public.cnaes":

                    cur.execute("""
                        INSERT INTO public.cnaes (
                            codigo,
                            descricao
                        )
                        SELECT
                            TRIM(codigo),
                            TRIM(descricao)
                        FROM staging.cnaes
                        ON CONFLICT (codigo)
                        DO UPDATE SET
                            descricao = EXCLUDED.descricao
                    """)

                elif tabela_destino == "public.motivos_situacao":

                    cur.execute("""
                        INSERT INTO public.motivos_situacao (
                            codigo,
                            descricao
                        )
                        SELECT
                            TRIM(codigo),
                            TRIM(descricao)
                        FROM staging.motivos
                        ON CONFLICT (codigo)
                        DO UPDATE SET
                            descricao = EXCLUDED.descricao
                    """)

                elif tabela_destino == "public.municipios":

                    cur.execute("""
                        INSERT INTO public.municipios (
                            codigo,
                            nome
                        )
                        SELECT
                            TRIM(codigo),
                            TRIM(nome)
                        FROM staging.municipios
                        ON CONFLICT (codigo)
                        DO UPDATE SET
                            nome = EXCLUDED.nome
                    """)

                elif tabela_destino == "public.naturezas_juridicas":

                    cur.execute("""
                        INSERT INTO public.naturezas_juridicas (
                            codigo,
                            descricao
                        )
                        SELECT
                            TRIM(codigo),
                            TRIM(descricao)
                        FROM staging.naturezas
                        ON CONFLICT (codigo)
                        DO UPDATE SET
                            descricao = EXCLUDED.descricao
                    """)

                elif tabela_destino == "public.paises":

                    cur.execute("""
                        INSERT INTO public.paises (
                            codigo,
                            nome
                        )
                        SELECT
                            TRIM(codigo),
                            TRIM(nome)
                        FROM staging.paises
                        ON CONFLICT (codigo)
                        DO UPDATE SET
                            nome = EXCLUDED.nome
                    """)

                elif tabela_destino == "public.qualificacoes":

                    cur.execute("""
                        INSERT INTO public.qualificacoes (
                            codigo,
                            descricao
                        )
                        SELECT
                            TRIM(codigo),
                            TRIM(descricao)
                        FROM staging.qualificacoes
                        ON CONFLICT (codigo)
                        DO UPDATE SET
                            descricao = EXCLUDED.descricao
                    """)

                else:

                    raise ValueError(
                        f"Tabela não suportada: {tabela_destino}"
                    )

                total = cur.rowcount

        # --------------------------------------------------------
        # Confirma a operação
        # --------------------------------------------------------

        conn.commit()

        print(
            f"OK: {tabela_destino}: "
            f"{total:,} registros"
        )

        return total

    except Exception as erro:

        conn.rollback()

        print()
        print("=" * 70)
        print(f"ERRO AO CARREGAR {tabela_destino}")
        print("=" * 70)
        print(erro)

        raise