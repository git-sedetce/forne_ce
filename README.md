# Observatório de Empresas do Ceará — ETL Receita Federal

Pipeline ETL para processamento dos **Dados Abertos do CNPJ da Receita Federal**, com foco na identificação e consolidação de empresas relacionadas ao **Estado do Ceará**.

O projeto processa os arquivos disponibilizados pela Receita Federal, carrega os dados em PostgreSQL e mantém as informações organizadas por **competência**, permitindo armazenar diferentes fotografias mensais da base.

O pipeline foi desenvolvido em **Python**, utilizando **PostgreSQL 17**, `psycopg` e Docker.

---

## Objetivo

O projeto prepara uma base de dados estruturada para aplicações que necessitem consultar informações empresariais como:

- CNPJ;
- razão social;
- nome fantasia;
- natureza jurídica;
- porte;
- capital social;
- situação cadastral;
- CNAE principal e secundários;
- município;
- endereço;
- telefone;
- e-mail;
- quadro societário;
- opção pelo Simples Nacional;
- opção pelo MEI;
- estabelecimentos matriz e filial.

A base resultante poderá ser utilizada posteriormente por APIs, dashboards, sistemas de consulta e ferramentas de análise.

---

# Arquitetura

O fluxo geral é:

```text
Dados Abertos da Receita Federal
              │
              ▼
        Arquivos ZIP
              │
              ▼
      ┌─────────────────┐
      │   Python ETL    │
      └────────┬────────┘
               │
               ▼
        PostgreSQL 17
               │
        ┌──────┴──────┐
        │             │
     staging        public
        │             │
        │             ▼
        │      Dados consolidados
        │
        └── processamento
```

O PostgreSQL é executado através de Docker Compose.

---

# Pipeline ETL

O pipeline possui seis etapas:

```text
1. DOMÍNIOS
      ↓
2. CNPJ CE
      ↓
3. EMPRESAS
      ↓
4. ESTABELECIMENTOS
      ↓
5. SÓCIOS
      ↓
6. SIMPLES
```

A ordem é importante devido às dependências existentes entre as tabelas.

## 1. Domínios

Carrega as tabelas auxiliares:

- CNAEs;
- motivos de situação cadastral;
- municípios;
- naturezas jurídicas;
- países;
- qualificações de sócios/responsáveis.

## 2. CNPJ CE

Analisa os arquivos de estabelecimentos e identifica os CNPJs básicos utilizados para compor o universo empresarial selecionado para o Ceará.

## 3. Empresas

Carrega os dados cadastrais das empresas pertencentes ao conjunto de CNPJs previamente identificado.

## 4. Estabelecimentos

Carrega matrizes e filiais relacionadas aos CNPJs selecionados.

> **Importante:** a seleção é baseada no `cnpj_basico` identificado para o Ceará. Dessa forma, uma empresa selecionada pode possuir estabelecimentos/filiais localizados em outras UFs.

## 5. Sócios

Carrega o quadro societário das empresas selecionadas.

## 6. Simples Nacional

Carrega informações referentes a:

- Simples Nacional;
- MEI;
- datas de opção;
- datas de exclusão.

---

# Tecnologias

Principais tecnologias utilizadas:

- Python 3;
- PostgreSQL 17;
- Docker;
- Docker Compose;
- psycopg 3;
- python-dotenv;
- tqdm.

---

# Estrutura do projeto

Estrutura principal:

```text
forne_ce/
│
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
│
├── database/
│   └── init/
│       ├── 001_schema.sql
│       ├── 002_staging.sql
│       └── 003_indexes.sql
│
└── etl/
    │
    ├── requirements.txt
    │
    ├── data/
    │   └── raw/
    │
    └── src/
        ├── config.py
        ├── database.py
        ├── run_etl.py
        │
        ├── load_domains.py
        ├── extrair_cnpj_ce.py
        ├── load_empresas_ce.py
        ├── etl_estabelecimentos.py
        ├── etl_socios.py
        ├── etl_simples.py
        │
        ├── loaders/
        │   ├── __init__.py
        │   └── dominios.py
        │
        └── services/
            ├── __init__.py
            └── carga_service.py
```

