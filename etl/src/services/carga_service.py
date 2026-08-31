from typing import Optional


# ============================================================
# INICIAR CARGA
# ============================================================

def iniciar_carga(
    conn,
    tipo_carga: str,
    competencia: str,
) -> int:

    with conn.cursor() as cur:

        cur.execute(
            """
            INSERT INTO public.cargas (
                competencia,
                tipo_carga,
                status,
                data_inicio,
                registros_lidos,
                registros_processados,
                registros_inseridos,
                registros_atualizados,
                registros_duplicados,
                registros_erro
            )
            VALUES (
                %s,
                %s,
                'EM_ANDAMENTO',
                CURRENT_TIMESTAMP,
                0,
                0,
                0,
                0,
                0,
                0
            )
            RETURNING id
            """,
            (
                competencia,
                tipo_carga,
            ),
        )

        carga_id = cur.fetchone()[0]

    conn.commit()

    print(
        f"Carga criada: "
        f"ID={carga_id} | "
        f"Tipo={tipo_carga} | "
        f"Competência={competencia}"
    )

    return carga_id


# ============================================================
# ATUALIZAR CARGA
# ============================================================

def atualizar_carga(
    conn,
    carga_id: int,
    registros_lidos: Optional[int] = None,
    registros_processados: Optional[int] = None,
    registros_inseridos: Optional[int] = None,
    registros_atualizados: Optional[int] = None,
    registros_duplicados: Optional[int] = None,
    registros_erro: Optional[int] = None,
) -> None:

    campos = []
    valores = []

    if registros_lidos is not None:
        campos.append(
            "registros_lidos = %s"
        )
        valores.append(
            registros_lidos
        )

    if registros_processados is not None:
        campos.append(
            "registros_processados = %s"
        )
        valores.append(
            registros_processados
        )

    if registros_inseridos is not None:
        campos.append(
            "registros_inseridos = %s"
        )
        valores.append(
            registros_inseridos
        )

    if registros_atualizados is not None:
        campos.append(
            "registros_atualizados = %s"
        )
        valores.append(
            registros_atualizados
        )

    if registros_duplicados is not None:
        campos.append(
            "registros_duplicados = %s"
        )
        valores.append(
            registros_duplicados
        )

    if registros_erro is not None:
        campos.append(
            "registros_erro = %s"
        )
        valores.append(
            registros_erro
        )

    if not campos:
        return

    valores.append(
        carga_id
    )

    sql = f"""
        UPDATE public.cargas
        SET {", ".join(campos)}
        WHERE id = %s
    """

    with conn.cursor() as cur:

        cur.execute(
            sql,
            valores,
        )

    conn.commit()


# ============================================================
# CONCLUIR CARGA
# ============================================================

def concluir_carga(
    conn,
    carga_id: int,
    registros_lidos: int = 0,
    registros_processados: int = 0,
    registros_inseridos: int = 0,
    registros_atualizados: int = 0,
    registros_duplicados: int = 0,
    registros_erro: int = 0,
) -> None:

    with conn.cursor() as cur:

        cur.execute(
            """
            UPDATE public.cargas
            SET
                status = 'CONCLUIDA',
                data_fim = CURRENT_TIMESTAMP,
                registros_lidos = %s,
                registros_processados = %s,
                registros_inseridos = %s,
                registros_atualizados = %s,
                registros_duplicados = %s,
                registros_erro = %s,
                mensagem_erro = NULL
            WHERE id = %s
            """,
            (
                registros_lidos,
                registros_processados,
                registros_inseridos,
                registros_atualizados,
                registros_duplicados,
                registros_erro,
                carga_id,
            ),
        )

    conn.commit()


# ============================================================
# FALHAR CARGA
# ============================================================

def falhar_carga(
    conn,
    carga_id: int,
    erro,
    registros_lidos: int = 0,
    registros_processados: int = 0,
    registros_inseridos: int = 0,
    registros_atualizados: int = 0,
    registros_duplicados: int = 0,
    registros_erro: int = 0,
) -> None:

    try:
        conn.rollback()
    except Exception:
        pass

    mensagem = str(
        erro
    )

    if len(mensagem) > 5000:
        mensagem = mensagem[:5000]

    with conn.cursor() as cur:

        cur.execute(
            """
            UPDATE public.cargas
            SET
                status = 'ERRO',
                data_fim = CURRENT_TIMESTAMP,
                registros_lidos = %s,
                registros_processados = %s,
                registros_inseridos = %s,
                registros_atualizados = %s,
                registros_duplicados = %s,
                registros_erro = %s,
                mensagem_erro = %s
            WHERE id = %s
            """,
            (
                registros_lidos,
                registros_processados,
                registros_inseridos,
                registros_atualizados,
                registros_duplicados,
                registros_erro,
                mensagem,
                carga_id,
            ),
        )

    conn.commit()


# ============================================================
# INTERROMPER CARGA
# ============================================================

def interromper_carga(
    conn,
    carga_id: int,
    registros_lidos: int = 0,
    registros_processados: int = 0,
    registros_inseridos: int = 0,
    registros_atualizados: int = 0,
    registros_duplicados: int = 0,
    registros_erro: int = 0,
) -> None:

    try:
        conn.rollback()
    except Exception:
        pass

    with conn.cursor() as cur:

        cur.execute(
            """
            UPDATE public.cargas
            SET
                status = 'INTERROMPIDA',
                data_fim = CURRENT_TIMESTAMP,
                registros_lidos = %s,
                registros_processados = %s,
                registros_inseridos = %s,
                registros_atualizados = %s,
                registros_duplicados = %s,
                registros_erro = %s,
                mensagem_erro = 'Carga interrompida manualmente'
            WHERE id = %s
            """,
            (
                registros_lidos,
                registros_processados,
                registros_inseridos,
                registros_atualizados,
                registros_duplicados,
                registros_erro,
                carga_id,
            ),
        )

    conn.commit()