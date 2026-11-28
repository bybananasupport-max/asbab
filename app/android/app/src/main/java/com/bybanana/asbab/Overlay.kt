package com.bybanana.asbab

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import com.bybanana.asbab.core.Bubble
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot

/**
 * Floating moon button over other apps (Phase 4). A round glass button with the real lunar phase:
 * drag it, it snaps to the nearest edge; drag it to the bottom to hide it. Tap: it turns into a
 * vertical glass rail whose icons appear one by one. Tap outside to collapse.
 * Shortcuts only open things for Amin (Asbab pages, camera, flashlight, lock screen); nothing acts in other apps.
 */
@SuppressLint("StaticFieldLeak")
object Overlay {
    private val main = Handler(Looper.getMainLooper())
    private var wm: WindowManager? = null
    private var ctx: Context? = null
    private var bubble: MoonView? = null
    private var bubbleLp: WindowManager.LayoutParams? = null
    private var railRoot: FrameLayout? = null
    @Volatile private var appVisible = false
    private var torchOn = false
    private var torchWatched = false

    private fun dp(c: Context, v: Float) = v * c.resources.displayMetrics.density

    /** Called by MainActivity: the moon button hides while Asbab itself is open (it has its own moon). */
    @JvmStatic
    fun setAppVisible(context: Context, visible: Boolean) {
        appVisible = visible
        sync(context)
    }

    /** Shows or removes the button to match: setting on, permission granted, not hidden, app not open. */
    @JvmStatic
    fun sync(context: Context) = main.post {
        val app = context.applicationContext
        val repo = Repo(app)
        val want = repo.settings().bubble && Settings.canDrawOverlays(app) && repo.db.get("_bubble:hidden") != "1" && !appVisible
        if (want) show(app) else remove()
    }

    fun remove() {
        closeRail()
        bubble?.let { v -> try { wm?.removeView(v) } catch (e: Exception) {} }
        bubble = null
    }

    private fun overlayType() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

