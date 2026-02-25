package app.ok200.android.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import app.ok200.android.MainActivity
import app.ok200.android.Ok200Application
import app.ok200.android.R

private const val TAG = "WebServerService"
private const val NOTIFICATION_ID = 1

/**
 * Foreground service that keeps the web server running when the app is backgrounded.
 */
class WebServerService : Service() {

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)
        Log.i(TAG, "Service started in foreground")
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "Service destroyed")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        val app = application as Ok200Application
        val state = app.engineController?.state?.value
        val port = state?.port ?: 8080
        val contentText = if (state?.running == true) {
            "Serving on port $port"
        } else {
            "Starting..."
        }

        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, Ok200Application.NotificationChannels.SERVICE)
            .setContentTitle("200 OK")
            .setContentText(contentText)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }
}
