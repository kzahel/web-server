package app.ok200.android

import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4

import org.junit.Test
import org.junit.runner.RunWith

import org.junit.Assert.*

@RunWith(AndroidJUnit4::class)
class ExampleInstrumentedTest {
    @Test
    fun useAppContext() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertEquals("app.ok200.android", appContext.packageName)
    }

    @Test
    fun applicationIsOk200Application() {
        val appContext = InstrumentationRegistry.getInstrumentation().targetContext
        assertTrue(appContext.applicationContext is Ok200Application)
    }
}
