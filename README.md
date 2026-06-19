# Dash Gestao

Dashboard conectado ao Google Sheets e pronto para deploy no Vercel.

## Planilha

Planilha usada por padrao:

```text
https://docs.google.com/spreadsheets/d/18TbxyCQ-bdEp8vs2bsxqo9zRZ-mritYvLa7Twwpsa1U/edit?gid=433514608
```

Para funcionar no Vercel, a planilha precisa estar publica para leitura:

1. Abra a planilha no Google Sheets.
2. Clique em `Compartilhar`.
3. Altere para `Qualquer pessoa com o link`.
4. Permissao: `Leitor`.

## Colunas aceitas

O dashboard reconhece automaticamente nomes comuns de colunas.

Formato por linhas:

```text
Data | Descricao | Categoria | Status | Valor
```

Formato com meses em colunas:

```text
Descricao | Categoria | Jan | Fev | Mar | Abr | Mai | Jun | Jul | Ago | Set | Out | Nov | Dez
```

Status como `Pago`, `Pendente`, `Recebido`, `Quitado` e semelhantes sao agrupados automaticamente.

## Deploy no Vercel

1. Envie estes arquivos para o repositorio do GitHub.
2. Entre em https://vercel.com.
3. Clique em `Add New Project`.
4. Importe o repositorio `dreamleague2102-lgtm/Dash-Gest-o-`.
5. Framework: `Other`.
6. Build Command: deixe vazio.
7. Output Directory: deixe vazio ou use `.`.
8. Clique em `Deploy`.

Depois do deploy, quando a planilha for alterada, o dashboard atualiza sozinho a cada 60 segundos. O botao `Atualizar` tambem busca os dados na hora.

## Testar localmente

Com Python instalado:

```bash
python codigo.py
```

Depois abra:

```text
http://localhost:8000
```

## Trocar planilha

Se quiser usar outra planilha depois, crie variaveis de ambiente no Vercel:

```text
SHEET_ID=ID_DA_PLANILHA
SHEET_GID=GID_DA_ABA
```

O `SHEET_ID` fica entre `/d/` e `/edit` na URL do Google Sheets. O `SHEET_GID` fica no final da URL depois de `gid=`.
