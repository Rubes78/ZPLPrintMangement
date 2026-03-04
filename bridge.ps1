# ============================================================
#  ZPL Printer Bridge  -  zpl-bridge.ps1
#
#  Runs a small local HTTP server that lets the ZPL Editor
#  web app list your Windows printers and send raw ZPL to them.
#
#  Usage (run once, keep the window open while printing):
#    powershell -ExecutionPolicy Bypass -File zpl-bridge.ps1
#
#  To start automatically on login, create a shortcut with:
#    Target: powershell -ExecutionPolicy Bypass -WindowStyle Minimized -File "C:\path\to\zpl-bridge.ps1"
# ============================================================

param([int]$Port = 8191)

# ── Raw-print helper (calls Windows Spooler API directly) ─────────────────────
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint="OpenPrinterA",     CharSet=CharSet.Ansi, SetLastError=true)]
    static extern bool OpenPrinter(string name, ref IntPtr h, IntPtr pDefault);

    [DllImport("winspool.drv", EntryPoint="ClosePrinter",     SetLastError=true)]
    static extern bool ClosePrinter(IntPtr h);

    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", CharSet=CharSet.Ansi, SetLastError=true)]
    static extern bool StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);

    [DllImport("winspool.drv", EntryPoint="EndDocPrinter",    SetLastError=true)]
    static extern bool EndDocPrinter(IntPtr h);

    [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true)]
    static extern bool StartPagePrinter(IntPtr h);

    [DllImport("winspool.drv", EntryPoint="EndPagePrinter",   SetLastError=true)]
    static extern bool EndPagePrinter(IntPtr h);

    [DllImport("winspool.drv", EntryPoint="WritePrinter",     SetLastError=true)]
    static extern bool WritePrinter(IntPtr h, IntPtr pBytes, int count, ref int written);

    public static string Send(string printerName, byte[] data) {
        IntPtr h = IntPtr.Zero;
        if (!OpenPrinter(printerName, ref h, IntPtr.Zero))
            return "OpenPrinter failed: " + Marshal.GetLastWin32Error();
        try {
            var di = new DOCINFO { pDocName = "ZPL", pDataType = "RAW" };
            if (!StartDocPrinter(h, 1, di))
                return "StartDocPrinter failed: " + Marshal.GetLastWin32Error();
            if (!StartPagePrinter(h)) {
                EndDocPrinter(h);
                return "StartPagePrinter failed: " + Marshal.GetLastWin32Error();
            }
            IntPtr ptr = Marshal.AllocHGlobal(data.Length);
            int written = 0;
            bool ok = false;
            try {
                Marshal.Copy(data, 0, ptr, data.Length);
                ok = WritePrinter(h, ptr, data.Length, ref written);
            } finally {
                Marshal.FreeHGlobal(ptr);
                EndPagePrinter(h);
                EndDocPrinter(h);
            }
            return ok ? "" : "WritePrinter failed: " + Marshal.GetLastWin32Error();
        } finally {
            ClosePrinter(h);
        }
    }
}
"@

# ── HTTP helper ───────────────────────────────────────────────────────────────
function Reply($ctx, $body, $status = 200) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($body)
    $r = $ctx.Response
    $r.StatusCode          = $status
    $r.ContentType         = "application/json; charset=utf-8"
    $r.ContentLength64     = $bytes.Length
    $r.Headers.Add("Access-Control-Allow-Origin",  "*")
    $r.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $r.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $r.OutputStream.Write($bytes, 0, $bytes.Length)
    $r.OutputStream.Close()
}

# ── List printers ─────────────────────────────────────────────────────────────
function Get-PrinterNames {
    try {
        return @(Get-Printer | Select-Object -ExpandProperty Name | Sort-Object)
    } catch {
        # Fallback for systems without PrintManagement module
        return @(Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name | Sort-Object)
    }
}

# ── Start listener ────────────────────────────────────────────────────────────
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")

try { $listener.Start() }
catch {
    Write-Host "ERROR: Could not start on port $Port. Is another instance already running?" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "  ZPL Printer Bridge is running" -ForegroundColor Green
Write-Host "  Listening on http://localhost:$Port"
Write-Host "  Keep this window open while using the ZPL Editor."
Write-Host "  Press Ctrl+C to stop."
Write-Host ""

# Pre-list printers so first request is fast
$cachedPrinters = Get-PrinterNames
Write-Host "  Found $($cachedPrinters.Count) printer(s): $($cachedPrinters -join ', ')"
Write-Host ""

try {
    while ($listener.IsListening) {
        $ctx = $null
        try { $ctx = $listener.GetContext() } catch { break }

        $method = $ctx.Request.HttpMethod
        $path   = $ctx.Request.Url.AbsolutePath

        # CORS preflight
        if ($method -eq "OPTIONS") { Reply $ctx '{}'; continue }

        switch ($path) {
            "/printers" {
                if ($method -ne "GET") { Reply $ctx '{"error":"method not allowed"}' 405; break }
                $list = Get-PrinterNames
                Reply $ctx ($list | ConvertTo-Json -Compress)
            }
            "/print" {
                if ($method -ne "POST") { Reply $ctx '{"error":"method not allowed"}' 405; break }
                try {
                    $body    = [IO.StreamReader]::new($ctx.Request.InputStream, [Text.Encoding]::UTF8).ReadToEnd()
                    $payload = $body | ConvertFrom-Json
                    $bytes   = [Text.Encoding]::UTF8.GetBytes($payload.zpl)
                    $err     = [RawPrinter]::Send($payload.printer, $bytes)
                    if ($err -eq "") {
                        Write-Host "  Printed to: $($payload.printer)" -ForegroundColor Cyan
                        Reply $ctx '{"ok":true}'
                    } else {
                        Write-Host "  Print error: $err" -ForegroundColor Yellow
                        Reply $ctx "{`"ok`":false,`"error`":`"$err`"}" 500
                    }
                } catch {
                    Reply $ctx "{`"ok`":false,`"error`":`"$_`"}" 500
                }
            }
            default {
                Reply $ctx '{"error":"not found"}' 404
            }
        }
    }
} finally {
    $listener.Stop()
    Write-Host "Bridge stopped."
}
