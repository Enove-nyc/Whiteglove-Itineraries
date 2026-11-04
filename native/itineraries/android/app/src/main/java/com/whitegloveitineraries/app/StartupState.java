package com.whitegloveitineraries.app;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Startup decisions shared by the native screen and its unit tests. */
final class StartupState {
    static final int MIN_CHROMIUM_VERSION = 111; // Next.js 16 browser support.
    enum Status { LOADING, READY, OFFLINE, FAILED, UPDATE_REQUIRED }
    private static final Pattern CHROMIUM = Pattern.compile("(?:Chrome|Chromium)/(\\d+)");
    Status status = Status.LOADING;
    private int generation;

    static int chromiumVersion(String userAgent) {
        if (userAgent == null) return -1;
        Matcher matcher = CHROMIUM.matcher(userAgent);
        if (!matcher.find()) return -1;
        try { return Integer.parseInt(matcher.group(1)); }
        catch (NumberFormatException ignored) { return -1; }
    }

    static boolean needsUpdate(String userAgent) {
        int major = chromiumVersion(userAgent);
        return major >= 0 && major < MIN_CHROMIUM_VERSION;
    }

    int begin() { status = Status.LOADING; return ++generation; }
    int generation() { return generation; }
    void fail(Status reason) { status = reason; }
    boolean acceptContent(int requestGeneration, boolean hasContent) {
        if (requestGeneration != generation || status != Status.LOADING || !hasContent) return false;
        status = Status.READY;
        return true;
    }
    boolean timedOut(int requestGeneration) {
        if (requestGeneration != generation || status != Status.LOADING) return false;
        status = Status.FAILED;
        return true;
    }
}
