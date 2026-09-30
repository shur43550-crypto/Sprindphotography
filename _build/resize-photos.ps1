# 把照片缩放成网页可用尺寸（长边 2000px、JPEG 质量 85）。
# 用 System.Drawing：Windows 自带，无需额外依赖；BMP/PNG/JPEG 都能读。
# 保留原始宽高比（不裁切），文件名统一为 web_序号_原名.jpg
param(
  [Parameter(Mandatory=$true)][string]$Src,
  [Parameter(Mandatory=$true)][string]$Dst,
  [int]$MaxEdge = 2000,
  [int]$Quality = 85
)

Add-Type -AssemblyName System.Drawing

$exts = @('.jpg','.jpeg','.png','.webp','.bmp','.gif')
$files = Get-ChildItem -LiteralPath $Src -File | Where-Object { $exts -contains $_.Extension.ToLower() } | Sort-Object Name
New-Item -ItemType Directory -Force -Path $Dst | Out-Null

# JPEG 编码器：必须用 ImageCodecInfo 查（用 Encoder.Quality 查会得到 null —— 那是
# 参数类别不是编码器）。按 MimeType 匹配最稳，不依赖 ImageFormat.Jpeg 的 GUID。
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
if (-not $codec) {
  # 兜底：按 FormatDescription / 扩展名找
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FilenameExtension -match 'jpg' } | Select-Object -First 1
}
if (-not $codec) {
  Write-Error "找不到 JPEG 编码器，GDI+ 可能不可用。可用编码器：$(([System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | ForEach-Object { $_.MimeType }) -join ', ')"
  exit 1
}
Write-Host "使用编码器: $($codec.MimeType) ($($codec.FormatDescription))"
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int]$Quality)

$i = 0
$okCount = 0; $failCount = 0
$report = @()

foreach ($f in $files) {
  $i++
  $outName = ('{0:d3}_{1}.jpg' -f $i, [System.IO.Path]::GetFileNameWithoutExtension($f.Name))
  $outPath = Join-Path $Dst $outName
  try {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $w = $img.Width; $h = $img.Height
    $scale = [Math]::Min(1.0, [Math]::Min($MaxEdge / $w, $MaxEdge / $h))
    $nw = [int][Math]::Round($w * $scale); $nh = [int][Math]::Round($h * $scale)

    # 用 24bpp 位图重绘（原始可能是索引色/32bpp，直接存 JPEG 会失败）
    $bmp = New-Object System.Drawing.Bitmap($nw, $nh, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode  = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode    = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($img, 0, 0, $nw, $nh)
    $g.Dispose()
    $bmp.Save($outPath, $codec, $encParams)
    $bmp.Dispose()
    $img.Dispose()

    $outKB = [math]::Round((Get-Item $outPath).Length / 1KB)
    $okCount++
    $report += [pscustomobject]@{ out=$outName; srcW=$w; srcH=$h; w=$nw; h=$nh; orient=$(if($nw -gt $nh*1.02){'landscape'}elseif($nh -gt $nw*1.02){'portrait'}else{'square'}); ratio=[math]::Round($nw/$nh,3); kb=$outKB }
    Write-Host ("  OK  {0,-52} {1}x{2} -> {3}x{4}  {5}KB" -f $f.Name, $w, $h, $nw, $nh, $outKB)
  } catch {
    $failCount++
    Write-Host ("  FAIL {0} -> {1}" -f $f.Name, $_.Exception.Message)
  }
}

$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Dst '_sizes.json') -Encoding UTF8
$totalMB = [math]::Round(((Get-ChildItem $Dst -File -Filter *.jpg | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host ""
Write-Host ("完成: 成功 $okCount / 失败 $failCount")
Write-Host ("输出目录: $Dst")
Write-Host ("输出总大小: $totalMB MB")
