# Override del contrib hook (stdhooks/hook-webrtcvad.py), che fa
# copy_metadata('webrtcvad') e CRASHA: il pacchetto installato è
# `webrtcvad-wheels` (ruota precompilata), la cui distribuzione si chiama
# 'webrtcvad-wheels', non 'webrtcvad'. L'estensione C `_webrtcvad` è un
# modulo top-level e viene raccolta da sola dall'analisi degli import.
from PyInstaller.utils.hooks import copy_metadata

datas = copy_metadata("webrtcvad-wheels")
