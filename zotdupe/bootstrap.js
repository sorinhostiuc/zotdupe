/**
 * ZotDupe — Semantic Duplicate Detector for Zotero 7+
 * Bootstrap entry point.
 */

var ZotDupe;
var chromeHandle;

function install(data, reason) {}

function startup({ id, version, resourceURI, rootURI }, reason) {
  // Fallback for older Zotero builds
  if (!rootURI) {
    rootURI = resourceURI.spec;
  }

  // Register chrome://zotdupe/content/ -> src/
  var aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Ci.amIAddonManagerStartup);
  var manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [
    ["content", "zotdupe", rootURI + "src/"],
  ]);

  // Initialize global namespace
  ZotDupe = {};

  // Set default preferences
  var branch = Services.prefs.getDefaultBranch("extensions.zotdupe.");
  branch.setCharPref("threshold", "balanced");
  branch.setBoolPref("enableLegalFingerprint", true);
  branch.setBoolPref("enablePreprintDetection", true);
  branch.setBoolPref("enableTranslationDetection", false);
  branch.setBoolPref("enableCrossType", true);
  branch.setBoolPref("enableMinHash", false);
  branch.setCharPref("excludedPairs", "[]");

  // Load modules in dependency order
  Services.scriptloader.loadSubScript(rootURI + "src/utils/normalize.js");
  Services.scriptloader.loadSubScript(rootURI + "src/legal-fingerprint.js");
  Services.scriptloader.loadSubScript(rootURI + "src/blocker.js");
  Services.scriptloader.loadSubScript(rootURI + "src/scanner.js");
  Services.scriptloader.loadSubScript(rootURI + "src/scorer.js");
  Services.scriptloader.loadSubScript(rootURI + "src/canonical.js");
  Services.scriptloader.loadSubScript(rootURI + "src/merger.js");
  Services.scriptloader.loadSubScript(rootURI + "src/utils/minhash.js");
  Services.scriptloader.loadSubScript(rootURI + "src/zotdupe.js");

  // Register preference pane
  Zotero.PreferencePanes.register({
    pluginID: "zotdupe@hostiuc.com",
    src: rootURI + "prefs.xhtml",
    label: "ZotDupe",
    image: rootURI + "icons/zotdupe.svg",
  });

  // Attach to already-open windows
  var windows = Zotero.getMainWindows();
  for (var win of windows) {
    onMainWindowLoad({ window: win });
  }
}

function onMainWindowLoad({ window }, reason) {
  var doc = window.document;

  var menuItem = doc.createXULElement("menuitem");
  menuItem.id = "zotdupe-scan-menuitem";
  menuItem.setAttribute("label", "ZotDupe: Scan for Duplicates\u2026");
  menuItem.addEventListener("command", function () {
    window.openDialog(
      "chrome://zotdupe/content/ui/config-dialog.xhtml",
      "zotdupe-config",
      "chrome,centerscreen,resizable",
      { Zotero: Zotero, ZotDupe: ZotDupe }
    );
  });

  var toolsMenu = doc.getElementById("menu_ToolsPopup");
  if (toolsMenu) {
    toolsMenu.appendChild(menuItem);
  }
}

function onMainWindowUnload({ window }, reason) {
  var doc = window.document;
  var menuItem = doc.getElementById("zotdupe-scan-menuitem");
  if (menuItem) {
    menuItem.remove();
  }
}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;

  var windows = Zotero.getMainWindows();
  for (var win of windows) {
    onMainWindowUnload({ window: win });
  }

  ZotDupe = null;

  if (chromeHandle) {
    chromeHandle.destruct();
    chromeHandle = null;
  }
}
