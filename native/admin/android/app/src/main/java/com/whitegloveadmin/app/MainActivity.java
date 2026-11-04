package com.whitegloveadmin.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    AppStartupGuard startup;
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startup = AppStartupGuard.attach(this, "https://www.whiteglovekoshertravel.com/admin", "White Glove Admin");
    }
    @Override public void onDestroy() {
        if (startup != null) startup.destroy();
        super.onDestroy();
    }
}