    @SuppressLint("ClickableViewAccessibility")
    private fun show(app: Context) {
        if (bubble != null) { bubble?.invalidate(); return }
        ctx = app
        val w = app.getSystemService(WindowManager::class.java).also { wm = it }
        val size = dp(app, 58f).toInt()
        val dm = app.resources.displayMetrics
        val pos = try { JSONObject(Repo(app).db.get("_bubble:pos") ?: "{}") } catch (e: Exception) { JSONObject() }
        val lp = WindowManager.LayoutParams(
            size, size, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = pos.optInt("x", dm.widthPixels - size - dp(app, 6f).toInt())
            y = pos.optInt("y", (dm.heightPixels * 0.55).toInt())
        }
        val v = MoonView(app)
        val slop = ViewConfiguration.get(app).scaledTouchSlop
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0; var dragging = false
        v.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y; dragging = false }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX; val dy = e.rawY - downY
                    if (!dragging && hypot(dx, dy) > slop) dragging = true
                    if (dragging) { lp.x = startX + dx.toInt(); lp.y = startY + dy.toInt(); safeUpdate(v, lp) }
                }
                MotionEvent.ACTION_UP -> if (!dragging) openRail(app) else release(app, v, lp, size)
            }
            true
        }
        v.contentDescription = "Asbab: buka menu"
        try { w.addView(v, lp) } catch (e: Exception) { return }
        bubble = v; bubbleLp = lp
    }

    private fun safeUpdate(v: View, lp: WindowManager.LayoutParams) {
        try { wm?.updateViewLayout(v, lp) } catch (e: Exception) {}
    }

    private fun release(app: Context, v: View, lp: WindowManager.LayoutParams, size: Int) {
        val dm = app.resources.displayMetrics
        val cx = lp.x + size / 2f; val cy = lp.y + size / 2f
        if (Bubble.shouldHide(cy, dm.heightPixels, dp(app, 110f))) {
            Repo(app).db.put("_bubble:hidden", "1")
            v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
            remove()
            Toast.makeText(app, "Butang bulan tidur. Tunjuk semula dalam Asbab > Tetapan > Butang Terapung.", Toast.LENGTH_LONG).show()
            return
        }
        val margin = dp(app, 6f).toInt()
        val targetX = if (Bubble.snapLeft(cx, dm.widthPixels)) margin else dm.widthPixels - size - margin
        lp.y = lp.y.coerceIn(dp(app, 24f).toInt(), dm.heightPixels - size - dp(app, 24f).toInt())
        ValueAnimator.ofInt(lp.x, targetX).apply {
            duration = 260
            interpolator = DecelerateInterpolator()
            addUpdateListener { lp.x = it.animatedValue as Int; safeUpdate(v, lp) }
            start()
        }
        Repo(app).db.put("_bubble:pos", JSONObject().put("x", targetX).put("y", lp.y).toString())
    }

    /* ---------- the rail ---------- */

    /** Closes in reverse order: last icon first, then the rail folds back and the dimmed background clears. */
    private fun closeRail() {
        val r = railRoot ?: return
        railRoot = null
        val rail = r.getChildAt(0) as? LinearLayout
        if (rail != null) {
            val n = rail.childCount
            for (i in 0 until n) rail.getChildAt(i).animate().alpha(0f).scaleX(0.6f).scaleY(0.6f).setStartDelay((n - 1 - i) * 22L).setDuration(160).start()
            rail.animate().scaleY(0.25f).setStartDelay(120).setDuration(220).start()
        }
        (r.background as? android.graphics.drawable.ColorDrawable)?.let { bg ->
            ValueAnimator.ofInt(bg.alpha, 0).apply { duration = 300; addUpdateListener { bg.alpha = it.animatedValue as Int }; start() }
        }
        main.postDelayed({
            try { wm?.removeView(r) } catch (e: Exception) {}
            bubble?.visibility = View.VISIBLE
        }, 340)
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun openRail(app: Context) {
        if (railRoot != null) { closeRail(); return }
        val w = wm ?: return
        val lp0 = bubbleLp ?: return
        val repo = Repo(app)
        val s = repo.settings()
        val dm = app.resources.displayMetrics
        val size = dp(app, 58f).toInt()
        val up = Bubble.opensUp(lp0.y + size / 2f, dm.heightPixels)
        val items = Bubble.items(try { JSONObject(repo.db.get("settings") ?: "{}").optJSONArray("bubbleItems") } catch (e: Exception) { null })
        val current = Bubble.current(repo.db.get("_ui:route"))

        val root = FrameLayout(app)
        // Dimmed background behind the open rail.
        root.background = android.graphics.drawable.ColorDrawable(Color.BLACK).apply { alpha = 0 }
        ValueAnimator.ofInt(0, 100).apply { duration = 280; addUpdateListener { (root.background as android.graphics.drawable.ColorDrawable).alpha = it.animatedValue as Int }; start() }
        root.setOnTouchListener { _, e -> if (e.actionMasked == MotionEvent.ACTION_DOWN) closeRail(); true }
        val rail = LinearLayout(app).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            val pad = dp(app, 8f).toInt()
            setPadding(0, pad, 0, pad)
            background = GradientDrawable().apply {
                cornerRadius = dp(app, 34f)
                setColor(Color.argb(215, 16, 22, 48))
                setStroke(dp(app, 1f).toInt(), Color.argb(70, 255, 255, 255))
            }
            elevation = dp(app, 12f)
            isClickable = true
        }
        val views = mutableListOf<View>()
        val ordered = if (up) items.reversed() else items
        for (id in ordered) views += itemViews(app, repo, s, id, id == current)
        for (v in views) rail.addView(v)
        val railW = dp(app, 64f).toInt()
        val left = (lp0.x - (railW - size) / 2).coerceIn(dp(app, 4f).toInt(), dm.widthPixels - railW - dp(app, 4f).toInt())
        val params = FrameLayout.LayoutParams(railW, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = if (up) Gravity.BOTTOM or Gravity.START else Gravity.TOP or Gravity.START
            leftMargin = left
            if (up) bottomMargin = (dm.heightPixels - lp0.y - size).coerceAtLeast(dp(app, 8f).toInt())
            else topMargin = lp0.y.coerceAtLeast(dp(app, 8f).toInt())
        }
        root.addView(rail, params)
        val rootLp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP or Gravity.START }
        try { w.addView(root, rootLp) } catch (e: Exception) { return }
        railRoot = root
        bubble?.visibility = View.INVISIBLE
        rail.pivotX = railW / 2f
        rail.post { rail.pivotY = if (up) rail.height.toFloat() else 0f }
        rail.scaleY = 0.25f
        // Soft bounce as it stretches out; the moon spins.
        rail.animate().scaleY(1f).setDuration(460).setInterpolator(android.view.animation.OvershootInterpolator(1.4f)).start()
        views.firstOrNull { it is MoonView }?.let { m -> m.rotation = -200f; m.animate().rotation(0f).setDuration(600).setInterpolator(android.view.animation.OvershootInterpolator(1.2f)).start() }
        views.forEachIndexed { i, v ->
            v.alpha = 0f; v.scaleX = 0.6f; v.scaleY = 0.6f
            v.animate().alpha(1f).scaleX(1f).scaleY(1f).setStartDelay(60L + i * 35L).setDuration(240).start()
        }
    }

    private fun itemViews(app: Context, repo: Repo, s: com.bybanana.asbab.core.Settings, id: String, active: Boolean): List<View> {
        val big = dp(app, 46f).toInt()
        val gap = dp(app, 3f).toInt()
        fun lp(sz: Int) = LinearLayout.LayoutParams(sz, sz).apply { topMargin = gap; bottomMargin = gap }
        fun icon(name: String, label: String, onTap: () -> Unit) = IconView(app, name, active).apply {
            layoutParams = lp(big); contentDescription = label
            setOnClickListener { performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP); onTap() }
        }
        return when (id) {
            "tutup" -> listOf(MoonView(app).apply { layoutParams = lp(big); contentDescription = "Tutup"; setOnClickListener { closeRail() } })
            "suara" -> listOf(icon("mic", "Arahan suara") { closeRail(); start(app, Intent(app, VoiceActivity::class.java)) })
            "chat" -> listOf(icon("chat", "Chat") { go(app, "#/chat/utama") })
            "hari" -> listOf(icon("hari", "Hari Ini") { go(app, "#/hari-ini") })
            "project" -> listOf(icon("project", "Project") { go(app, "#/project") })
            "catatan" -> listOf(icon("catatan", "Catatan") { go(app, "#/catatan") })
            "tetapan" -> listOf(ProfileView(app, s.name.take(1).uppercase(), active).apply {
                layoutParams = lp(big); contentDescription = "Tetapan"; setOnClickListener { go(app, "#/tetapan") }
            })
            "pemisah" -> listOf(View(app).apply {
                layoutParams = LinearLayout.LayoutParams(dp(app, 22f).toInt(), dp(app, 2f).toInt()).apply { topMargin = gap * 2; bottomMargin = gap * 2 }
                background = GradientDrawable().apply { cornerRadius = dp(app, 1f); setColor(Color.argb(55, 255, 255, 255)) }
            })
            "projek" -> recentProjects(repo).map { (pid, name, color, alert) ->
                DotView(app, color, alert).apply {
                    layoutParams = LinearLayout.LayoutParams(dp(app, 34f).toInt(), dp(app, 34f).toInt())
                    contentDescription = "Project $name"; setOnClickListener { go(app, "#/project/$pid") }
                }
            }
            "cincin" -> listOf(RingView(app, repo.usageToday(), AiRouter.config(app).totalCap { AiRouter.hasKey(app, it) }).apply {
                layoutParams = lp(big); contentDescription = "Otak kedua: ${repo.usageToday()} permintaan hari ini"
                setOnClickListener { go(app, "#/tetapan/otak") }
            })
            "kamera" -> listOf(icon("kamera", "Kamera") { closeRail(); start(app, Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)) })
            "lampu" -> listOf(icon("lampu", "Lampu suluh") { toggleTorch(app) })
            "kunci" -> listOf(icon("kunci", "Kunci skrin") { closeRail(); lock(app) })
            else -> emptyList()
        }
    }

    private data class Proj(val id: String, val name: String, val color: Int, val alert: Boolean)

    /** The 3 latest active projects; red dot when a proposal waits for approval or the website is down. */
    private fun recentProjects(repo: Repo): List<Proj> = try {
        val a = JSONArray(repo.db.get("projects") ?: "[]")
        (0 until a.length()).map { a.getJSONObject(it) }.filter { !it.optBoolean("archived") }
            .sortedByDescending { it.optLong("createdAt") }.take(3)
            .map { Proj(it.optString("id"), it.optString("name"), if (it.optString("type") == "kod") Color.rgb(111, 194, 176) else Color.rgb(169, 155, 224), it.optBoolean("pending") || it.optString("status") == "down") }
    } catch (e: Exception) {
        emptyList()
    }

    private fun go(app: Context, route: String) {
        closeRail()
        start(app, Intent(app, MainActivity::class.java).putExtra(MainActivity.EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP))
    }

    private fun start(app: Context, i: Intent) {
        try { app.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        catch (e: Exception) { Toast.makeText(app, "Tak dapat dibuka dalam telefon ini.", Toast.LENGTH_SHORT).show() }
    }

    private fun lock(app: Context) {
        val reader = ScreenReader.instance
        if (reader != null && reader.lockScreen()) return
        Toast.makeText(app, "Untuk kunci skrin, hidupkan \"Asbab: baca teks skrin\" dalam Kebolehcapaian. Asbab tak akan baca skrin selagi suis Baca isi skrin app ditutup.", Toast.LENGTH_LONG).show()
        start(app, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    private fun toggleTorch(app: Context) {
        val cm = app.getSystemService(CameraManager::class.java)
        try {
            if (!torchWatched) {
                cm.registerTorchCallback(object : CameraManager.TorchCallback() {
                    override fun onTorchModeChanged(cameraId: String, enabled: Boolean) { torchOn = enabled }
                }, main)
                torchWatched = true
            }
            val id = cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
                ?: return Toast.makeText(app, "Telefon ini tiada lampu suluh.", Toast.LENGTH_SHORT).show()
            torchOn = !torchOn
            cm.setTorchMode(id, torchOn)
        } catch (e: Exception) {
            Toast.makeText(app, "Lampu suluh sedang digunakan oleh app lain.", Toast.LENGTH_SHORT).show()
        }
    }

    /* ---------- drawing ---------- */

    private val MOON = Color.rgb(237, 230, 207)

    /** Theme colours chosen in the app (Wallpaper & Rupa), shared through the database. */
    private fun themeColours(c: Context): IntArray = try {
        val o = JSONObject(Repo(c).db.get("_ui:theme") ?: "{}")
        intArrayOf(Color.parseColor(o.optString("glow1", "#3b5bdb")), Color.parseColor(o.optString("aksen", "#63e6be")), Color.parseColor(o.optString("glow2", "#12b886")))
    } catch (e: Exception) {
        intArrayOf(Color.rgb(59, 91, 219), Color.rgb(99, 230, 190), Color.rgb(18, 184, 134))
    }

    /** See-through glass circle with a slowly turning gradient frame in the theme colours, and a softly glowing moon. */
    class MoonView(c: Context) : View(c) {
        private val glass = Paint(Paint.ANTI_ALIAS_FLAG)
        private val rim = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        private val halo = Paint(Paint.ANTI_ALIAS_FLAG)
        private val colours = themeColours(c)
        private var angle = 0f
        private val spin = ValueAnimator.ofFloat(0f, 360f).apply {
            duration = 6000; repeatCount = ValueAnimator.INFINITE; interpolator = android.view.animation.LinearInterpolator()
            addUpdateListener { angle = it.animatedValue as Float; invalidate() }
        }
        override fun onAttachedToWindow() { super.onAttachedToWindow(); spin.start() }
        override fun onDetachedFromWindow() { spin.cancel(); super.onDetachedFromWindow() }
        private val dark = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(70, 237, 230, 207) }
        private val lit = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = MOON }

        override fun onDraw(canvas: Canvas) {
            val w = width.toFloat(); val cx = w / 2; val cy = height / 2f
            val r = minOf(w, height.toFloat()) / 2 - 2
            glass.shader = android.graphics.RadialGradient(cx, cy * 0.7f, r * 1.3f, Color.argb(150, 40, 52, 92), Color.argb(170, 10, 14, 32), android.graphics.Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, r, glass)
            rim.strokeWidth = r * 0.07f
            rim.shader = android.graphics.SweepGradient(cx, cy, intArrayOf(colours[0], colours[1], colours[2], colours[0]), null).apply {
                setLocalMatrix(android.graphics.Matrix().apply { setRotate(angle, cx, cy) })
            }
            canvas.drawCircle(cx, cy, r - rim.strokeWidth / 2, rim)
            val mr = r * 0.62f
            halo.shader = android.graphics.RadialGradient(cx, cy, mr * 1.6f, Color.argb(70, 255, 240, 200), Color.TRANSPARENT, android.graphics.Shader.TileMode.CLAMP)
            canvas.drawCircle(cx, cy, mr * 1.6f, halo)
            canvas.drawCircle(cx, cy, mr, dark)
            canvas.drawPath(litPath(Bubble.moonPhase(System.currentTimeMillis()), cx, cy, mr), lit)
        }

        private fun litPath(p: Double, cx: Float, cy: Float, r: Float): Path {
            val f = cos(2 * Math.PI * p).toFloat()
            val rx = maxOf(0.5f, abs(f) * r)
            val circle = RectF(cx - r, cy - r, cx + r, cy + r)
            val ellipse = RectF(cx - rx, cy - r, cx + rx, cy + r)
            val waxing = p < 0.5
            return Path().apply {
                arcTo(circle, -90f, if (waxing) 180f else -180f, true)
                arcTo(ellipse, 90f, if (waxing) (if (f > 0) -180f else 180f) else (if (f > 0) 180f else -180f), false)
                close()
            }
        }
    }

    /** Round glass button with a line icon; the current page is a white circle. */
    class IconView(c: Context, private val name: String, private val active: Boolean) : View(c) {
        private val bg = Paint(Paint.ANTI_ALIAS_FLAG)
        private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }

        override fun onDraw(canvas: Canvas) {
            val s = minOf(width, height).toFloat()
            bg.color = if (active) Color.WHITE else Color.argb(22, 255, 255, 255)
            canvas.drawCircle(width / 2f, height / 2f, s / 2, bg)
            stroke.color = if (active) Color.rgb(7, 11, 26) else MOON
            val k = s * 0.44f / 24f
            stroke.strokeWidth = 1.8f
            canvas.save()
            canvas.translate(width / 2f - 12 * k, height / 2f - 12 * k)
            canvas.scale(k, k)
            Icons.draw(canvas, name, stroke)
            canvas.restore()
        }
    }

    class ProfileView(c: Context, private val letter: String, private val active: Boolean) : View(c) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas: Canvas) {
            val s = minOf(width, height).toFloat()
            p.shader = android.graphics.LinearGradient(0f, 0f, s, s, Color.rgb(242, 176, 156), Color.rgb(232, 131, 107), android.graphics.Shader.TileMode.CLAMP)
            canvas.drawCircle(width / 2f, height / 2f, s / 2, p)
            if (active) {
                val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.WHITE; strokeWidth = s * 0.06f }
                canvas.drawCircle(width / 2f, height / 2f, s / 2 - ring.strokeWidth, ring)
            }
            val t = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(59, 29, 18); textSize = s * 0.38f; textAlign = Paint.Align.CENTER; isFakeBoldText = true }
            canvas.drawText(letter, width / 2f, height / 2f - (t.descent() + t.ascent()) / 2, t)
        }
    }

    class DotView(c: Context, private val color: Int, private val alert: Boolean) : View(c) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG)
        override fun onDraw(canvas: Canvas) {
            val s = minOf(width, height).toFloat()
            p.color = color
            canvas.drawCircle(width / 2f, height / 2f, s * 0.18f, p)
            if (alert) { p.color = Color.rgb(232, 112, 106); canvas.drawCircle(width / 2f + s * 0.22f, height / 2f - s * 0.22f, s * 0.12f, p) }
        }
    }

    /** AI usage today as a ring, with the count in the middle. */
    class RingView(c: Context, private val used: Int, private val cap: Int) : View(c) {
        private val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
        override fun onDraw(canvas: Canvas) {
            val s = minOf(width, height).toFloat()
            val r = s * 0.36f
            val box = RectF(width / 2f - r, height / 2f - r, width / 2f + r, height / 2f + r)
            p.strokeWidth = s * 0.07f
            p.color = Color.argb(40, 255, 255, 255)
            canvas.drawCircle(width / 2f, height / 2f, r, p)
            p.color = Color.rgb(242, 176, 156)
            canvas.drawArc(box, -90f, 360f * minOf(1f, used.toFloat() / maxOf(1, cap)), false, p)
            val t = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = MOON; textSize = s * 0.26f; textAlign = Paint.Align.CENTER }
            canvas.drawText(used.toString(), width / 2f, height / 2f - (t.descent() + t.ascent()) / 2, t)
        }
    }
}

