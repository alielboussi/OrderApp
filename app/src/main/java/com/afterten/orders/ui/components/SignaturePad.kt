package com.afterten.orders.ui.components

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas

class SignatureState {
    private val path = Path()
    private val paint = Paint().apply {
        style = Paint.Style.STROKE
        color = Color.WHITE
        strokeWidth = 6f
        isAntiAlias = true
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    fun clear() { path.reset() }
    fun drawOn(canvas: Canvas) { canvas.drawPath(path, paint) }
    fun addPoint(x: Float, y: Float, down: Boolean) {
        if (down) path.moveTo(x, y) else path.lineTo(x, y)
    }
    fun toBitmap(width: Int, height: Int): Bitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.TRANSPARENT)
        drawOn(c)
        return bmp
    }
}

@Composable
fun rememberSignatureState(): SignatureState = remember { SignatureState() }

@Composable
fun SignaturePad(modifier: Modifier = Modifier, state: SignatureState = rememberSignatureState()) {
    val density = LocalDensity.current
    Box(
        modifier = modifier
            .background(androidx.compose.ui.graphics.Color.Transparent)
            .pointerInput(Unit) {
                detectDragGestures(onDragStart = { offset ->
                    state.addPoint(offset.x, offset.y, down = true)
                }) { change, _ ->
                    state.addPoint(change.position.x, change.position.y, down = false)
                }
            }
    ) {
        Canvas(modifier = Modifier.fillMaxWidth().height(180.dp)) {
            drawIntoCanvas { androidCanvas ->
                state.drawOn(androidCanvas.nativeCanvas)
            }
        }
    }
}
