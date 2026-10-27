package app.nineflow.mobile;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

// The splash: Android's own (orange, the white N; res/values/styles.xml) stays up until the planner's
// page has loaded, so there is no blank flash in between. Then the page's matching splash
// (scripts/android-splash.html) takes over until the planner has drawn. Never longer than 3 seconds.
public class MainActivity extends BridgeActivity {
    private volatile boolean pageReady = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !pageReady);
        super.onCreate(savedInstanceState);
        // No bridge means the phone has no working WebView (Capacitor shows its own message): no wait.
        if (bridge == null) { pageReady = true; return; }
        bridge.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                webView.postDelayed(() -> pageReady = true, 150);
            }
        });
        getWindow().getDecorView().postDelayed(() -> pageReady = true, 3000);
    }
}