---

# Banco de dados

O banco utiliza três schemas:

```text
public
staging
analytics
```

## `public`

Contém os dados consolidados.

Principais tabelas:

```text
cargas
cnaes
cnpj_ce
empresas
estabelecimentos
motivos_situacao
municipios
naturezas_juridicas
paises
qualificacoes
simples
socios
```

## `staging`

Utilizado para processamento intermediário dos arquivos da Receita Federal.

Tabelas:

```text
cnaes
cnpj_ce
empresas
estabelecimentos
motivos
municipios
naturezas
paises
qualificacoes
simples
socios
```

## `analytics`

Reservado para estruturas analíticas futuras, como:

- views;
- materialized views;
- agregações;
- indicadores;
- consultas para dashboards.

---

# Competência

Os dados são versionados por competência no formato:

```text
YYYY-MM
```

Exemplo:

```text
2026-08
```

Isso permite manter diferentes fotografias da Receita Federal no mesmo banco:

```text
2026-08
2026-09
2026-10
...
```

A competência é configurada através do arquivo `.env`.

---

# Pré-requisitos

Antes de instalar o projeto, certifique-se de possuir:

```text
Git
Docker
Docker Compose
Python 3
python3-venv
```

Verifique:

```bash
git --version
docker --version
docker compose version
python3 --version
```

---

# Instalação

## 1. Clonar o projeto

```bash
git clone <https://github.com/Pakato14/forne_ce>
cd forne_ce
```

---

# Configuração do ambiente

Crie o `.env` utilizando o exemplo:

```bash
cp .env.example .env
```

Exemplo:

```env
DB_HOST=localhost
DB_PORT=5433
DB_NAME=observatorio
DB_USER=observatorio
DB_PASSWORD=troque_a_senha

COMPETENCIA=2026-08
```

Altere principalmente:

```env
DB_PASSWORD=troque_a_senha
```

e informe a competência correspondente aos arquivos que serão processados:

```env
COMPETENCIA=2026-08
```

> O arquivo `.env` contém configurações locais e não deve ser versionado.

---

# PostgreSQL com Docker

O PostgreSQL é disponibilizado pelo `docker-compose.yml`.

Suba o banco:

```bash
docker compose up -d
```

Verifique:

```bash
docker compose ps
```

Também é possível acompanhar os logs:

```bash
docker compose logs -f postgres
```

Para sair dos logs:

```text
Ctrl+C
```

---

# Inicialização automática do banco

Na primeira criação do volume PostgreSQL, os scripts existentes em:

```text
database/init/
```

são executados automaticamente.

Ordem:

```text
001_schema.sql
002_staging.sql
003_indexes.sql
```

Eles são responsáveis por criar:

- schemas;
- tabelas;
- constraints;
- foreign keys;
- staging;
- índices;
- extensão `pg_trgm`.

## Atenção aos volumes Docker

Os scripts de inicialização do PostgreSQL são executados automaticamente apenas quando o diretório de dados do PostgreSQL está vazio.

Portanto:

```bash
docker compose up -d
```

não recria o banco caso o volume já exista.

### Não utilize em produção sem saber o impacto

```bash
docker compose down -v
```

A opção `-v` remove os volumes associados ao Compose e pode apagar permanentemente o banco PostgreSQL.

Para apenas parar os containers:

```bash
docker compose down
```

---

# Configuração do Python

Entre no diretório do ETL:

```bash
cd etl
```

Crie o ambiente virtual:

```bash
python3 -m venv .venv
```

Ative:

```bash
source .venv/bin/activate
```

Atualize o `pip`:

```bash
python -m pip install --upgrade pip
```

Instale as dependências:

```bash
pip install -r requirements.txt
```

