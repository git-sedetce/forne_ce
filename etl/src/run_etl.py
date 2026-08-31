import argparse
import subprocess
import sys
import time
from pathlib import Path

from config import (
    COMPETENCIA,
    RAW_DIR,
    ENV_FILE,
)

from database import get_connection


# ============================================================
# DIRETÓRIOS
# ============================================================

SRC_DIR = Path(__file__).resolve().parent
BASE_DIR = SRC_DIR.parent


# ============================================================
# ETAPAS
# ============================================================

ETAPAS = [
    (
        "DOMÍNIOS",
        SRC_DIR / "load_domains.py",
    ),
    (
        "CNPJ CE",
        SRC_DIR / "extrair_cnpj_ce.py",
    ),
    (
        "EMPRESAS",
        SRC_DIR / "load_empresas_ce.py",
    ),
    (
        "ESTABELECIMENTOS",
        SRC_DIR / "etl_estabelecimentos.py",
    ),
    (
        "SÓCIOS",
        SRC_DIR / "etl_socios.py",
    ),
    (
        "SIMPLES",
        SRC_DIR / "etl_simples.py",
    ),
]


# ============================================================
# ARQUIVOS DA RECEITA FEDERAL
# ============================================================

ARQUIVOS_RECEITA = {
    "DOMÍNIOS": [
        "Cnaes.zip",
        "Motivos.zip",
        "Municipios.zip",
        "Naturezas.zip",
        "Paises.zip",
        "Qualificacoes.zip",
    ],

    "CNPJ CE / ESTABELECIMENTOS": [
        f"Estabelecimentos{i}.zip"
        for i in range(10)
    ],

    "EMPRESAS": [
        f"Empresas{i}.zip"
        for i in range(10)
    ],

    "SÓCIOS": [
        f"Socios{i}.zip"
        for i in range(10)
    ],

    "SIMPLES": [
        "Simples.zip",
    ],
}


# ============================================================
# ESTRUTURA DO BANCO
# ============================================================

SCHEMAS_OBRIGATORIOS = {
    "public",
    "staging",
    "analytics",
}


TABELAS_PUBLIC = {
    "cargas",
    "cnaes",
    "cnpj_ce",
    "empresas",
    "estabelecimentos",
    "motivos_situacao",
    "municipios",
    "naturezas_juridicas",
    "paises",
    "qualificacoes",
    "simples",
    "socios",
}


TABELAS_STAGING = {
    "cnaes",
    "cnpj_ce",
    "empresas",
    "estabelecimentos",
    "motivos",
    "municipios",
    "naturezas",
    "paises",
    "qualificacoes",
    "simples",
    "socios",
}


# ============================================================
# PARÂMETROS
# ============================================================

def obter_argumentos():
    parser = argparse.ArgumentParser(
        description=(
            "Pipeline ETL dos dados abertos da "
            "Receita Federal para o Ceará."
        )
    )

    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "Valida ambiente, banco, scripts e arquivos ZIP "
            "sem executar o ETL."
        ),
    )

    return parser.parse_args()


# ============================================================
# VALIDAR SCRIPTS
# ============================================================

def validar_scripts(
    exibir=True,
):
    arquivos_ausentes = []

    for nome, script in ETAPAS:

        if not script.exists():

            arquivos_ausentes.append(
                (
                    nome,
                    script,
                )
            )

    if arquivos_ausentes:

        print()
        print("=" * 80)
        print("ARQUIVOS DO PIPELINE NÃO ENCONTRADOS")
        print("=" * 80)

        for nome, script in arquivos_ausentes:

            print(
                f"✗ {nome}: {script}"
            )

        print("=" * 80)

        raise FileNotFoundError(
            "Existem scripts ausentes no pipeline."
        )

    if exibir:

        for nome, script in ETAPAS:

            print(
                f"✓ {nome:<22} {script.name}"
            )


# ============================================================
# VALIDAR .ENV
# ============================================================

def validar_env():

    if not ENV_FILE.exists():

        raise FileNotFoundError(
            f"Arquivo .env não encontrado: {ENV_FILE}"
        )

    print(
        f"✓ .env encontrado: {ENV_FILE}"
    )

    print(
        f"✓ Competência válida: {COMPETENCIA}"
    )


# ============================================================
# VALIDAR DIRETÓRIO RAW
# ============================================================

def validar_raw_dir():

    if not RAW_DIR.exists():

        raise FileNotFoundError(
            f"Diretório RAW não encontrado: {RAW_DIR}"
        )

    if not RAW_DIR.is_dir():

        raise RuntimeError(
            f"RAW_DIR não é um diretório: {RAW_DIR}"
        )

    print(
        f"✓ Diretório RAW: {RAW_DIR}"
    )


