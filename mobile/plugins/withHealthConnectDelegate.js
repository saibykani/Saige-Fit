// Registers the Health Connect permission delegate in MainActivity.onCreate (required by react-native-health-connect).
const { withMainActivity } = require('@expo/config-plugins');

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

module.exports = function withHealthConnectDelegate(config) {
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
