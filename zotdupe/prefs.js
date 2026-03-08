/* eslint-env mozilla/bootstrap-script */
/* global Services */

/**
 * ZotDupe — Default Preferences
 *
 * Sets default preference values using the default branch.
 * Loaded during startup via Services.scriptloader.loadSubScript.
 */

(function () {
  var branch = Services.prefs.getDefaultBranch("extensions.zotdupe.");

  branch.setCharPref("threshold", "balanced");
  branch.setBoolPref("enableLegalFingerprint", true);
  branch.setBoolPref("enablePreprintDetection", true);
  branch.setBoolPref("enableTranslationDetection", false);
  branch.setBoolPref("enableCrossType", true);
  branch.setBoolPref("enableMinHash", false);
  branch.setCharPref("excludedPairs", "[]");
})();