As principais dependências são:

```text
psycopg[binary]==3.2.9
python-dotenv==1.1.1
tqdm==4.67.1
```

---

# Arquivos da Receita Federal

Os arquivos ZIP devem ser colocados em:

```text
etl/data/raw/
```

O ETL trabalha diretamente com os arquivos ZIP.

Não é necessário extrair manualmente os arquivos.

Estrutura esperada:

```text
etl/data/raw/
│
├── Cnaes.zip
├── Motivos.zip
├── Municipios.zip
├── Naturezas.zip
├── Paises.zip
├── Qualificacoes.zip
│
├── Empresas0.zip
├── Empresas1.zip
├── Empresas2.zip
├── Empresas3.zip
├── Empresas4.zip
├── Empresas5.zip
├── Empresas6.zip
├── Empresas7.zip
├── Empresas8.zip
├── Empresas9.zip
│
├── Estabelecimentos0.zip
├── Estabelecimentos1.zip
├── Estabelecimentos2.zip
├── Estabelecimentos3.zip
├── Estabelecimentos4.zip
├── Estabelecimentos5.zip
├── Estabelecimentos6.zip
├── Estabelecimentos7.zip
├── Estabelecimentos8.zip
├── Estabelecimentos9.zip
│
├── Socios0.zip
├── Socios1.zip
├── Socios2.zip
├── Socios3.zip
├── Socios4.zip
├── Socios5.zip
├── Socios6.zip
├── Socios7.zip
├── Socios8.zip
├── Socios9.zip
│
└── Simples.zip
```

Os ZIPs não devem ser enviados ao GitHub.

---

# Verificação do ambiente

Antes de executar uma carga, utilize:

```bash
PYTHONPATH=src python src/run_etl.py --check
```

O `--check` **não executa o ETL e não carrega dados**.

Ele verifica:

- arquivo `.env`;
- formato da competência;
- diretório `data/raw`;
- scripts Python;
- conexão PostgreSQL;
- versão do PostgreSQL;
- extensão `pg_trgm`;
- schemas necessários;
- tabelas `public`;
- tabelas `staging`;
- constraint de unicidade dos sócios;
- presença dos arquivos ZIP.

Exemplo de resultado:

```text
================================================================================
VALIDAÇÃO DO AMBIENTE ETL
================================================================================
Competência: 2026-08

--------------------------------------------------------------------------------
AMBIENTE
--------------------------------------------------------------------------------
✓ .env encontrado
✓ Competência válida: 2026-08
✓ Diretório RAW

--------------------------------------------------------------------------------
SCRIPTS
--------------------------------------------------------------------------------
✓ DOMÍNIOS
✓ CNPJ CE
✓ EMPRESAS
✓ ESTABELECIMENTOS
✓ SÓCIOS
✓ SIMPLES

--------------------------------------------------------------------------------
BANCO DE DADOS
--------------------------------------------------------------------------------
✓ PostgreSQL conectado
✓ PostgreSQL versão: 17
✓ Extensão pg_trgm
✓ Schemas public, staging e analytics
✓ Tabelas public
✓ Tabelas staging
✓ Constraint de unicidade dos sócios

================================================================================
ETL PRONTO PARA EXECUÇÃO
================================================================================
Competência: 2026-08
Etapas:      6
Nenhum dado foi carregado.
================================================================================
```

É recomendável executar o `--check` antes de cada nova carga.

---

# Executando o ETL

Após a validação:

```bash
PYTHONPATH=src python src/run_etl.py
```

O pipeline executará automaticamente:

```text
DOMÍNIOS
   ↓
CNPJ CE
   ↓
EMPRESAS
   ↓
ESTABELECIMENTOS
   ↓
SÓCIOS
   ↓
SIMPLES
```

Cada etapa é executada em um processo Python separado.

Isso permite liberar memória e outros recursos entre as diferentes etapas do pipeline.

Se uma etapa retornar erro, o pipeline é interrompido e as etapas seguintes não são executadas.

