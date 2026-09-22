import argparse
import csv
import re
import sys
from pathlib import Path

from database import get_connection


PADRAO_ARQUIVO = "DADOS_DE_EMPRESAS_NO_ESTADO_CE_*.csv"
TIPO_CARGA = "JUNTA_EMPRESAS"
COLUNAS_CSV = [
    "CNPJ", "CNAES", "RAZAO_SOCIAL", "NOME_FANTASIA", "STATUS", "PORTE",
    "MUNICIPIO", "REGIAO", "NU_DDDTELEFONE", "NU_TELEFONE", "EMAIL",
    "TIPO_LOGRADOURO", "NOME_LOGRADOURO", "NUM_LOGRADOURO", "BAIRRO",
    "CD_OPCAO_SIMPLES_NACIONAL", "DATA_ABERTURA", "DATA_ENCERRAMENTO",
]


def argumentos():
    parser = argparse.ArgumentParser(description="Carga de empresas da Junta Comercial do Ceará.")
    parser.add_argument("--competencia", required=True, help="Competência no formato YYYY-MM.")
    parser.add_argument("--arquivo", type=Path, help="CSV da Junta. Se omitido, procura o arquivo mais recente.")
    parser.add_argument("--raw-dir", type=Path, default=Path("data/raw/junta"))
    return parser.parse_args()


def validar_competencia(valor):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", valor):
        raise ValueError("Competência inválida. Use YYYY-MM, por exemplo 2026-09.")


def localizar_arquivo(args):
    if args.arquivo:
        arquivo = args.arquivo.expanduser().resolve()
        if not arquivo.is_file():
            raise FileNotFoundError(f"CSV não encontrado: {arquivo}")
        return arquivo

    pasta = args.raw_dir.expanduser().resolve()
    arquivos = list(pasta.glob(PADRAO_ARQUIVO))
    if not arquivos:
        raise FileNotFoundError(f"Nenhum arquivo {PADRAO_ARQUIVO} encontrado em {pasta}")
    return max(arquivos, key=lambda p: p.stat().st_mtime)


def abrir_csv(arquivo):
    try:
        f = arquivo.open("r", encoding="utf-8-sig", newline="")
        f.read(4096)
        f.seek(0)
        return f
    except UnicodeDecodeError:
        try:
            f.close()
        except Exception:
            pass
        return arquivo.open("r", encoding="latin-1", newline="")


def criar_carga(cur, competencia):
    cur.execute(
        """
        INSERT INTO public.cargas (competencia, tipo_carga, status)
        VALUES (%s, %s, 'EM_PROCESSAMENTO')
        RETURNING id
        """,
        (competencia, TIPO_CARGA),
    )
    return cur.fetchone()[0]


def atualizar_carga_sucesso(cur, carga_id, lidos, inseridos, atualizados):
    cur.execute(
        """
        UPDATE public.cargas
           SET data_fim = CURRENT_TIMESTAMP,
               status = 'CONCLUIDA',
               registros_lidos = %s,
               registros_processados = %s,
               registros_inseridos = %s,
               registros_atualizados = %s,
               registros_duplicados = 0,
               registros_erro = 0,
               mensagem_erro = NULL
         WHERE id = %s
        """,
        (lidos, lidos, inseridos, atualizados, carga_id),
    )


