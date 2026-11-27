package app.frogity.reader;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Switches the app's launcher icon: the classic frog, the gradient frog, the kid with a star, or the kid on the gradient.
 * Each is an activity alias; exactly one is enabled.
 */
@CapacitorPlugin(name = "AppIcon")
public class IconPlugin extends Plugin {
    private static final String[][] ICONS = {
        { "classic", "IconClassic" },
        { "gradient", "IconGradient" },
        { "kid", "IconKid" },
        { "gradient-kid", "IconGradientKid" },
    };

    private ComponentName alias(String n) {
        return new ComponentName(getContext(), "app.frogity.reader." + n);
    }

    private boolean on(String alias) {
        int s = getContext().getPackageManager().getComponentEnabledSetting(alias(alias));
        if (s == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return "IconClassic".equals(alias);
        return s == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    @PluginMethod
    public void get(PluginCall call) {
        String icon = "classic";
        for (String[] i : ICONS) if (!"IconClassic".equals(i[1]) && on(i[1])) icon = i[0];
        JSObject o = new JSObject();
        o.put("icon", icon);
        call.resolve(o);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String want = call.getString("icon", "classic");
        String target = "IconClassic";
        for (String[] i : ICONS) if (i[0].equals(want)) target = i[1];
        PackageManager pm = getContext().getPackageManager();
        // the new one is switched on first, so the app is never without a launcher entry
        pm.setComponentEnabledSetting(alias(target), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (String[] i : ICONS)
            if (!i[1].equals(target)) pm.setComponentEnabledSetting(alias(i[1]), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        JSObject o = new JSObject();
        o.put("icon", want);
        call.resolve(o);
    }
}