---

# Controle das cargas

Cada etapa registra sua própria execução na tabela:

```text
public.cargas
```

Os tipos de carga utilizados são:

```text
DOMINIOS
CNPJ_CE
EMPRESAS
ESTABELECIMENTOS
SOCIOS
SIMPLES
```

Cada carga possui informações como:

```text
competencia
tipo_carga
status
data_inicio
data_fim
registros_lidos
registros_processados
registros_inseridos
registros_atualizados
registros_duplicados
registros_erro
mensagem_erro
```

---

# Status das cargas

Os principais status utilizados são:

```text
EM_ANDAMENTO
CONCLUIDA
ERRO
INTERROMPIDA
```

Uma interrupção manual, como:

```text
Ctrl+C
```

é registrada como:

```text
INTERROMPIDA
```

quando a etapa já possui uma carga iniciada e a interrupção é tratada pelo loader.

---

# Consultando o histórico

Exemplo:

```sql
SELECT
    id,
    tipo_carga,
    competencia,
    status,
    registros_lidos,
    registros_processados,
    registros_inseridos,
    registros_duplicados,
    registros_erro,
    data_inicio,
    data_fim
FROM public.cargas
ORDER BY id DESC;
```

---

# Idempotência

As tabelas principais possuem constraints de unicidade e os loaders utilizam estratégias de conflito para impedir duplicação dos registros.

Isso permite reexecutar uma competência já carregada.

Em uma reexecução, registros existentes podem ser contabilizados como duplicados:

```text
registros_inseridos   = 0
registros_duplicados  = registros encontrados
```

A reexecução gera uma nova entrada em `public.cargas`, preservando o histórico da execução.

> A carga atual utiliza predominantemente `ON CONFLICT DO NOTHING`. Portanto, reexecutar a mesma competência não significa substituir os dados existentes nem atualizar automaticamente o `carga_id` das linhas previamente gravadas.

---

# Unicidade dos dados

## CNPJ CE

```text
(cnpj_basico, competencia)
```

## Empresas

```text
(cnpj_basico, competencia)
```

## Estabelecimentos

```text
(cnpj_completo, competencia)
```

## Simples

```text
(cnpj_basico, competencia)
```

## Sócios

A unicidade dos sócios utiliza:

```sql
UNIQUE NULLS NOT DISTINCT (
    empresa_id,
    tipo_socio_codigo,
    documento_socio,
    qualificacao_codigo,
    competencia
)
```

`NULLS NOT DISTINCT` faz com que valores `NULL` sejam considerados equivalentes para a restrição de unicidade.

Por esse motivo, o projeto requer **PostgreSQL 15 ou superior**.

O ambiente Docker utiliza PostgreSQL 17.

---

# Pesquisa textual

O projeto utiliza a extensão PostgreSQL:

```text
pg_trgm
```

Ela permite índices GIN para pesquisas textuais eficientes.

Atualmente são indexados campos como:

```text
empresas.razao_social
estabelecimentos.nome_fantasia
socios.nome_socio
```

Isso prepara o banco para consultas futuras da API por nomes empresariais, nomes fantasia e nomes de sócios.

---

# Atualização mensal

Para carregar uma nova competência:

### 1. Obtenha os arquivos correspondentes à nova competência

Substitua os ZIPs existentes em:

```text
etl/data/raw/
```

pelos arquivos da nova competência.

### 2. Atualize `.env`

Exemplo:

```env
COMPETENCIA=2026-09
```

### 3. Valide

```bash
cd etl

PYTHONPATH=src python src/run_etl.py --check
```

### 4. Execute

```bash
PYTHONPATH=src python src/run_etl.py
```

### 5. Confira as cargas

```sql
SELECT
    id,
    tipo_carga,
    competencia,
    status,
    registros_processados,
    registros_inseridos,
    registros_duplicados,
    registros_erro
FROM public.cargas
WHERE competencia = '2026-09'
ORDER BY id;
```

