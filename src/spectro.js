"use strict";

const SCOPE_WIDTH = 1920
const SCOPE_HEIGHT = 300 // changing would need to adjust for sample height when displaying the scope

/** How many samples should be taken from the source image for the spectral data.
 *  This needs to match the scope width for now as scope rendering does not scale the data. */
const SAMPLE_COUNT = SCOPE_WIDTH

// how often the auto peak detection should update (in ms)
const AUTO_PEAK_INTERVAL_MS = 500

// minimum distance between auto peak detected markers (in samples)
const AUTO_PEAK_GAP_SAMPLES = 80

var _settings = {
    p: 0.2, // width of the window, in virtual coordinate unit (fixed)
    rotation: 0,
    padX: 0,
    padY: 0,
    scale: 1.0,
    valueConversionMethod: 1,
    smoothing: 0.0,
}

var _calibrationSettings = {
    padX: 0,
    scale: 1.0,
}

var _inspectSettings = {
    padX: 0,
    scale: 1.0,
}

// the scope is tuned the visible spectrum by default
var _scopeSettings = {
    middle: 565,
    width: 370,
}

// the image that contains the visible spectrum, 380-750 nm
var _spectrumImageOverlaySettings = {
    url: './visible_spectrum.png',
    middle: 565,
    width: 370,
}

/** The source object to get the image from */
var _source = null
var _sourcePaused = false

var _pixelValues = []
var _scopeData = []
var _referenceScopeData = []
// a buffer to hold the latest frame from the source
var _bufferCanvas
var _bufferCtx
// the preview
var _imageCanvas
var _imageCtx
// the main scope
var _scopeCanvas
var _scopeCtx
var _scopeMode

// the correction factor for ...
var _scopeDataCorrectionFactors = []

// markers for automatically detected peaks and the time of last update
var _autoPeakMarkers = []
var _autoPeakTimestamp = 0

// the DOM object storing the image
var _spectrumImageImg

function setScopeMode(newScopeMode)
{
    if (_scopeMode != newScopeMode)
    {
        // TODO: show message about new mode
        _scopeMode = newScopeMode
    }
}

/** Update the settings based on the user supplied values on the Setup page */
function updateSettings(newScopeMode)
{
    setScopeMode(newScopeMode)

    _settings.rotation = parseFloat(document.getElementById('setting_rotation').value) * Math.PI * 2
    _settings.padX = parseFloat(document.getElementById('setting_pad_x').value)
    _settings.padY = parseFloat(document.getElementById('setting_pad_y').value)
    _settings.scale = parseFloat(document.getElementById('setting_scale').value)
    _settings.valueConversionMethod = parseInt(document.getElementById('setting_value_conversion').value)
    _settings.smoothing = parseFloat(document.getElementById('setting_smoothing').value)

    // calibration stuffs
    _calibrationSettings.padX = parseFloat(document.getElementById('calibration_slide').value)
    _calibrationSettings.scale = parseFloat(document.getElementById('calibration_scale').value)

    var a = document.getElementById("calibration_reference").value
    if (a == "none")
    {
        _referenceScopeData = []
    }
    else
    {
        _referenceScopeData = normalize(REFERENCE_SPECTRUMS[a].values)
    }

    // inspect stuffs
    _inspectSettings.padX = parseFloat(document.getElementById('inspect_slide').value)
    _inspectSettings.scale = parseFloat(document.getElementById('inspect_scale').value)
}

/** Render the preview with the overlays, gather the data, process it and then display it */
function spectroRenderAndProcess()
{
    if (!isSourceValid())
    {
        return
    }

    if (!_sourcePaused)
    {
        _bufferCtx.globalAlpha = 1.0 - _settings.smoothing
        _bufferCtx.drawImage(_cameraVideo, 0, 0)
        _bufferCtx.globalAlpha = 1.0
        updateImageProperties()
    }

    _imageCtx.drawImage(_bufferCanvas, 0, 0)
    updateImageProperties()

    extractImageData()
    processData()
    autoDetectPeaks()
    drawOverlay()
    drawScope()
}

/** Set the source for processing */
function setSource(source)
{
    _source = source

    // start the source processing when switching
    if (_sourcePaused)
    {
        togglePause()
    }

    updateSettings(1)
}

function togglePause()
{
    _sourcePaused = ! _sourcePaused

    document.getElementById("source-pause-button").innerHTML = _sourcePaused ? "Resume" : "Pause"
}

