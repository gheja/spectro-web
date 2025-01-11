"use strict";

/** An object to bind the camera input to */
var _cameraVideo;

/** Switch a div with multiple screens */
function switchPage(baseDomId, childDomId)
{
    document.getElementById(baseDomId).childNodes.forEach((child) => {
        if (child instanceof HTMLDivElement)
        {
            child.style.display = (child.id == childDomId ? "block" : "none")
        }
    })
}

/** Display an error to the user, not too elegant but works */
function reportError(s)
{
    window.alert(s)
}

/** Release all source objects and return to the source selection screen */
function resetSource()
{
    stopCamera()
    switchPage("source-pages", "source-list")
}

var _prepareCameraAccessRan = false;

/** Do a dummy access to the first camera. It is needed to populate the device list */
async function prepareCameraAccess()
{

    if (_prepareCameraAccessRan)
    {
        return
    }

    _prepareCameraAccessRan = true

    var stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: "" }})

    stream?.getTracks().forEach(track => track.stop())
}

/** Detect and list all the available cameras */
async function listCameras()
{
    var select = document.getElementById("camera-list")

    await prepareCameraAccess()

    var a
    while (a = select.firstChild)
    {
        a.parentNode.removeChild(a)
    }

    var option = document.createElement("option")
    option.value = "none"
    option.text = "Select a camera..."
    select.appendChild(option)

    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia))
    {
        reportError("Could not find media devices. Access denied?");
    }

    var devices = await navigator.mediaDevices.enumerateDevices()

    for (var device of devices)
    {
        if (device.kind != "videoinput")
        {
            continue
        }

        var option = document.createElement("option")
        option.value = device.id || device.deviceId
        option.text = device.label || "camera " + option.value
        select.appendChild(option)
    }

    switchPage("source-pages", "source-cameras")
}

/** Close the current camera and start using the one picked from the selector */
async function selectCamera()
{
    var deviceId = document.getElementById("camera-list").value

    stopCamera()
    if (deviceId != 'none')
    {
        startCamera(deviceId)
    }
}

/** Close the current camera and all its streams, return to the camera listing screen */
async function stopCamera()
{
    // thx https://www.geeksforgeeks.org/how-to-integrate-webcam-using-javascript-on-html5/

    const stream = _cameraVideo.srcObject
    stream?.getTracks().forEach(track => track.stop())
    _cameraVideo.srcObject = null
    setSource(null)
    switchPage("source-pages", "source-cameras")
}

/** Open the camera and switch to the main source screen */
async function startCamera(deviceId)
{
    navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId, width: 1920 }})
    .then((stream) => {
        _cameraVideo.srcObject = stream;
        _cameraVideo.play();
        setSource(_cameraVideo)

        switchPage("source-pages", "source-main")
    })
    .catch((error) => {
        reportError("Error accessing the camera: " + error);
    });
}

/** Populate the "Reference spectrum" list on the Calibration page */
function referenceInit()
{
    var select = document.getElementById("calibration_reference")

    for (var i=0; i<REFERENCE_SPECTRUMS.length; i++)
    {
        var option = document.createElement("option")
        option.value = i
        option.innerHTML = REFERENCE_SPECTRUMS[i].name

        select.appendChild(option)
    }
}

/** Initialize all the required stuffs */
function init()
{
    _cameraVideo = document.createElement("video")
    switchPage("source-pages", "source-list")
    referenceInit()
    spectroInit()
}

window.addEventListener("load", init)
