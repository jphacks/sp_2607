# src/ の分割ファイルを、公開用の1つのHTML（dist/fukurozume.html）にまとめる
#   使い方:  pwsh ./build.ps1
#   - <link rel="stylesheet" href="styles.css"> を <style> に埋め込む
#   - <script src="js/*.js"></script> を <script> に埋め込む（CDNの three.js はそのまま）
#   - <!-- artifact:begin --> と <!-- artifact:end --> の間だけを取り出し、<head>/<body> タグを外す
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$src  = Join-Path $root "src"
$dist = Join-Path $root "dist"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Src([string]$rel){
  $p = Join-Path $src $rel
  if(-not (Test-Path $p)){ throw "見つかりません: $p" }
  return [System.IO.File]::ReadAllText($p, $utf8)
}

$html = Read-Src "index.html"

$m = [regex]::Match($html, '<!-- artifact:begin -->(.*)<!-- artifact:end -->', 'Singleline')
if(-not $m.Success){ throw "index.html に artifact:begin / artifact:end の目印がありません" }
$body = $m.Groups[1].Value
$body = [regex]::Replace($body, '</?(head|body)>\r?\n?', '')

$body = [regex]::Replace($body, '<link rel="stylesheet" href="(styles\.css)">',
  [System.Text.RegularExpressions.MatchEvaluator]{ param($x) "<style>`n" + (Read-Src $x.Groups[1].Value) + "</style>" })

$body = [regex]::Replace($body, '<script src="(js/[^"]+)"></script>',
  [System.Text.RegularExpressions.MatchEvaluator]{ param($x) "<script>`n" + (Read-Src $x.Groups[1].Value) + "</script>" })

if(-not (Test-Path $dist)){ New-Item -ItemType Directory -Path $dist | Out-Null }
$out = Join-Path $dist "fukurozume.html"
[System.IO.File]::WriteAllText($out, $body.Trim() + "`n", $utf8)
Write-Host ("書き出しました: {0} ({1:N0} KB)" -f $out, ((Get-Item $out).Length / 1KB))
