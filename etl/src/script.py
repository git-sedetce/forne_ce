
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
ForneCE - Download mensal da base CNPJ da Receita Federal.

Exemplos:
    python src/script.py
    python src/script.py --mes 2026-11
    python src/script.py --listar
    python src/script.py --mes 2026-11 --listar-arquivos
"""

import argparse
import logging
import re
import time
import zipfile
from pathlib import Path
from urllib.parse import quote, unquote
from xml.etree import ElementTree as ET

import requests

TOKEN = "YggdBLfdninEJX9"

BASE_URL = (
    "https://arquivos.receitafederal.gov.br"
    f"/public.php/dav/files/{TOKEN}"
)

# Caminho principal e alternativa para outros layouts.
CAMINHOS = [
    "Dados/Cadastros/CNPJ",
    "",
]

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"

CHUNK_SIZE = 1024 * 1024
TENTATIVAS = 5
TIMEOUT = (30, 180)

NS = {"d": "DAV:"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

log = logging.getLogger("receita")


def criar_sessao():
    sessao = requests.Session()
    sessao.headers.update({
        "User-Agent": "ForneCE-ETL/1.0",
    })
    return sessao


def url_dav(caminho):
    partes = [
        quote(parte, safe="")
        for parte in caminho.strip("/").split("/")
        if parte
    ]
    sufixo = "/".join(partes)
    return f"{BASE_URL}/{sufixo}/" if sufixo else f"{BASE_URL}/"


def listar_dav(sessao, caminho):
    """Lista arquivos e diretórios usando PROPFIND."""
    url = url_dav(caminho)

    resposta = sessao.request(
        "PROPFIND",
        url,
        headers={"Depth": "1"},
        timeout=TIMEOUT,
    )
    resposta.raise_for_status()

    raiz = ET.fromstring(resposta.content)
    itens = []

    for elemento in raiz.findall("d:response", NS):
        href = elemento.findtext("d:href", "", NS)
        nome = unquote(href.rstrip("/").split("/")[-1])

        if not nome:
            continue

        # Identifica se é diretório WebDAV.
        diretorio = elemento.find(
            ".//d:resourcetype/d:collection", NS
        ) is not None

        tamanho = elemento.findtext(
            ".//d:getcontentlength", None, NS
        )

        itens.append({
            "nome": nome,
            "diretorio": diretorio,
            "tamanho": int(tamanho) if tamanho else None,
        })

    # Exclui a própria pasta consultada.
    nome_atual = caminho.rstrip("/").split("/")[-1]

    return [
        item for item in itens
        if item["nome"] != nome_atual
    ]


def localizar_repositorio(sessao):
    """Localiza a pasta com as competências."""
    for caminho in CAMINHOS:
        try:
            itens = listar_dav(sessao, caminho)

            meses = [
                item["nome"]
                for item in itens
                if item["diretorio"]
                and re.fullmatch(
                    r"20\d{2}-(0[1-9]|1[0-2])",
                    item["nome"],
                )
            ]

            if meses:
                return caminho, sorted(meses)

        except (requests.RequestException, ET.ParseError) as erro:
            log.warning(
                "Não foi possível consultar %s: %s",
                caminho or "/",
                erro,
            )

    raise RuntimeError(
        "Não foi possível localizar as competências "
        "no compartilhamento da Receita Federal."
    )


def tamanho_legivel(valor):
    if valor is None:
        return "desconhecido"

    for unidade in ("B", "KB", "MB", "GB", "TB"):
        if valor < 1024:
            return f"{valor:.2f} {unidade}"
        valor /= 1024

    return f"{valor:.2f} PB"


def zip_valido(caminho):
    try:
        with zipfile.ZipFile(caminho) as arquivo:
            return len(arquivo.namelist()) > 0
    except (OSError, zipfile.BadZipFile):
        return False


def baixar_arquivo(sessao, caminho_remoto, destino, tamanho):
    """
    Download com arquivo temporário .part.

    Retoma downloads somente quando o servidor
    confirma suporte ao cabeçalho Range.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = destino.with_name(destino.name + ".part")

    if destino.exists():
        tamanho_local = destino.stat().st_size

        if (
            (tamanho is None or tamanho_local == tamanho)
            and zip_valido(destino)
        ):
            log.info("Já existe: %s", destino.name)
            return True

        log.warning(
            "Arquivo existente inválido: %s",
            destino.name,
        )
        destino.unlink()

    url = url_dav(caminho_remoto.rsplit("/", 1)[0])
    url += quote(caminho_remoto.rsplit("/", 1)[-1])

    for tentativa in range(1, TENTATIVAS + 1):
        try:
            inicio = (
                temporario.stat().st_size
                if temporario.exists()
                else 0
            )

            headers = {}
            if inicio:
                headers["Range"] = f"bytes={inicio}-"

            with sessao.get(
                url,
                headers=headers,
                stream=True,
                timeout=TIMEOUT,
            ) as resposta:

                # 200 significa download completo.
                # 206 significa resposta parcial.
                if resposta.status_code == 206 and inicio:
                    content_range = resposta.headers.get(
                        "Content-Range", ""
                    )
                    esperado = f"bytes {inicio}-"

                    if not content_range.startswith(esperado):
                        raise RuntimeError(
                            "Content-Range inesperado: "
                            + content_range
                        )

                    modo = "ab"

                elif resposta.status_code == 200:
                    modo = "wb"
                    inicio = 0

                elif resposta.status_code == 416:
                    # O parcial pode já estar completo.
                    if (
                        tamanho is not None
                        and inicio == tamanho
                        and zip_valido(temporario)
                    ):
                        temporario.replace(destino)
                        return True

                    temporario.unlink(missing_ok=True)
                    raise RuntimeError(
                        "Intervalo de download inválido."
                    )

                else:
                    resposta.raise_for_status()
                    raise RuntimeError(
                        f"Resposta inesperada: "
                        f"{resposta.status_code}"
                    )

                total = inicio
                ultimo_log = time.monotonic()

                with open(temporario, modo) as arquivo:
                    for bloco in resposta.iter_content(
                        chunk_size=CHUNK_SIZE
                    ):
                        if not bloco:
                            continue

                        arquivo.write(bloco)
                        total += len(bloco)

                        agora = time.monotonic()
                        if agora - ultimo_log >= 10:
                            if tamanho:
                                percentual = total / tamanho * 100
                                log.info(
                                    "%s: %.1f%% (%s)",
                                    destino.name,
                                    percentual,
                                    tamanho_legivel(total),
                                )
                            else:
                                log.info(
                                    "%s: %s",
                                    destino.name,
                                    tamanho_legivel(total),
                                )
                            ultimo_log = agora

            if tamanho is not None:
                if temporario.stat().st_size != tamanho:
                    raise RuntimeError(
                        "Tamanho final diferente do remoto."
                    )

            if not zip_valido(temporario):
                temporario.unlink(missing_ok=True)
                raise RuntimeError(
                    "Arquivo ZIP inválido ou incompleto."
                )

            temporario.replace(destino)

            log.info(
                "Concluído: %s (%s)",
                destino.name,
                tamanho_legivel(destino.stat().st_size),
            )
            return True

        except (requests.RequestException, OSError,
                RuntimeError) as erro:
            log.error(
                "Tentativa %d/%d: %s - %s",
                tentativa,
                TENTATIVAS,
                destino.name,
                erro,
            )

            if tentativa < TENTATIVAS:
                time.sleep(min(5 * tentativa, 30))

    return False