/** Line icons drawn in a 24x24 box (same shapes as the in-app icons in app/www/app.js). */
object Icons {
    private fun circle(c: Canvas, x: Float, y: Float, r: Float, p: Paint) = c.drawCircle(x, y, r, p)
    private fun line(c: Canvas, p: Paint, vararg xy: Float) {
        var i = 0
        while (i + 3 < xy.size) { c.drawLine(xy[i], xy[i + 1], xy[i + 2], xy[i + 3], p); i += 4 }
    }
    private fun poly(c: Canvas, p: Paint, closed: Boolean, vararg xy: Float) {
        val path = Path().apply {
            moveTo(xy[0], xy[1])
            var i = 2
            while (i + 1 < xy.size) { lineTo(xy[i], xy[i + 1]); i += 2 }
            if (closed) close()
        }
        c.drawPath(path, p)
    }

    fun draw(c: Canvas, name: String, p: Paint) {
        when (name) {
            "chat" -> poly(c, p, true, 4f, 5f, 20f, 5f, 20f, 16f, 9f, 16f, 4f, 20f)
            "hari" -> {
                circle(c, 12f, 12f, 4f, p)
                line(c, p, 12f, 2f, 12f, 5f, 12f, 19f, 12f, 22f, 2f, 12f, 5f, 12f, 19f, 12f, 22f, 12f,
                    5f, 5f, 7f, 7f, 17f, 17f, 19f, 19f, 5f, 19f, 7f, 17f, 17f, 7f, 19f, 5f)
            }
            "project" -> {
                circle(c, 12f, 12f, 3f, p)
                c.save(); c.rotate(-25f, 12f, 12f); c.drawOval(RectF(2f, 8f, 22f, 16f), p); c.restore()
            }
            "catatan" -> {
                poly(c, p, true, 5f, 3f, 16f, 3f, 19f, 6f, 19f, 21f, 5f, 21f)
                line(c, p, 9f, 9f, 15f, 9f, 9f, 13f, 15f, 13f, 9f, 17f, 13f, 17f)
            }
            "mic" -> {
                c.drawRoundRect(RectF(9f, 3f, 15f, 14f), 3f, 3f, p)
                c.drawArc(RectF(5f, 4f, 19f, 18f), 0f, 180f, false, p)
                line(c, p, 12f, 18f, 12f, 21f)
            }
            "kamera" -> {
                c.drawRoundRect(RectF(3f, 7f, 21f, 20f), 2f, 2f, p)
                circle(c, 12f, 13.5f, 3.5f, p)
                poly(c, p, false, 8f, 7f, 9.5f, 4f, 14.5f, 4f, 16f, 7f)
            }
            "lampu" -> {
                poly(c, p, true, 8f, 2f, 16f, 2f, 16f, 7f, 14f, 10f, 14f, 22f, 10f, 22f, 10f, 10f, 8f, 7f)
                line(c, p, 12f, 13f, 12f, 15f)
            }
            "kunci" -> {
                c.drawRoundRect(RectF(5f, 11f, 19f, 21f), 2f, 2f, p)
                c.drawArc(RectF(8f, 3f, 16f, 11f), 180f, 180f, false, p)
                line(c, p, 8f, 7f, 8f, 11f, 16f, 7f, 16f, 11f)
            }
        }
    }
}
