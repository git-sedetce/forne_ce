import os
from pathlib import Path

from dotenv import load_dotenv


# ============================================================
# DIRETÓRIOS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

ENV_FILE = PROJECT_ROOT / ".env"

RAW_DIR = BASE_DIR / "data" / "raw"

# ============================================================
# CARREGAR .ENV
# ============================================================

if not ENV_FILE.exists():
    raise RuntimeError(
        f"Arquivo .env não encontrado: {ENV_FILE}"
    )

load_dotenv(ENV_FILE)


# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================

def obter_variavel(nome):
    """
    Retorna uma variável obrigatória do .env.

    Gera erro imediatamente caso ela não esteja configurada.
    """

    valor = os.getenv(nome)

    if valor is None or not valor.strip():

        raise RuntimeError(
            f"Variável {nome} não definida no arquivo .env"
        )

    return valor.strip()


# ============================================================
# COMPETÊNCIA
# ============================================================

COMPETENCIA = obter_variavel(
    "COMPETENCIA"
)


# Validação simples do formato YYYY-MM

if (
    len(COMPETENCIA) != 7
    or COMPETENCIA[4] != "-"
    or not COMPETENCIA[:4].isdigit()
    or not COMPETENCIA[5:].isdigit()
):

    raise RuntimeError(
        "COMPETENCIA deve possuir o formato YYYY-MM. "
        f"Valor informado: {COMPETENCIA}"
    )


ano = int(
    COMPETENCIA[:4]
)

mes = int(
    COMPETENCIA[5:]
)

if mes < 1 or mes > 12:

    raise RuntimeError(
        "Mês inválido em COMPETENCIA: "
        f"{COMPETENCIA}"
    )


# ============================================================
# POSTGRESQL
# ============================================================

DB_HOST = obter_variavel(
    "DB_HOST"
)

DB_PORT = int(
    obter_variavel(
        "DB_PORT"
    )
)

DB_NAME = obter_variavel(
    "DB_NAME"
)

DB_USER = obter_variavel(
    "DB_USER"
)

DB_PASSWORD = obter_variavel(
    "DB_PASSWORD"
)


# ============================================================
# CONFIGURAÇÃO DO BANCO
# ============================================================

DATABASE_CONFIG = {
    "host": DB_HOST,
    "port": DB_PORT,
    "database": DB_NAME,
    "user": DB_USER,
    "password": DB_PASSWORD,
}