/** Checks if source is valid, can be used to skip processing if not */
function isSourceValid()
{
    if (_source == null)
    {
        return false
    }

    if (_source instanceof HTMLVideoElement)
    {
        if (_cameraVideo.readyState < 2 ||  _cameraVideo.videoWidth == 0 || _cameraVideo.videoHeight == 0)
        {
            return false
        }

        return true
    }

    return false
}

/** Run the rendering and request calling this again on the next frame */
function spectroFrame()
{
    spectroRenderAndProcess()
    window.requestAnimationFrame(spectroFrame)
}

/** Initialize everything and start the rendering */
function spectroInit()
{
    _bufferCanvas = document.createElement('canvas')
    _bufferCtx = _bufferCanvas.getContext('2d')

    _imageCanvas = document.getElementById('canvas1')
    _imageCtx = _imageCanvas.getContext('2d')

    _scopeCanvas = document.getElementById('canvas2')
    _scopeCanvas.width = SCOPE_WIDTH
    _scopeCanvas.height = SCOPE_HEIGHT
    _scopeCtx = _scopeCanvas.getContext('2d')

    // load the image in async, check later
    _spectrumImageImg = document.createElement("img")
    _spectrumImageImg.src = _spectrumImageOverlaySettings.url
    
    setCorrectionFactors(0.0)
    setScopeMode(1)

    window.requestAnimationFrame(spectroFrame)
}


// these are needed for calculating the projection for the overlay
var _imgCenterX = 0
var _imgCenterY = 0
var _imgScale = 0

/** Project the virtual [-1.0 .. 1.0], [-1.0 .. 1.0] coordinates to canvas coordinates */
function projectCoords(x, y)
{
    return [
        _imgCenterX + ((x * Math.cos(_settings.rotation) - y * Math.sin(_settings.rotation)) + _settings.padX) * _imgScale,
        _imgCenterY + ((x * Math.sin(_settings.rotation) + y * Math.cos(_settings.rotation)) + _settings.padY) * _imgScale,
    ]
}

/**
 * Draw a stroke on `ctx` with the given parameters.
 * 
 * @param {CanvasRenderingContext2D} ctx 
 * @param {number} width 
 * @param {color} color 
 * @param {Array[number]} pattern 
 */
function ctxStroke(ctx, width, color, pattern)
{
    ctx.setLineDash(pattern)
    ctx.lineWidth = width * (_imgScale / (SCOPE_WIDTH/2))
    ctx.strokeStyle = color
    ctx.stroke()
}

/** Update the variables needed for coordinate projection */
function updateImageProperties()
{
    if (_bufferCanvas.width != _source.videoWidth || _bufferCanvas.height != _source.videoHeight)
    {
        _bufferCanvas.width = _source.videoWidth
        _bufferCanvas.height = _source.videoHeight
    }

    if (_imageCanvas.width != _bufferCanvas.width || _imageCanvas.height != _bufferCanvas.height)
    {
        _imageCanvas.width = _bufferCanvas.width
        _imageCanvas.height = _bufferCanvas.height
    }

    _imgCenterX = _imageCanvas.width / 2
    _imgCenterY = _imageCanvas.height / 2
    _imgScale = _imageCanvas.width
}

/** Do the extraction of the spectral data from the image */
function extractImageData()
{
    _settings.p = 0.2 * _settings.scale

    var p1 = projectCoords(-_settings.p, 0)
    var p2 = projectCoords(_settings.p, 0)
    var px, py, a

    var data = _imageCtx.getImageData(0, 0, _imageCanvas.width, _imageCanvas.height)

    _pixelValues = []

    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        px = Math.round(p1[0] + (p2[0] - p1[0]) * (i / SAMPLE_COUNT))
        py = Math.round(p1[1] + (p2[1] - p1[1]) * (i / SAMPLE_COUNT))
        a = (py * _imageCanvas.width + px) * 4
        _pixelValues.push([
            data.data[a + 0],
            data.data[a + 1],
            data.data[a + 2],
        ])
    }
}

function normalize(arr)
{
    var min = arr[0]
    var max = arr[0]
    var result = []

    for (var i=0; i<arr.length; i++)
    {
        if (arr[i] < min)
        {
            min = arr[i]
        }
        else if (arr[i] > max)
        {
            max = arr[i]
        }
    }

    if (min == 0)
    {
        min = 0.0001
    }

    var r = max - min

    if (r == 0)
    {
        r = 0.0001
    }

    for (var i=0; i<arr.length; i++)
    {
        result.push((arr[i] - min) / r)
    }

    return result
}