def atualizar_carga_erro(conn, carga_id, mensagem):
    conn.rollback()
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE public.cargas
               SET data_fim = CURRENT_TIMESTAMP,
                   status = 'ERRO',
                   registros_erro = 1,
                   mensagem_erro = %s
             WHERE id = %s
            """,
            (mensagem[:10000], carga_id),
        )
    conn.commit()


def carregar_staging(cur, arquivo):
    cur.execute("TRUNCATE TABLE staging.junta_empresas")
    total = 0
    with abrir_csv(arquivo) as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != COLUNAS_CSV:
            faltantes = sorted(set(COLUNAS_CSV) - set(reader.fieldnames or []))
            extras = sorted(set(reader.fieldnames or []) - set(COLUNAS_CSV))
            raise ValueError(f"Cabeçalho inesperado. Faltantes={faltantes}; extras={extras}")

        with cur.copy(
            """
            COPY staging.junta_empresas (
                cnpj, cnaes, razao_social, nome_fantasia, status, porte,
                municipio, regiao, nu_dddtelefone, nu_telefone, email,
                tipo_logradouro, nome_logradouro, num_logradouro, bairro,
                cd_opcao_simples_nacional, data_abertura, data_encerramento
            ) FROM STDIN
            """
        ) as copy:
            for row in reader:
                copy.write_row([row[col] if row[col] != "" else None for col in COLUNAS_CSV])
                total += 1
    return total


def validar_staging(cur):
    cur.execute(
        """
        SELECT COUNT(*)
          FROM staging.junta_empresas
         WHERE regexp_replace(COALESCE(cnpj, ''), '\\D', '', 'g') !~ '^\\d{14}$'
        """
    )
    invalidos = cur.fetchone()[0]
    if invalidos:
        raise ValueError(f"Existem {invalidos} registros com CNPJ inválido.")

    cur.execute(
        """
        SELECT cnae
          FROM (
                SELECT DISTINCT trim(cnae) AS cnae
                  FROM staging.junta_empresas s
                  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(s.cnaes, ''), '\\s*,\\s*') cnae
               ) x
         WHERE cnae <> ''
           AND (cnae !~ '^\\d{7}$' OR NOT EXISTS (
                SELECT 1 FROM public.cnaes c WHERE c.codigo = x.cnae
           ))
         ORDER BY cnae
         LIMIT 20
        """
    )
    cnaes_invalidos = [r[0] for r in cur.fetchall()]
    if cnaes_invalidos:
        raise ValueError("CNAEs inválidos ou ausentes em public.cnaes (amostra): " + ", ".join(cnaes_invalidos))


def promover_empresas(cur, competencia, carga_id):
    cur.execute(
        """
        WITH origem AS (
            SELECT
                regexp_replace(cnpj, '\\D', '', 'g') AS cnpj,
                NULLIF(trim(razao_social), '') AS razao_social,
                NULLIF(trim(nome_fantasia), '') AS nome_fantasia,
                NULLIF(upper(trim(status)), '') AS status,
                NULLIF(upper(trim(porte)), '') AS porte,
                NULLIF(upper(trim(municipio)), '') AS municipio,
                NULLIF(upper(trim(regiao)), '') AS regiao,
                NULLIF(regexp_replace(COALESCE(nu_dddtelefone, ''), '\\D', '', 'g'), '') AS ddd_telefone,
                NULLIF(regexp_replace(COALESCE(nu_telefone, ''), '\\D', '', 'g'), '') AS telefone,
                NULLIF(upper(trim(email)), '') AS email,
                NULLIF(upper(trim(tipo_logradouro)), '') AS tipo_logradouro,
                NULLIF(trim(nome_logradouro), '') AS logradouro,
                NULLIF(trim(num_logradouro), '') AS numero,
                NULLIF(trim(bairro), '') AS bairro,
                NULLIF(upper(trim(cd_opcao_simples_nacional)), '') AS opcao_simples_nacional,
                CASE WHEN NULLIF(trim(data_abertura), '') IS NULL THEN NULL
                     ELSE to_timestamp(trim(data_abertura), 'DD-MM-YYYY HH24:MI:SS.MS')::date END AS data_abertura,
                CASE WHEN NULLIF(trim(data_encerramento), '') IS NULL THEN NULL
                     ELSE to_timestamp(trim(data_encerramento), 'DD-MM-YYYY HH24:MI:SS.MS')::date END AS data_encerramento
            FROM staging.junta_empresas
        ), marcados AS (
            SELECT o.*, EXISTS (
                SELECT 1 FROM public.junta_empresas j
                 WHERE j.cnpj = o.cnpj AND j.competencia = %s
            ) AS ja_existia
            FROM origem o
        ), upsert AS (
            INSERT INTO public.junta_empresas (
                cnpj, razao_social, nome_fantasia, status, porte, municipio, regiao,
                ddd_telefone, telefone, email, tipo_logradouro, logradouro, numero,
                bairro, opcao_simples_nacional, data_abertura, data_encerramento,
                competencia, carga_id
            )
            SELECT cnpj, razao_social, nome_fantasia, status, porte, municipio, regiao,
                   ddd_telefone, telefone, email, tipo_logradouro, logradouro, numero,
                   bairro, opcao_simples_nacional, data_abertura, data_encerramento,
                   %s, %s
              FROM marcados
            ON CONFLICT (cnpj, competencia) DO UPDATE SET
                razao_social = EXCLUDED.razao_social,
                nome_fantasia = EXCLUDED.nome_fantasia,
                status = EXCLUDED.status,
                porte = EXCLUDED.porte,
                municipio = EXCLUDED.municipio,
                regiao = EXCLUDED.regiao,
                ddd_telefone = EXCLUDED.ddd_telefone,
                telefone = EXCLUDED.telefone,
                email = EXCLUDED.email,
                tipo_logradouro = EXCLUDED.tipo_logradouro,
                logradouro = EXCLUDED.logradouro,
                numero = EXCLUDED.numero,
                bairro = EXCLUDED.bairro,
                opcao_simples_nacional = EXCLUDED.opcao_simples_nacional,
                data_abertura = EXCLUDED.data_abertura,
                data_encerramento = EXCLUDED.data_encerramento,
                carga_id = EXCLUDED.carga_id,
                updated_at = CURRENT_TIMESTAMP
            RETURNING cnpj
        )
        SELECT
            COUNT(*) FILTER (WHERE NOT ja_existia),
            COUNT(*) FILTER (WHERE ja_existia)
        FROM marcados
        """,
        (competencia, competencia, carga_id),
    )
    return cur.fetchone()


def promover_cnaes(cur, competencia, carga_id):
    cur.execute(
        """
        DELETE FROM public.junta_empresa_cnaes jec
         USING public.junta_empresas je
         WHERE je.id = jec.junta_empresa_id
           AND je.competencia = %s
        """,
        (competencia,),
    )

    cur.execute(
        """
        INSERT INTO public.junta_empresa_cnaes (
            junta_empresa_id, cnae_codigo, ordem, carga_id
        )
        SELECT je.id, x.cnae, x.ordem::smallint, %s
          FROM staging.junta_empresas s
          JOIN public.junta_empresas je
            ON je.cnpj = regexp_replace(s.cnpj, '\\D', '', 'g')
           AND je.competencia = %s
          CROSS JOIN LATERAL (
              SELECT trim(valor) AS cnae, ord AS ordem
                FROM regexp_split_to_table(COALESCE(s.cnaes, ''), '\\s*,\\s*')
                     WITH ORDINALITY AS t(valor, ord)
               WHERE trim(valor) <> ''
          ) x
        ON CONFLICT (junta_empresa_id, cnae_codigo) DO NOTHING
        """,
        (carga_id, competencia),
    )
    return cur.rowcount


def main():
    args = argumentos()
    validar_competencia(args.competencia)
    arquivo = localizar_arquivo(args)

    print("=" * 80)
    print("CARGA JUNTA COMERCIAL - EMPRESAS")
    print("=" * 80)
    print(f"Competência: {args.competencia}")
    print(f"Arquivo:     {arquivo}")

    conn = get_connection()
    carga_id = None
    try:
        with conn.cursor() as cur:
            carga_id = criar_carga(cur, args.competencia)
        conn.commit()  # preserva o registro da carga mesmo se a transformação falhar

        with conn.cursor() as cur:
            lidos = carregar_staging(cur, arquivo)
            validar_staging(cur)
            inseridos, atualizados = promover_empresas(cur, args.competencia, carga_id)
            total_cnaes = promover_cnaes(cur, args.competencia, carga_id)
            atualizar_carga_sucesso(cur, carga_id, lidos, inseridos, atualizados)
        conn.commit()

        print(f"Carga ID:    {carga_id}")
        print(f"Lidos:       {lidos:,}")
        print(f"Inseridos:   {inseridos:,}")
        print(f"Atualizados: {atualizados:,}")
        print(f"CNAEs:       {total_cnaes:,}")
        print("=" * 80)
        print("CARGA CONCLUÍDA COM SUCESSO")
        print("=" * 80)

    except Exception as exc:
        if carga_id is not None:
            atualizar_carga_erro(conn, carga_id, str(exc))
        print(f"ERRO: {exc}", file=sys.stderr)
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
