"use strict";

const LOCALSTORAGE_PREFIX = "spectro-web"

var _snapshots = []

function storageSaveSnapshot()
{
    var t = new Date()

    var snapshot =
    {
        version: 1,
        time: t.getTime(),
        title: t.toLocaleString(),
        settings: structuredClone(_settings),
        calibrationSettings: structuredClone(_calibrationSettings),
        inspectSettings: structuredClone(_inspectSettings),
        scopeSettings: structuredClone(_scopeSettings),
        pixelValues: structuredClone(_pixelValues),
        scopeData: structuredClone(_scopeData),
        scopeDataCorrectionFactors: structuredClone(_scopeDataCorrectionFactors),
        spectrumImageOverlaySettings: structuredClone(_spectrumImageOverlaySettings),
    }

    var snapshots = JSON.parse(localStorage.getItem(LOCALSTORAGE_PREFIX + ":snapshots") || "[]")

    snapshots.push(snapshot)

    localStorage.setItem(LOCALSTORAGE_PREFIX + ":snapshots", JSON.stringify(snapshots))

    storageUpdateSnapshotList()
}

function storageLoadSnapshot(index)
{
    var snapshot = _snapshots[index]

    _settings = structuredClone(snapshot['settings'])
    _calibrationSettings = structuredClone(snapshot['calibrationSettings'])
    _inspectSettings = structuredClone(snapshot['inspectSettings'])
    _scopeSettings = structuredClone(snapshot['scopeSettings'])
    _pixelValues = structuredClone(snapshot['pixelValues'])
    _scopeData = structuredClone(snapshot['scopeData'])
    _scopeDataCorrectionFactors = structuredClone(snapshot['scopeDataCorrectionFactors'])
    _spectrumImageOverlaySettings = structuredClone(snapshot['spectrumImageOverlaySettings'])

    updateAfterSnapshotWasLoaded()
}

function storageUpdateSnapshotList()
{
    var container = document.getElementById("snapshot_list")

    container.innerHTML = ""

    _snapshots = JSON.parse(localStorage.getItem(LOCALSTORAGE_PREFIX + ":snapshots") || "[]")

    var s

    for (var i=0; i<_snapshots.length; i++)
    {
        s = "<div>" + _snapshots[i].title + " <a href=\"#\" onclick=\"storageLoadSnapshot(" + i + "); return false;\">Load</a><br/>\n"

        container.innerHTML += s
    }

    if (_snapshots.length == 0)
    {
        container.innerHTML += "(No snapshots saved yet.)"
    }
}

function storageInit()
{
    storageUpdateSnapshotList()
}