// WIP, don't use
function setCorrectionFactors(n)
{
    var on = (n != 0.0)

    document.getElementById('correction-on-button').disabled = (on ? 'disabled' : '')
    document.getElementById('correction-off-button').disabled = (on ? '' : 'disabled')

    _scopeDataCorrectionFactors = []

    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeDataCorrectionFactors.push(1.0)
    }

    if (n == 0.0)
    {
        return
    }

    var a, b, c

    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        b = (0.5 + _referenceScopeData[i])
        c = (0.5 + Math.max(_scopeData[i], 0.15))
        a = b / c

        if (a > 100.0)
        {
            // console.log(a, b, c)
        }
        _scopeDataCorrectionFactors[i] = a
    }

    // console.log(_scopeDataCorrectionFactors)
}

function processData()
{
    var a = []
    var b
    var c

    if (_settings.valueConversionMethod == 1)
    {
        // RGB average
        for (var i=0; i<SAMPLE_COUNT; i++)
        {
            a.push(_pixelValues[i][0] + _pixelValues[i][1] + _pixelValues[i][2])
        }
    }
    else if (_settings.valueConversionMethod == 2)
    {
        // Photometric/digital ITU BT.709
        for (var i=0; i<SAMPLE_COUNT; i++)
        {
            a.push(_pixelValues[i][0] * 0.2126 + _pixelValues[i][1] * 0.7152 + _pixelValues[i][2] * 0.0722)
        }
    }
    else if (_settings.valueConversionMethod == 3)
    {
        // Digital ITU BT.601
        for (var i=0; i<SAMPLE_COUNT; i++)
        {
            a.push(_pixelValues[i][0] * 0.299 + _pixelValues[i][1] * 0.587 + _pixelValues[i][2] * 0.114)
        }
    }
    else if (_settings.valueConversionMethod == 4)
    {
        // HSL, Luminance
        for (var i=0; i<SAMPLE_COUNT; i++)
        {
            a.push(
                Math.min(_pixelValues[i][0], _pixelValues[i][1], _pixelValues[i][2]) +
                Math.max(_pixelValues[i][0], _pixelValues[i][1], _pixelValues[i][2])
            )
        }
    }
    else if (_settings.valueConversionMethod == 5)
    {
        // HSV, Value
        for (var i=0; i<SAMPLE_COUNT; i++)
        {
            a.push(Math.max(_pixelValues[i][0], _pixelValues[i][1], _pixelValues[i][2]))
        }
    }

    // adjust for calibration settings
    if (_scopeMode > 1)
    {
        var j
        for (var i=0; i<SAMPLE_COUNT; i++)
        {
            // calculate the correct position
            j = (i - SAMPLE_COUNT/2) / _calibrationSettings.scale + SAMPLE_COUNT/2
            j = j - _calibrationSettings.padX
            j = Math.round(j)

            // filter invalid data points
            if (j >= 0 && j < SCOPE_WIDTH)
            {
                _scopeData[i] = a[j]
            }
            else
            {
                _scopeData[i] = 0
            }

            _scopeData[i] *= _scopeDataCorrectionFactors[i]
        }
    }
    else
    {
        _scopeData = a
    }

    _scopeData = normalize(_scopeData)
}

function autoDetectPeaks()
{
    var highestPointValue
    var highestPointX
    var _scopeCopy

    var now = performance.now()

    // do not run update the markers too often
    if (_autoPeakTimestamp + AUTO_PEAK_INTERVAL_MS > now)
    {
        return
    }

    _autoPeakTimestamp = now
    _autoPeakMarkers = []

    // create a copy that can be modified safely
    _scopeCopy = _scopeData.slice()
    var j

    for (var i=0; i<5; i++)
    {
        highestPointValue = 0
        highestPointX = 0

        for (var x=0; x<SAMPLE_COUNT; x++)
        {
            // adjust for inspect position
            j = (x - SAMPLE_COUNT/2) / _inspectSettings.scale + SAMPLE_COUNT/2
            j = j - _inspectSettings.padX
            j = Math.round(j)

            if (highestPointValue < _scopeCopy[j])
            {
                highestPointValue = _scopeCopy[j]
                highestPointX = x
            }
        }

        _autoPeakMarkers.push(Math.round(samplePosToWavelength(highestPointX)))

        // clear a region in the data to not place markers too close to each other
        for (var x=Math.max(0, highestPointX - AUTO_PEAK_GAP_SAMPLES); x < Math.min(SAMPLE_COUNT, highestPointX + AUTO_PEAK_GAP_SAMPLES); x++)
        {
            // adjust for inspect position
            j = (x - SAMPLE_COUNT/2) / _inspectSettings.scale + SAMPLE_COUNT/2
            j = j - _inspectSettings.padX
            j = Math.round(j)
            
            _scopeCopy[j] = 0
        }
    }
}

