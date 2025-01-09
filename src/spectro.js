"use strict";

/** How many samples should be taken from the source image for the spectral data */
const SAMPLE_COUNT = 2000

var _settings = {
    rotation: 0,
    padX: 0,
    padY: 0,
    scale: 1.0,
}

/** The source object to get the image from */
var _source = null

var _pixelValues = []
var _imageCanvas
var _imageCtx
var _scopeCanvas
var _scopeCtx
var _p = 0.2 // width of the window, in virtual coordinate unit

/** Update the settings based on the user supplied values on the Setup page */
function updateSettings()
{
    _settings.rotation = parseFloat(document.getElementById('setting_rotation').value) * Math.PI * 2
    _settings.padX = parseFloat(document.getElementById('setting_pad_x').value)
    _settings.padY = parseFloat(document.getElementById('setting_pad_y').value)
    _settings.scale = parseFloat(document.getElementById('setting_scale').value)
}

/** Render the preview with the overlays, gather the data, process it and then display it */
function spectroRenderAndProcess()
{
    if (!isSourceValid())
    {
        return
    }

    _imageCtx.drawImage(_cameraVideo, 0, 0)

    updateImageProperties()
    extractImageData()
    drawOverlay()
    drawScope()
}

/** Set the source for processing */
function setSource(source)
{
    _source = source
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
    _imageCanvas = document.getElementById('canvas1')
    _imageCtx = _imageCanvas.getContext('2d')

    _scopeCanvas = document.getElementById('canvas2')
    _scopeCanvas.width = 2000
    _scopeCanvas.height = 300
    _scopeCtx = _scopeCanvas.getContext('2d')

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
    ctx.lineWidth = width * (_imgScale / 1000)
    ctx.strokeStyle = color
    ctx.stroke()
}

/** Update the parameters of the canvas based on the source */
function updateCanvasProperties()
{
    _imageCanvas.width = _cameraVideo.videoWidth
    _imageCanvas.height = _cameraVideo.videoHeight
}

/** Update the variables needed for coordinate projection */
function updateImageProperties()
{
    if (_imageCanvas.width != _source.videoWidth || _imageCanvas.height != _source.videoHeight)
    {
        _imageCanvas.width = _source.videoWidth
        _imageCanvas.height = _source.videoHeight
    }

    _imgCenterX = _imageCanvas.width / 2
    _imgCenterY = _imageCanvas.height / 2
    _imgScale = _imageCanvas.width
}

/** Do the extraction of the spectral data from the image */
function extractImageData()
{
    _p = 0.2 * _settings.scale

    var p1 = projectCoords(-_p, 0)
    var p2 = projectCoords(_p, 0)
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

/** Draw the overlay over the processed image */
function drawOverlay()
{
    // NOTE: this overlay is being drawn directly on the image we processed

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
    _imageCtx.moveTo(...projectCoords(-_p, 0))
    _imageCtx.lineTo(...projectCoords(_p, 0))
    ctxStroke(_imageCtx, 10, "#000", [])
    ctxStroke(_imageCtx, 5, "#fff", [])

    // blue marker on the left end
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(- _p, 0))
    _imageCtx.lineTo(...projectCoords(- _p - 0.03, -0.03))
    _imageCtx.lineTo(...projectCoords(- _p - 0.03, +0.03))
    _imageCtx.closePath()
    _imageCtx.strokeStyle = "#00f"
    _imageCtx.fillStyle = "#00a"
    _imageCtx.fill()
    _imageCtx.stroke()
    
    // red marker on the right end
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(_p, 0))
    _imageCtx.lineTo(...projectCoords(_p + 0.03, -0.03))
    _imageCtx.lineTo(...projectCoords(_p + 0.03, +0.03))
    _imageCtx.closePath()
    _imageCtx.strokeStyle = "#f00"
    _imageCtx.fillStyle = "#a00"
    _imageCtx.fill()
    _imageCtx.stroke()

/*
    // blue marker on the left end
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(-_p, -0.03))
    _imageCtx.lineTo(...projectCoords(-_p, -0.05))
    _imageCtx.closePath()
    ctxStroke(_imageCtx, 20, "#000", [])
    ctxStroke(_imageCtx, 10, "#00f", [])
    
    // red marker on the right end
    _imageCtx.beginPath()
    _imageCtx.moveTo(...projectCoords(_p, -0.03))
    _imageCtx.lineTo(...projectCoords(_p, -0.05))
    _imageCtx.closePath()
    ctxStroke(_imageCtx, 20, "#000", [])
    ctxStroke(_imageCtx, 10, "#f00", [])
*/
}

/** Draw the updated scope */
function drawScope()
{
    _scopeCtx.lineWidth = 2
    
    _scopeCtx.fillStyle = "#0001"
    _scopeCtx.fillRect(0, 0, 2000, 300)

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, 300)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, 300 - _pixelValues[i][0])
    }
    _scopeCtx.strokeStyle = "#a00"
    _scopeCtx.stroke()

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, 300)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, 300 - _pixelValues[i][1])
    }
    _scopeCtx.strokeStyle = "#0a0"
    _scopeCtx.stroke()

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, 300)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, 300 - _pixelValues[i][2])
    }
    _scopeCtx.strokeStyle = "#00a"
    _scopeCtx.stroke()

    _scopeCtx.beginPath()
    _scopeCtx.moveTo(0, 300)
    for (var i=0; i<SAMPLE_COUNT; i++)
    {
        _scopeCtx.lineTo(i, 300 - (_pixelValues[i][0] + _pixelValues[i][1] + _pixelValues[i][2]) / 3)
    }
    _scopeCtx.strokeStyle = "#eee"
    _scopeCtx.stroke()
}