---

# Consultas de validação

## Quantidade de empresas

```sql
SELECT COUNT(*)
FROM public.empresas
WHERE competencia = '2026-08';
```

## Quantidade de estabelecimentos

```sql
SELECT COUNT(*)
FROM public.estabelecimentos
WHERE competencia = '2026-08';
```

## Quantidade de sócios

```sql
SELECT COUNT(*)
FROM public.socios
WHERE competencia = '2026-08';
```

## Quantidade de registros do Simples

```sql
SELECT COUNT(*)
FROM public.simples
WHERE competencia = '2026-08';
```

## Empresas por município

```sql
SELECT
    m.nome,
    COUNT(*) AS quantidade
FROM public.estabelecimentos e
JOIN public.municipios m
    ON m.codigo = e.municipio_codigo
WHERE e.competencia = '2026-08'
GROUP BY
    m.codigo,
    m.nome
ORDER BY quantidade DESC;
```

## Empresas por CNAE principal

```sql
SELECT
    c.codigo,
    c.descricao,
    COUNT(*) AS quantidade
FROM public.estabelecimentos e
JOIN public.cnaes c
    ON c.codigo = e.cnae_principal_codigo
WHERE e.competencia = '2026-08'
GROUP BY
    c.codigo,
    c.descricao
ORDER BY quantidade DESC;
```

---

# Acessando o PostgreSQL

Através do container:

```bash
docker exec -it observatorio-postgres \
psql \
-U observatorio \
-d observatorio
```

Para sair:

```text
\q
```

---

# Backup

É altamente recomendável realizar backups antes de alterações estruturais.

Exemplo:

```bash
docker exec observatorio-postgres \
pg_dump \
-U observatorio \
-d observatorio \
-Fc \
> observatorio_backup.dump
```

O arquivo gerado estará no computador host.

---

# Restauração de backup

Para restaurar um dump no formato custom:

```bash
cat observatorio_backup.dump | \
docker exec -i observatorio-postgres \
pg_restore \
-U observatorio \
-d observatorio \
--clean \
--if-exists
```

> A restauração com `--clean` remove objetos existentes antes de recriá-los. Utilize somente quando a substituição do banco atual for realmente desejada.

---

# Testando uma instalação limpa

Os scripts existentes em `database/init` foram projetados para permitir a criação de uma nova instância PostgreSQL.

Para testar sem utilizar o banco principal, pode ser criado um container temporário:

```bash
docker run --name observatorio-test \
  -e POSTGRES_DB=observatorio_test \
  -e POSTGRES_USER=observatorio \
  -e POSTGRES_PASSWORD=teste_dev \
  -p 5544:5432 \
  -v "$(pwd)/database/init:/docker-entrypoint-initdb.d:ro" \
  -d postgres:17
```

Verifique:

```bash
docker logs observatorio-test
```

Teste a conexão:

```bash
docker exec observatorio-test \
pg_isready \
-U observatorio \
-d observatorio_test
```

Depois do teste:

```bash
docker rm -f observatorio-test
```

---

# Segurança

Nunca envie para o GitHub:

```text
.env
etl/.venv/
etl/data/raw/
*.dump
*.log
__pycache__/
*.pyc
```

O `.gitignore` deve impedir o versionamento desses arquivos.

Antes de realizar um commit, confira:

```bash
git status
```

Também é possível testar:

```bash
git check-ignore -v .env
git check-ignore -v etl/data/raw/Empresas0.zip
git check-ignore -v etl/.venv/bin/python
```

---

# Git

Exemplo de primeiro commit:

```bash
git status

git add .

git status
```

Antes do commit, confira cuidadosamente se `.env`, arquivos ZIP e `.venv` não estão sendo adicionados.

Depois:

```bash
git commit -m "feat: estrutura inicial do ETL da Receita Federal"
```

E envie para o repositório remoto:

```bash
git push
```

---