/** Draw the overlay over the processed image */
function drawOverlay()
{
    // NOTE: this overlay is being drawn directly on the image we processed, so
    // no further sampling can be done. although this image is copied from the
    // buffer, so that is still available

    _imageCtx.lineCap = "round"
    _imageCtx.lineJoin = "round"
    
    // middle line, upper
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(0.0, -0.03))
    _imageCtx.lineTo(...projectCoords(0.0, -0.05))
    _imageCtx.lineWidth = 10 * (_imgScale / 1000)
    _imageCtx.strokeStyle = "#000"
    _imageCtx.stroke()
    _imageCtx.lineWidth = 5 * (_imgScale / 1000)
    _imageCtx.strokeStyle = "#fff"
    _imageCtx.stroke()
    
    // middle line, lower
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(0.0, +0.03))
    _imageCtx.lineTo(...projectCoords(0.0, +0.05))
    ctxStroke(_imageCtx, 10, "#000", [])
    ctxStroke(_imageCtx, 5, "#fff", [])
    
    // vertical line
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(- _settings.p, 0))
    _imageCtx.lineTo(...projectCoords(_settings.p, 0))
    ctxStroke(_imageCtx, 10, "#000", [])
    ctxStroke(_imageCtx, 5, "#fff", [])

    // blue marker on the left end
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(- _settings.p, 0))
    _imageCtx.lineTo(...projectCoords(- _settings.p - 0.03, -0.03))
    _imageCtx.lineTo(...projectCoords(- _settings.p - 0.03, +0.03))
    _imageCtx.closePath()
    _imageCtx.strokeStyle = "#00f"
    _imageCtx.fillStyle = "#00a"
    _imageCtx.fill()
    _imageCtx.stroke()
    
    // red marker on the right end
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(_settings.p, 0))
    _imageCtx.lineTo(...projectCoords(_settings.p + 0.03, -0.03))
    _imageCtx.lineTo(...projectCoords(_settings.p + 0.03, +0.03))
    _imageCtx.closePath()
    _imageCtx.strokeStyle = "#f00"
    _imageCtx.fillStyle = "#a00"
    _imageCtx.fill()
    _imageCtx.stroke()

/*
    // blue marker on the left end
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(- _settings.p, -0.03))
    _imageCtx.lineTo(...projectCoords(- _settings.p, -0.05))
    _imageCtx.closePath()
    ctxStroke(_imageCtx, 20, "#000", [])
    ctxStroke(_imageCtx, 10, "#00f", [])
    
    // red marker on the right end
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(_settings.p, -0.03))
    _imageCtx.lineTo(...projectCoords(_settings.p, -0.05))
    _imageCtx.closePath()
    ctxStroke(_imageCtx, 20, "#000", [])
    ctxStroke(_imageCtx, 10, "#f00", [])
*/
}

function samplePosToWavelength(position)
{
    return _scopeSettings.middle + (((position - SCOPE_WIDTH/2) / _inspectSettings.scale - _inspectSettings.padX) / SCOPE_WIDTH) * _scopeSettings.width
}

function wavelengthToSamplePos(wavelength)
{
    return (((wavelength - _scopeSettings.middle) / _scopeSettings.width) * SCOPE_WIDTH + _inspectSettings.padX) * _inspectSettings.scale + SCOPE_WIDTH/2
}

/** Draw a marker at a position on the scope, displaying the wavelength above it, aligned to left/center/right */
function drawWavelengthMarker(wavelength)
{
    var position = wavelengthToSamplePos(wavelength)
    var align

    if (position < 100)
    {
        align = "left"
    }
    else if (position > SCOPE_WIDTH - 100)
    {
        align = "right"
    }
    else
    {
        align = "center"
    }

    _scopeCtx.font = "24px Arial"
    _scopeCtx.fillStyle = "#fff"
    _scopeCtx.textAlign = align
    _scopeCtx.fillText(wavelength, position, 36)
    _scopeCtx.textAlign = "start"

    _scopeCtx.lineWidth = 3
    _scopeCtx.strokeStyle = "#fff6"
    _scopeCtx.beginPath()
    _scopeCtx.moveTo(position, 42)
    _scopeCtx.lineTo(position, SCOPE_HEIGHT)
    _scopeCtx.stroke()
}

function drawAllWavelengthMarkers()
{
    drawWavelengthMarker(380)
    drawWavelengthMarker(750)
    
    for (var pos of _autoPeakMarkers)
    {
        drawWavelengthMarker(pos)
    }
}

