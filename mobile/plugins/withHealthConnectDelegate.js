// Registers the Health Connect permission delegate in MainActivity.onCreate (required by react-native-health-connect).
const { withMainActivity, withAndroidManifest } = require('@expo/config-plugins');

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

// Health Connect libraries declare minSdk 26 but the app keeps minSdk 24 (26 breaks the expo-modules-core native build).
// They only run on Android 8+ because the JS side guards on Platform.Version.
const OVERRIDE = 'androidx.health.connect.client,dev.matinzd.healthconnect,expo.modules.healthconnect';

function withUsesSdkOverride(config) {
  return withAndroidManifest(config, (cfg) => {
    const m = cfg.modResults.manifest;
    m.$ = { ...m.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
    const sdk = (m['uses-sdk'] && m['uses-sdk'][0]) || {};
    sdk.$ = { ...(sdk.$ || {}), 'tools:overrideLibrary': OVERRIDE };
    m['uses-sdk'] = [sdk];
    return cfg;
  });
}

module.exports = function withHealthConnectDelegate(config) {
  config = withUsesSdkOverride(config);
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== 'kt') throw new Error('withHealthConnectDelegate expects a Kotlin MainActivity');
    if (!src.includes(IMPORT)) src = src.replace(/(package [^\n]+\n)/, `$1\n${IMPORT}\n`);
    if (!src.includes(CALL)) {
      src = src.replace(/(super\.onCreate\([^)]*\))/, `$1\n    ${CALL}`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
