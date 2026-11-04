package com.whitegloveitineraries.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class StartupStateTest {
    @Test public void browserVersionUsesChromiumNotAndroidVersion() {
        assertEquals(126, StartupState.chromiumVersion("Mozilla/5.0 (Linux; Android 10; Tablet) AppleWebKit/537.36 Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36"));
        assertTrue(StartupState.needsUpdate("Android 14 Chrome/110.0.0.0"));
        assertFalse(StartupState.needsUpdate("Android 8 Chrome/111.0.0.0"));
        assertFalse(StartupState.needsUpdate("Unknown provider"));
        assertFalse(StartupState.needsUpdate(null));
    }
    @Test public void emptyContentCannotDismissStartupAndTimeoutIsRecoverable() {
        StartupState state = new StartupState();
        int first = state.begin();
        assertFalse(state.acceptContent(first, false));
        assertTrue(state.timedOut(first));
        assertEquals(StartupState.Status.FAILED, state.status);
        assertFalse(state.acceptContent(first, true));
        int second = state.begin();
        assertTrue(state.acceptContent(second, true));
        assertEquals(StartupState.Status.READY, state.status);
        assertFalse(state.timedOut(second));
    }
    @Test public void aLateOldPageCannotHideAnErrorOrNewNavigation() {
        StartupState state = new StartupState();
        int first = state.begin();
        int second = state.begin();
        assertFalse(state.acceptContent(first, true));
        assertFalse(state.timedOut(first));
        state.fail(StartupState.Status.OFFLINE);
        assertFalse(state.acceptContent(second, true));
        assertEquals(StartupState.Status.OFFLINE, state.status);
    }
}