def executar():
    parser = argparse.ArgumentParser(
        description="Download mensal da Receita Federal"
    )

    parser.add_argument(
        "--mes",
        help="Competência no formato AAAA-MM",
    )
    parser.add_argument(
        "--listar",
        action="store_true",
        help="Lista competências disponíveis",
    )
    parser.add_argument(
        "--listar-arquivos",
        action="store_true",
        help="Lista ZIPs da competência sem baixar",
    )

    args = parser.parse_args()

    if args.mes and not re.fullmatch(
        r"20\d{2}-(0[1-9]|1[0-2])", args.mes
    ):
        parser.error("Use --mes AAAA-MM")

    with criar_sessao() as sessao:
        repositorio, meses = localizar_repositorio(sessao)

        if args.listar:
            print("\nCompetências disponíveis:")
            for mes in meses:
                print(f"  {mes}")
            return

        mes = args.mes or meses[-1]

        if mes not in meses:
            raise RuntimeError(
                f"Competência {mes} não encontrada."
            )

        caminho_mes = "/".join(
            parte for parte in (repositorio, mes)
            if parte
        )

        itens = listar_dav(sessao, caminho_mes)

        arquivos = sorted(
            [
                item for item in itens
                if not item["diretorio"]
                and item["nome"].lower().endswith(".zip")
            ],
            key=lambda item: item["nome"].lower(),
        )

        if not arquivos:
            raise RuntimeError(
                f"Nenhum ZIP encontrado em {mes}."
            )

        log.info("Competência: %s", mes)
        log.info("Arquivos encontrados: %d", len(arquivos))

        if args.listar_arquivos:
            for item in arquivos:
                print(
                    f"{item['nome']:32} "
                    f"{tamanho_legivel(item['tamanho'])}"
                )
            return

        destino_mes = RAW_DIR / mes
        destino_mes.mkdir(parents=True, exist_ok=True)

        erros = []

        for indice, item in enumerate(arquivos, 1):
            nome = item["nome"]

            log.info(
                "[%d/%d] %s",
                indice,
                len(arquivos),
                nome,
            )

            sucesso = baixar_arquivo(
                sessao,
                f"{caminho_mes}/{nome}",
                destino_mes / nome,
                item["tamanho"],
            )

            if not sucesso:
                erros.append(nome)

        print("\n" + "=" * 55)
        print("RESUMO DO DOWNLOAD")
        print("=" * 55)
        print(f"Competência: {mes}")
        print(f"Destino: {destino_mes}")
        print(f"Arquivos: {len(arquivos)}")
        print(f"Falhas: {len(erros)}")

        if erros:
            for nome in erros:
                print(f"  FALHOU: {nome}")
            raise SystemExit(1)

        print("STATUS: DOWNLOAD CONCLUÍDO")


if __name__ == "__main__":
    try:
        executar()
    except (RuntimeError, requests.RequestException) as erro:
        log.error("Falha: %s", erro)
        raise SystemExit(1)
