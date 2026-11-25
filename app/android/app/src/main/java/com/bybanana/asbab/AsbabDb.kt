package com.bybanana.asbab

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Asbab's on-phone database: one SQLite table of key -> JSON text.
 * The web UI (through AsbabPlugin) and the Kotlin reminders read and write the same records,
 * e.g. "settings", "notes", "msgs:utama", "solat:2026-11-25", "prayer:KDH01:2026-11-25".
 */
class AsbabDb private constructor(context: Context) :
    SQLiteOpenHelper(context.applicationContext, "asbab.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Future schema changes go here. Never drop Amin's data.
    }

    @Synchronized
    fun get(key: String): String? =
        readableDatabase.rawQuery("SELECT value FROM kv WHERE key = ?", arrayOf(key)).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }

    @Synchronized
    fun put(key: String, value: String) {
        val v = ContentValues().apply {
            put("key", key)
            put("value", value)
            put("updated", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("kv", null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }

    @Synchronized
    fun del(key: String) {
        writableDatabase.delete("kv", "key = ?", arrayOf(key))
    }

    @Synchronized
    fun keys(prefix: String): List<String> {
        // LIKE with an escaped prefix, so "_" and "%" in keys are matched literally.
        val escaped = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return readableDatabase.rawQuery("SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY key", arrayOf("$escaped%")).use { c ->
            buildList { while (c.moveToNext()) add(c.getString(0)) }
        }
    }

    /** Read-modify-write under the database lock, so Kotlin and the UI never overwrite each other's change. */
    @Synchronized
    fun update(key: String, change: (String?) -> String) {
        put(key, change(get(key)))
    }

    companion object {
        @Volatile private var instance: AsbabDb? = null

        fun get(context: Context): AsbabDb =
            instance ?: synchronized(this) { instance ?: AsbabDb(context).also { instance = it } }
    }
}
