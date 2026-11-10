import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.financedly.app",
  appName: "Financedly",
  // The static export produced by `next build`.
  webDir: "out",
  android: {
    // Lessons never load remote content.
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#8B5CF6",
    },
  },
};

export default config;
