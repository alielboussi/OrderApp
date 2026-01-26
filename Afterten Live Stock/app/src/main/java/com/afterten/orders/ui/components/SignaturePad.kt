package com.afterten.orders.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.core.graphics.createBitmap

class SignatureState {
    private val path = Path()
    private var lastX: Float? = null
    private var lastY: Float? = null
    private var _distance: Float = 0f
    // Tick to trigger Canvas redraws immediately on new points
    var version by mutableLongStateOf(0L)
    private val paint = Paint().apply {
        style = Paint.Style.STROKE
        // White looks good on dark UI backgrounds, but is invisible on a white PDF.
        // We'll keep the UI stroke white and allow color override when exporting.
        color = Color.WHITE
        strokeWidth = 6f
        isAntiAlias = true
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    fun clear() { path.reset(); lastX = null; lastY = null; _distance = 0f; version++ }
    fun drawOn(canvas: Canvas) { canvas.drawPath(path, paint) }
    fun addPoint(x: Float, y: Float, down: Boolean) {
        if (down) {
            path.moveTo(x, y)
            lastX = x; lastY = y
        } else {
            path.lineTo(x, y)
            val lx = lastX; val ly = lastY
            if (lx != null && ly != null) {
                _distance += kotlin.math.hypot((x - lx).toDouble(), (y - ly).toDouble()).toFloat()
            }
            lastX = x; lastY = y
        }
        version++
    }
    fun toBitmap(width: Int, height: Int, colorOverride: Int? = null): Bitmap {
        val bmp = createBitmap(width, height)
        val c = Canvas(bmp)
        c.drawColor(Color.TRANSPARENT)
        if (colorOverride != null) {
            val p = Paint(paint)
            p.color = colorOverride
            c.drawPath(path, p)
        } else {
            drawOn(c)
        }
        return bmp
    }
    fun isMeaningful(minDistancePx: Float = 60f): Boolean = _distance >= minDistancePx
}

@Composable
fun rememberSignatureState(): SignatureState = remember { SignatureState() }

@Composable
fun SignaturePad(modifier: Modifier = Modifier, state: SignatureState = rememberSignatureState()) {
    val density = LocalDensity.current
    Box(
        modifier = modifier
            .background(androidx.compose.ui.graphics.Color.Transparent)
            // High-frequency pointer pipeline that consumes events early to avoid parent scroll interception
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    // Consume immediately so verticalScroll won't steal the gesture
                    // Consume initial down so parent scroll doesn't intercept
                    down.consume()
                    state.addPoint(down.position.x, down.position.y, down = true)
                    var pointer = down.id
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull { it.id == pointer } ?: continue
                        state.addPoint(change.position.x, change.position.y, down = false)
                        change.consume()
                        if (!change.pressed || change.changedToUp()) break
                    }
                }
            }
    ) {
        // Read the version to trigger redraws on new points without recomposition cost
        val versionTick = state.version
        Canvas(modifier = Modifier.fillMaxWidth().height(180.dp)) {
            drawIntoCanvas { androidCanvas ->
                state.drawOn(androidCanvas.nativeCanvas)
            }
        }
    }
}
