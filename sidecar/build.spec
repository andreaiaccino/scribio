# PyInstaller spec — sidecar Scribio (onedir).
# Build: pyinstaller build.spec   (dal venv con le deps installate)
# Output: dist/scribio-sidecar/  (cartella con scribio-sidecar.exe + _internal)
#
# Lo STT NON è più qui dentro: gira come whisper-server (binario whisper.cpp Vulkan)
# bundlato a parte in resources/whisper. Qui restano solo cattura audio + orchestrazione.

from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = ["numpy"]

# WASAPI loopback + mic
d, b, h = collect_all("pyaudiowpatch")
datas += d
binaries += b
hiddenimports += h

# VAD (estensione C _webrtcvad) per la segmentazione live
d, b, h = collect_all("webrtcvad")
datas += d
binaries += b
hiddenimports += h

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "faster_whisper", "ctranslate2", "torch"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="scribio-sidecar",
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="scribio-sidecar",
)