# ============================================================
# VALIDAR ARQUIVOS DA RECEITA
# ============================================================

def validar_arquivos_receita():

    arquivos_ausentes = []

    for grupo, arquivos in ARQUIVOS_RECEITA.items():

        print()
        print(grupo)

        for nome_arquivo in arquivos:

            arquivo = RAW_DIR / nome_arquivo

            if arquivo.exists():

                tamanho_mb = (
                    arquivo.stat().st_size
                    / 1024
                    / 1024
                )

                print(
                    f"  ✓ {nome_arquivo:<30} "
                    f"{tamanho_mb:,.1f} MB"
                )

            else:

                print(
                    f"  ✗ {nome_arquivo}"
                )

                arquivos_ausentes.append(
                    arquivo
                )

    if arquivos_ausentes:

        raise FileNotFoundError(
            f"{len(arquivos_ausentes)} "
            "arquivo(s) ZIP obrigatório(s) ausente(s)."
        )


# ============================================================
# VALIDAR BANCO
# ============================================================

def validar_banco():

    conn = None

    try:

        conn = get_connection()

        with conn.cursor() as cur:

            # ------------------------------------------------
            # BANCO / VERSÃO
            # ------------------------------------------------

            cur.execute(
                """
                SELECT
                    current_database(),
                    current_setting('server_version_num')
                """
            )

            banco, versao_num = (
                cur.fetchone()
            )

            versao_num = int(
                versao_num
            )

            versao_major = (
                versao_num // 10000
            )

            print(
                f"✓ PostgreSQL conectado: {banco}"
            )

            print(
                f"✓ PostgreSQL versão: {versao_major}"
            )

            if versao_major < 15:

                raise RuntimeError(
                    "PostgreSQL 15 ou superior é obrigatório "
                    "por causa de UNIQUE NULLS NOT DISTINCT."
                )

            # ------------------------------------------------
            # EXTENSÃO
            # ------------------------------------------------

            cur.execute(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_extension
                    WHERE extname = 'pg_trgm'
                )
                """
            )

            existe_pg_trgm = (
                cur.fetchone()[0]
            )

            if not existe_pg_trgm:

                raise RuntimeError(
                    "Extensão pg_trgm não instalada."
                )

            print(
                "✓ Extensão pg_trgm"
            )

            # ------------------------------------------------
            # SCHEMAS
            # ------------------------------------------------

            cur.execute(
                """
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name = ANY(%s)
                """,
                (
                    list(
                        SCHEMAS_OBRIGATORIOS
                    ),
                ),
            )

            schemas_encontrados = {
                linha[0]
                for linha in cur.fetchall()
            }

            schemas_ausentes = (
                SCHEMAS_OBRIGATORIOS
                - schemas_encontrados
            )

            if schemas_ausentes:

                raise RuntimeError(
                    "Schemas ausentes: "
                    + ", ".join(
                        sorted(
                            schemas_ausentes
                        )
                    )
                )

            print(
                "✓ Schemas public, staging e analytics"
            )

            # ------------------------------------------------
            # TABELAS PUBLIC
            # ------------------------------------------------

            cur.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_type = 'BASE TABLE'
                """
            )

            public_encontradas = {
                linha[0]
                for linha in cur.fetchall()
            }

            public_ausentes = (
                TABELAS_PUBLIC
                - public_encontradas
            )

            if public_ausentes:

                raise RuntimeError(
                    "Tabelas ausentes em public: "
                    + ", ".join(
                        sorted(
                            public_ausentes
                        )
                    )
                )

            print(
                f"✓ Tabelas public: "
                f"{len(TABELAS_PUBLIC)}"
            )

            # ------------------------------------------------
            # TABELAS STAGING
            # ------------------------------------------------

            cur.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'staging'
                  AND table_type = 'BASE TABLE'
                """
            )

            staging_encontradas = {
                linha[0]
                for linha in cur.fetchall()
            }

            staging_ausentes = (
                TABELAS_STAGING
                - staging_encontradas
            )

            if staging_ausentes:

                raise RuntimeError(
                    "Tabelas ausentes em staging: "
                    + ", ".join(
                        sorted(
                            staging_ausentes
                        )
                    )
                )

            print(
                f"✓ Tabelas staging: "
                f"{len(TABELAS_STAGING)}"
            )

            # ------------------------------------------------
            # CONSTRAINT SÓCIOS
            # ------------------------------------------------

            cur.execute(
                """
                SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conname = 'uk_socio_competencia'
                """
            )

            resultado = (
                cur.fetchone()
            )

            if resultado is None:

                raise RuntimeError(
                    "Constraint uk_socio_competencia "
                    "não encontrada."
                )

            definicao_constraint = (
                resultado[0]
            )

            if (
                "NULLS NOT DISTINCT"
                not in definicao_constraint
            ):

                raise RuntimeError(
                    "uk_socio_competencia não possui "
                    "NULLS NOT DISTINCT."
                )

            print(
                "✓ Constraint de unicidade dos sócios"
            )

    finally:

        if conn is not None:

            conn.close()


# ============================================================
# CHECK
# ============================================================

def executar_check():

    print()
    print("=" * 80)
    print("VALIDAÇÃO DO AMBIENTE ETL")
    print("=" * 80)

    print(
        f"Competência: {COMPETENCIA}"
    )

    print(
        f"Python:      {sys.executable}"
    )

    print()

    print("-" * 80)
    print("AMBIENTE")
    print("-" * 80)

    validar_env()
    validar_raw_dir()

    print()

    print("-" * 80)
    print("SCRIPTS")
    print("-" * 80)

    validar_scripts(
        exibir=True,
    )

    print()

    print("-" * 80)
    print("BANCO DE DADOS")
    print("-" * 80)

    validar_banco()

    print()

    print("-" * 80)
    print("ARQUIVOS DA RECEITA FEDERAL")
    print("-" * 80)

    validar_arquivos_receita()

    print()
    print("=" * 80)
    print("ETL PRONTO PARA EXECUÇÃO")
    print("=" * 80)

    print(
        f"Competência: {COMPETENCIA}"
    )

    print(
        f"Etapas:      {len(ETAPAS)}"
    )

    print(
        "Nenhum dado foi carregado."
    )

    print("=" * 80)


# ============================================================
# EXECUTAR ETAPA
# ============================================================

def executar_etapa(
    numero,
    total_etapas,
    nome,
    script,
):

    print()
    print("=" * 80)

    print(
        f"ETAPA {numero}/{total_etapas}: "
        f"{nome}"
    )

    print("=" * 80)

    print(
        f"Script: {script.name}"
    )

    print()

    inicio = time.time()

    resultado = subprocess.run(
        [
            sys.executable,
            str(script),
        ],
        cwd=BASE_DIR,
    )

    tempo = (
        time.time()
        - inicio
    )

    if resultado.returncode != 0:

        print()
        print("=" * 80)

        print(
            f"ERRO NA ETAPA: {nome}"
        )

        print("=" * 80)

        print(
            f"Código de retorno: "
            f"{resultado.returncode}"
        )

        print(
            f"Tempo até o erro: "
            f"{tempo / 60:.2f} minutos"
        )

        print()

        print(
            "O pipeline foi interrompido. "
            "As etapas seguintes não serão executadas."
        )

        print("=" * 80)

        raise RuntimeError(
            f"A etapa {nome} terminou com erro."
        )

    print()
    print("-" * 80)

    print(
        f"{nome} concluído com sucesso."
    )

    print(
        f"Tempo: "
        f"{tempo / 60:.2f} minutos"
    )

    print("-" * 80)


# ============================================================
# PIPELINE
# ============================================================

def executar_pipeline():

    validar_scripts(
        exibir=False,
    )

    inicio_geral = (
        time.time()
    )

    total_etapas = (
        len(ETAPAS)
    )

    print()
    print("=" * 80)
    print("PIPELINE RECEITA FEDERAL - CEARÁ")
    print("=" * 80)

    print(
        f"Competência: {COMPETENCIA}"
    )

    print(
        f"Etapas:      {total_etapas}"
    )

    print(
        f"Diretório:   {BASE_DIR}"
    )

    print()

    for indice, (
        nome,
        script,
    ) in enumerate(
        ETAPAS,
        start=1,
    ):

        executar_etapa(
            numero=indice,
            total_etapas=total_etapas,
            nome=nome,
            script=script,
        )

    tempo_total = (
        time.time()
        - inicio_geral
    )

    print()
    print("=" * 80)
    print("PIPELINE CONCLUÍDO COM SUCESSO")
    print("=" * 80)

    print(
        f"Competência: {COMPETENCIA}"
    )

    print(
        f"Tempo total: "
        f"{tempo_total / 3600:.2f} horas"
    )

    print("=" * 80)


# ============================================================
# MAIN
# ============================================================

def main():

    args = (
        obter_argumentos()
    )

    if args.check:

        executar_check()

        return

    executar_pipeline()


if __name__ == "__main__":
    main()