/** Draw the updated scope */
function drawScope()
{
    if (_scopeMode == 1)
    {
        drawScopeV1()
    }
    else if (_scopeMode == 2)
    {
        drawScopeV2()
    }
    else if (_scopeMode == 3)
    {
        drawScopeV3()
    }
}

/** Draw the basic RGB scope */
function drawScopeV1()
{
    _scopeCtx.lineWidth = 2
    
    _scopeCtx.fillStyle = "#000"
    _scopeCtx.fillRect(0, 0, SCOPE_WIDTH, SCOPE_HEIGHT)

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, SCOPE_HEIGHT)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, SCOPE_HEIGHT - _pixelValues[i][0])
    }
    _scopeCtx.strokeStyle = "#a00"
    _scopeCtx.stroke()

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, SCOPE_HEIGHT)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, SCOPE_HEIGHT - _pixelValues[i][1])
    }
    _scopeCtx.strokeStyle = "#0a0"
    _scopeCtx.stroke()

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, SCOPE_HEIGHT)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, SCOPE_HEIGHT - _pixelValues[i][2])
    }
    _scopeCtx.strokeStyle = "#00a"
    _scopeCtx.stroke()

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, SCOPE_HEIGHT)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, SCOPE_HEIGHT - _scopeData[i] * 255)
    }
    _scopeCtx.strokeStyle = "#eee"
    _scopeCtx.stroke()
}

/** Draw the calibration scope */
function drawScopeV2()
{
    _scopeCtx.fillStyle = "#323"
    _scopeCtx.fillRect(0, 0, SCOPE_WIDTH, SCOPE_HEIGHT)

    if (_referenceScopeData.length > 0)
    {
        _scopeCtx.beginPath()
        _scopeCtx.moveTo(0, SCOPE_HEIGHT)
        for (var i=0; i<SAMPLE_COUNT; i++)
        {
            _scopeCtx.lineTo(i, SCOPE_HEIGHT - _referenceScopeData[i] * 255)
        }

        _scopeCtx.lineTo(SCOPE_WIDTH, SCOPE_HEIGHT)

        // clip the image to the reference spectrum
        _scopeCtx.save()
        _scopeCtx.clip()
        if (_spectrumImageImg.complete)
        {
            _scopeCtx.drawImage(_spectrumImageImg, 0, 0, _spectrumImageImg.width, _spectrumImageImg.height, 0, 0, SCOPE_WIDTH, SCOPE_HEIGHT)
        }
        _scopeCtx.restore()

        // draw the reference spectrum
        _scopeCtx.strokeStyle = "#000"
        _scopeCtx.lineWidth = 4
        _scopeCtx.stroke()
    }

    // draw the spectrum
    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, SCOPE_HEIGHT)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, SCOPE_HEIGHT - _scopeData[i] * 255)
    }

    _scopeCtx.strokeStyle = "#eee"
    _scopeCtx.lineWidth = 2
    _scopeCtx.stroke()

    drawAllWavelengthMarkers()
}

/** Draw the final scope */
function drawScopeV3()
{
    _scopeCtx.fillStyle = "#222"
    _scopeCtx.fillRect(0, 0, SCOPE_WIDTH, SCOPE_HEIGHT)

    _scopeCtx.lineWidth = 2

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, SCOPE_HEIGHT)
    var j
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        // adjust for inspect position
        j = (i - SAMPLE_COUNT/2) / _inspectSettings.scale + SAMPLE_COUNT/2
        j = j - _inspectSettings.padX
        j = Math.round(j)

        _scopeCtx.lineTo(i, SCOPE_HEIGHT - _scopeData[j] * 255)
    }

    _scopeCtx.lineTo(SCOPE_WIDTH, SCOPE_HEIGHT)

    var imgLeft = Math.round(wavelengthToSamplePos(_spectrumImageOverlaySettings.middle - _spectrumImageOverlaySettings.width / 2))
    var imgWidth = SCOPE_WIDTH * _inspectSettings.scale

    // clip the image to the spectrum
    _scopeCtx.save()
    _scopeCtx.clip()
    _scopeCtx.fillStyle = "#000"
    _scopeCtx.fillRect(0, 0, SCOPE_WIDTH, SCOPE_HEIGHT)
    if (_spectrumImageImg.complete)
    {
        _scopeCtx.drawImage(_spectrumImageImg, 0, 0, _spectrumImageImg.width, _spectrumImageImg.height, imgLeft, 0, imgWidth, SCOPE_HEIGHT)
    }
    _scopeCtx.restore()

    // draw the spectrum
    _scopeCtx.strokeStyle = "#fff"
    _scopeCtx.lineWidth = 2
    _scopeCtx.stroke()

    drawAllWavelengthMarkers()
}
