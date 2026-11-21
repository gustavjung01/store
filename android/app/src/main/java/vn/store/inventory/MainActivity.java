package vn.store.inventory;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class MainActivity extends Activity {
    // HTTPS app owns Neon Auth, API, role checks and the shared STORE inventory DB.
    // This Android shell does not contain DB credentials, inventory or a separate backend.
    private static final String APP_URL = "https://store-nu-opal.vercel.app/";
    private static final String APP_HOST = "store-nu-opal.vercel.app";
    private static final int PICK_FILE = 300;
    private WebView browser;
    private android.webkit.ValueCallback<Uri[]> fileCallback;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(23, 34, 33));
        getWindow().setNavigationBarColor(Color.rgb(23, 34, 33));
        browser = new WebView(this);
        browser.setBackgroundColor(Color.rgb(23, 34, 33));
        browser.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(browser);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(false);
        browser.getSettings().setAllowContentAccess(true);
        browser.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        browser.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        browser.getSettings().setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, true);

        browser.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String host = url.getHost();
                if ("https".equalsIgnoreCase(url.getScheme()) && host != null
                    && (APP_HOST.equalsIgnoreCase(host) || host.endsWith(".neon.tech"))) return false;
                if ("https".equalsIgnoreCase(url.getScheme()) || "mailto".equalsIgnoreCase(url.getScheme())
                    || "tel".equalsIgnoreCase(url.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, url));
                    } catch (ActivityNotFoundException ex) {
                        Toast.makeText(MainActivity.this, "Không mở được liên kết", Toast.LENGTH_SHORT).show();
                    }
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        android.webkit.WebResourceError error) {
                if (request.isForMainFrame())
                    Toast.makeText(MainActivity.this,
                        "Không kết nối được STORE. Hãy kiểm tra mạng và thử lại.",
                        Toast.LENGTH_LONG).show();
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<Uri[]> callback,
                                            WebChromeClient.FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                    return true;
                } catch (ActivityNotFoundException ex) {
                    fileCallback = null;
                    return false;
                }
            }
        });
        browser.loadUrl(APP_URL);
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == PICK_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (browser != null && browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (browser != null) browser.destroy();
        super.onDestroy();
    }
}
