# Makes the phone app's launcher icons from the project's own icons (public/icons), and a plain
# orange splash screen with the logo. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts/android-icons.ps1
# It writes into android/app/src/main/res (the generated Android project). Windows only (System.Drawing).
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$res = Join-Path $root 'android\app\src\main\res'
$mask = [System.Drawing.Image]::FromFile((Join-Path $root 'public\icons\maskable-512.png'))
$icon = [System.Drawing.Image]::FromFile((Join-Path $root 'public\icons\icon-512.png'))

function Save-Resized($img, [int]$size, $path, [bool]$round = $false) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'
  if ($round) { $gp = New-Object System.Drawing.Drawing2D.GraphicsPath; $gp.AddEllipse(0, 0, $size - 1, $size - 1); $g.SetClip($gp) }
  $g.DrawImage($img, 0, 0, $size, $size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

# Legacy icons (48dp), round icons, and the adaptive icon's foreground layer (108dp, the logo already sits in its safe zone).
$densities = [ordered]@{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
foreach ($d in $densities.Keys) {
  $px = $densities[$d]
  $dir = Join-Path $res "mipmap-$d"
  Save-Resized $icon $px (Join-Path $dir 'ic_launcher.png')
  Save-Resized $mask $px (Join-Path $dir 'ic_launcher_round.png') $true
  Save-Resized $mask ([int]($px * 108 / 48)) (Join-Path $dir 'ic_launcher_foreground.png')
}

# The brand orange, read from the icon itself.
$c = $mask.GetPixel(8, 8)
$hex = '#{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B
$mask.Dispose(); $icon.Dispose()
Set-Content (Join-Path $res 'values\ic_launcher_background.xml') -Encoding utf8 -Value "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<resources>`n    <color name=`"ic_launcher_background`">$hex</color>`n</resources>"

# Splash: Capacitor's placeholder pictures are removed; one drawable paints the orange with the logo in the middle.
Get-ChildItem $res -Directory -Filter 'drawable*' | ForEach-Object { Remove-Item (Join-Path $_.FullName 'splash.png') -Force -ErrorAction SilentlyContinue }
Set-Content (Join-Path $res 'drawable\splash.xml') -Encoding utf8 -Value @"
<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background" />
    <item android:gravity="center" android:width="160dp" android:height="160dp">
        <bitmap android:src="@mipmap/ic_launcher_foreground" android:gravity="fill" />
    </item>
</layer-list>
"@

# Android 12+ draws its own splash from these (the icon and the background colour).
$styles = Join-Path $res 'values\styles.xml'
$xml = Get-Content $styles -Raw
if ($xml -notmatch 'windowSplashScreenBackground') {
  $xml = $xml -replace '(<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">\s*<item name="android:background">@drawable/splash</item>)', "`$1`n        <item name=`"windowSplashScreenBackground`">@color/ic_launcher_background</item>`n        <item name=`"windowSplashScreenAnimatedIcon`">@mipmap/ic_launcher_foreground</item>"
  Set-Content $styles -Encoding utf8 -Value $xml
}
Write-Host "Icons written. Brand colour $hex."
