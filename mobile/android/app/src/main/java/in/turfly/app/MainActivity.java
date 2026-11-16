package in.turfly.app;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.net.URISyntaxException;

/**
 * Turfly app shell. On top of Capacitor's WebView it adds:
 *  - UPI / payment-app hand-off: Razorpay's UPI "intent" flow opens GPay, PhonePe, Paytm, etc.
 *  - Downloads (CSV export, calendar .ics, "Download my data") into the phone's Downloads folder,
 *    sent with the signed-in session cookie.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bridge bridge = getBridge();
        bridge.setWebViewClient(new TurflyWebViewClient(bridge));
        bridge.getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                download(url, userAgent, contentDisposition, mimeType));
    }

    private void download(String url, String userAgent, String contentDisposition, String mimeType) {
        if (!URLUtil.isHttpsUrl(url)) {
            Toast.makeText(this, "This file can't be downloaded in the app.", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) req.addRequestHeader("Cookie", cookies);
            req.addRequestHeader("User-Agent", userAgent);
            req.setMimeType(mimeType);
            req.setTitle(fileName);
            req.setDescription("Turfly");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(req);
            Toast.makeText(this, "Downloading " + fileName, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Download failed", Toast.LENGTH_SHORT).show();
        }
    }

    /** Hands non-web links (UPI apps, intent://, tel:, WhatsApp...) to the right Android app. */
    private static class TurflyWebViewClient extends BridgeWebViewClient {
        private final Bridge bridge;

        TurflyWebViewClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            Context ctx = view.getContext();

            if (scheme.equals("intent")) {
                try {
                    Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    intent.setComponent(null);
                    intent.setSelector(null);
                    try {
                        ctx.startActivity(intent);
                    } catch (ActivityNotFoundException e) {
                        String fallback = intent.getStringExtra("browser_fallback_url");
                        if (fallback != null && URLUtil.isHttpsUrl(fallback)) {
                            ctx.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                        } else if (intent.getPackage() != null) {
                            ctx.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + intent.getPackage())));
                        } else {
                            Toast.makeText(ctx, "No app found to open this", Toast.LENGTH_SHORT).show();
                        }
                    }
                } catch (URISyntaxException | ActivityNotFoundException e) {
                    Toast.makeText(ctx, "No app found to open this", Toast.LENGTH_SHORT).show();
                }
                return true;
            }

            if (!scheme.equals("http") && !scheme.equals("https") && !scheme.isEmpty()) {
                // upi://, tez://, phonepe://, paytmmp://, whatsapp://, tel:, mailto:, geo:, market:// ...
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    ctx.startActivity(intent);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(ctx, scheme.equals("upi") ? "No UPI app found on this phone" : "No app found to open this", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }
    }
}
