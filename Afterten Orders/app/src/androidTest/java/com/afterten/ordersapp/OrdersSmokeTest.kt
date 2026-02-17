package com.afterten.ordersapp

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import androidx.compose.ui.test.onNodeWithText

@RunWith(AndroidJUnit4::class)
class OrdersSmokeTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appStarts_andShowsHomeOrLogin() {
        // This is a smoke test to ensure the activity launches. We look for common UI markers.
        composeRule.onNodeWithText("Orders").assertExists()
    }
}