# Troubleshooting

## Erro de conexão com PostgreSQL

Verifique:

```bash
docker compose ps
```

Depois:

```bash
docker compose logs postgres
```

Confira também:

```env
DB_HOST=localhost
DB_PORT=5433
DB_NAME=observatorio
DB_USER=observatorio
DB_PASSWORD=...
```

---

## Arquivo ZIP não encontrado

Execute:

```bash
PYTHONPATH=src python src/run_etl.py --check
```

O programa informará exatamente quais arquivos estão ausentes.

Os arquivos devem estar em:

```text
etl/data/raw/
```

---

## Competência inválida

Utilize:

```text
YYYY-MM
```

Correto:

```env
COMPETENCIA=2026-08
```

Incorreto:

```env
COMPETENCIA=08/2026
```

---

## Pipeline interrompido

Consulte:

```sql
SELECT
    id,
    tipo_carga,
    competencia,
    status,
    mensagem_erro,
    data_inicio,
    data_fim
FROM public.cargas
ORDER BY id DESC;
```

Identifique a etapa com:

```text
ERRO
```

ou:

```text
INTERROMPIDA
```

Corrija a causa e execute novamente o pipeline.

Como as cargas são protegidas por constraints de unicidade, as etapas já processadas podem ser reexecutadas sem gerar novas cópias dos mesmos registros.

---

# Desempenho

O volume original da Receita Federal possui dezenas de milhões de registros.

Para lidar com esse volume, o ETL utiliza estratégias como:

- leitura direta dos arquivos ZIP;
- processamento em lotes;
- `COPY` do PostgreSQL;
- tabelas temporárias/staging;
- `INSERT ... ON CONFLICT`;
- índices B-tree;
- índices GIN/trigram;
- execução das etapas em subprocessos separados.

O tempo total depende principalmente de:

- CPU;
- armazenamento;
- memória;
- desempenho do PostgreSQL;
- tamanho da competência da Receita Federal.

Uma carga completa pode levar várias horas.

---

# Observações sobre CNPJ

Os campos de CNPJ são armazenados como texto (`VARCHAR`) e não como tipos numéricos.

Exemplo:

```text
cnpj_basico VARCHAR(8)
cnpj_completo VARCHAR(14)
```

Isso preserva zeros à esquerda e evita tratar identificadores cadastrais como valores matemáticos.

---

# Desenvolvimento futuro

A base foi estruturada para servir como camada de dados para uma API.

Próximas evoluções previstas podem incluir:

- API REST;
- consulta por CNPJ;
- pesquisa por razão social;
- pesquisa por nome fantasia;
- consulta por CNAE;
- consulta por município;
- consulta de sócios;
- consulta de empresas por porte;
- filtros por situação cadastral;
- indicadores empresariais;
- dashboards;
- views no schema `analytics`;
- materialized views;
- paginação e busca textual;
- cache de consultas;
- documentação OpenAPI/Swagger.

---

# Fluxo resumido para nova instalação

```bash
# Clonar
git clone <https://github.com/Pakato14/forne_ce>
cd forne_ce

# Configuração
cp .env.example .env
nano .env

# PostgreSQL
docker compose up -d

# Python
cd etl
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Colocar os ZIPs em:
# etl/data/raw/

# Validar
PYTHONPATH=src python src/run_etl.py --check

# Executar
PYTHONPATH=src python src/run_etl.py
```

---

# Licença e fonte dos dados

Os dados empresariais processados por este projeto são provenientes dos **Dados Abertos do CNPJ disponibilizados pela Receita Federal do Brasil**.

Este repositório contém o código do processo ETL e a estrutura do banco de dados. Os arquivos brutos da Receita Federal não são armazenados no repositório.

Consulte os termos, documentação e condições de utilização aplicáveis aos dados diretamente na fonte oficial.

---

# Autor

Projeto desenvolvido para estruturação, processamento e consulta de dados empresariais do Estado do Ceará.