package com.afterten.orders.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import androidx.work.Constraints
import androidx.work.NetworkType
import com.afterten.orders.db.AppDatabase
import com.afterten.orders.data.SupabaseProvider
import com.afterten.orders.data.SessionStore
import com.afterten.orders.data.relaxedJson
import kotlinx.serialization.builtins.ListSerializer
import com.afterten.orders.data.SupabaseProvider.PlaceOrderItem

class OrderSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val db = AppDatabase.get(applicationContext)
        val dao = db.pendingOrderDao()
        val provider = SupabaseProvider(applicationContext)
        val due = dao.due(System.currentTimeMillis())
        if (due.isEmpty()) return Result.success()
        val json = relaxedJson

        for (p in due) {
            try {
                val items: List<PlaceOrderItem> = json.decodeFromString(
                    ListSerializer(PlaceOrderItem.serializer()), p.itemsJson
                )
                val session = SessionStore.load(applicationContext) ?: return Result.retry()
                // Refresh token if near expiry
                val now = System.currentTimeMillis()
                val jwt = if (session.expiresAtMillis - now < 15_000L) {
                    val (newJwt, newExp) = provider.refreshAccessToken(session.refreshToken)
                    val updated = session.copy(token = newJwt, expiresAtMillis = newExp)
                    SessionStore.save(applicationContext, updated)
                    newJwt
                } else session.token

                // Place order
                provider.rpcPlaceOrder(jwt = jwt, outletId = p.outletId, items = items, employeeName = p.employeeName)
                // Success, remove from queue
                dao.delete(p.id)
            } catch (t: Throwable) {
                // exponential backoff (cap at 60s)
                val nextAttempts = p.attempts + 1
                val seconds = kotlin.math.min(60.0, java.lang.Math.pow(2.0, nextAttempts.toDouble()))
                val backoff = (seconds * 1000L).toLong()
                dao.updateBackoff(p.id, nextAttempts, System.currentTimeMillis() + backoff)
                // Continue to next item
            }
        }
        return Result.success()
    }

    companion object {
        fun enqueue(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val req = OneTimeWorkRequestBuilder<OrderSyncWorker>()
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "order-sync",
                ExistingWorkPolicy.KEEP,
                req
            )
        }
    }
}
