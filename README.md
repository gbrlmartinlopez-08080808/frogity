# Financedly

Gamified financial-literacy lessons for teens: 7 modules, 50 bite-sized lessons with quizzes,
XP, levels, streaks, daily goals and achievements. Lessons can be read or listened to.

It is a statically exported [Next.js](https://nextjs.org) app, packaged for Android with
[Capacitor](https://capacitorjs.com). All content ships with the app and progress is stored
on the device, so it works offline.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run lint
npm run typecheck
npm test           # unit tests for streaks, XP, achievements, migration, read-aloud text
npm run build      # static site in out/
```

## Build the Android app

Requires JDK 21 and the Android SDK (platform 36). Set `ANDROID_HOME`, or put
`sdk.dir=/path/to/sdk` in `android/local.properties`.

```bash
npm run android:apk
```

The APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

To sign with your own key, create `android/keystore.properties` (never commit it):

```properties
storeFile=financedly-release.jks
storePassword=...
keyAlias=financedly
keyPassword=...
```

Without that file the release build is signed with the debug key, which is fine for testing
but can't be updated in place by a build signed with a different key.

## Where things live

| Path | What |
| --- | --- |
| `app/` | Screens (onboarding, dashboard, learn, lesson player, progress, settings) |
| `components/` | Shared UI (app shell, navigation, toasts, dialogs, listen button) |
| `data/` | Lesson content and achievements |
| `lib/progress.ts` | Game rules: XP, levels, streaks, daily goal, achievements, saved-data migration |
| `lib/speech.ts` | Read-aloud (native text-to-speech in the app, Web Speech in browsers) |
| `lib/reminders.ts` | Daily reminder notifications (Android app only) |
| `lib/sound.ts`, `lib/native.ts` | Sound effects, haptics, Android back button |
| `android/` | Capacitor Android project |
