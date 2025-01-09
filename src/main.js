"use strict";

var _cameraVideo;

function switchPage(baseDomId, childDomId)
{
    document.getElementById(baseDomId).childNodes.forEach((child) => {
        if (child instanceof HTMLDivElement)
        {
            child.style.display = (child.id == childDomId ? "block" : "none")
        }
    })
}

function handleCameraError()
{
    window.alert("denied?");
}

function resetSource()
{
    stopCamera()
    switchPage("source-pages", "source-list")
}

async function listCameras()
{
    var select = document.getElementById("camera-list")

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
        document.getElementById("prview-x").innerHTML = "Access denied?";
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

async function selectCamera()
{
    var deviceId = document.getElementById("camera-list").value

    stopCamera()
    if (deviceId != 'none')
    {
        startCamera(deviceId)
    }
}

async function stopCamera()
{
    // thx https://www.geeksforgeeks.org/how-to-integrate-webcam-using-javascript-on-html5/

    const stream = _cameraVideo.srcObject;
    stream?.getTracks().forEach(track => track.stop());
    _cameraVideo.srcObject = null;
    switchPage("source-pages", "source-cameras")
}

async function startCamera(deviceId)
{
    navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId }})
    .then((stream) => {
        _cameraVideo.srcObject = stream;
        _cameraVideo.play();

        switchPage("source-pages", "source-main")
    })
    .catch((error) => {
        console.error("Error accessing the camera: ", error);
    });
}

function init()
{
    _cameraVideo = document.createElement("video")
    switchPage("source-pages", "source-list")
}

window.addEventListener("load", init)
