Add-Type -AssemblyName System.IO.Compression.FileSystem
$dir = "C:\Users\Javier\Desktop\PROYECTOS VS Studio\Auto Trading\dental-platform\docs\consentimientos"
$out = Join-Path $dir "extraido"
New-Item -ItemType Directory -Force -Path $out | Out-Null
Get-ChildItem -Path $dir -Filter *.docx | ForEach-Object {
  $zip = [System.IO.Compression.ZipFile]::OpenRead($_.FullName)
  $entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
  $reader = New-Object System.IO.StreamReader($entry.Open())
  $xml = $reader.ReadToEnd()
  $reader.Close(); $zip.Dispose()
  $xml = $xml -replace '</w:p>', "`n"
  $xml = $xml -replace '<w:tab[^>]*/>', "`t"
  $xml = $xml -replace '<w:br[^>]*/>', "`n"
  $text = [System.Text.RegularExpressions.Regex]::Replace($xml, '<[^>]+>', '')
  $text = $text -replace '&amp;','&' -replace '&lt;','<' -replace '&gt;','>' -replace '&quot;','"' -replace '&#39;',"'" -replace '&apos;',"'"
  $target = Join-Path $out ($_.BaseName + '.txt')
  [System.IO.File]::WriteAllText($target, $text, [System.Text.Encoding]::UTF8)
}
Get-ChildItem $out -Filter *.txt | Select-Object Name, Length | Format-Table -AutoSize
