# Publica o Pontuação Conclave no GitHub (repo público + push main).
# Pré-requisito: gh auth login (https://cli.github.com/)
#
# Uso:
#   .\scripts\publicar-github.ps1
#   .\scripts\publicar-github.ps1 -Owner seu-usuario -Repo pontuacao-conclave

param(
    [string]$Owner = "lregio",
    [string]$Repo = "conclave-mr"
)

$ErrorActionPreference = "Stop"
$git = "C:\Program Files\Git\cmd\git.exe"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Set-Location $root

Write-Host "==> Verificando autenticação GitHub..."
gh auth status | Out-Null

$remoteUrl = "https://github.com/$Owner/$Repo.git"
Write-Host "==> Destino: $remoteUrl"

$exists = gh repo view "$Owner/$Repo" 2>$null
if (-not $exists) {
    Write-Host "==> Criando repositório público $Owner/$Repo..."
    gh repo create "$Owner/$Repo" --public --source=. --remote=origin --description "Pontuação Conclave — app web estático de pontuação do Conclave"
} else {
    Write-Host "==> Repositório já existe; configurando remote..."
    $currentRemote = & $git remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0) {
        & $git remote add origin $remoteUrl
    } else {
        & $git remote set-url origin $remoteUrl
    }
}

Write-Host "==> Enviando branch main..."
& $git push -u origin main

Write-Host "==> Configurando GitHub Pages (source: GitHub Actions)..."
gh api -X PUT "repos/$Owner/$Repo/pages" -f build_type=workflow 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "    (Aviso) Pages API indisponível — configure manualmente em Settings -> Pages -> GitHub Actions"
}

Write-Host ""
Write-Host "Deploy: https://github.com/$Owner/$Repo/actions/workflows/pages.yml"
Write-Host "URL prevista do app: https://$Owner.github.io/$Repo/"
