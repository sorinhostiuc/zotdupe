/* eslint-env mozilla/browser-window */
/* global Zotero, window, document */

/**
 * ZotDupe — Config Dialog (Screen 1)
 *
 * Scan configuration dialog logic. Manages scope selection,
 * threshold slider, advanced options, and scan initiation.
 */

var ZotDupeConfigDialog = {
  /** Threshold presets mapping slider position to numeric value and label */
  _thresholds: [
    { value: 0.90, name: "Strict",   desc: "Va detecta doar duplicatele foarte sigure." },
    { value: 0.75, name: "Balansat", desc: "Va detecta duplicate probabile și sigure." },
    { value: 0.60, name: "Relaxat", desc: "Va detecta și potriviri parțiale — mai multe rezultate, posibil zgomot." },
  ],

  /** Pref branch for ZotDupe settings */
  _prefBranch: "extensions.zotdupe.",

  /** Cached collection list */
  _collections: [],

  /** Item count in the library */
  _itemCount: 0,

  /**
   * Initialize the dialog — called on window load.
   * Populates collections, counts items, reads prefs.
   */
  async init() {
    try {
      await this._populateCollections();
      await this._countItems();
      this._loadPrefs();
      this._updateEstimate();
    } catch (e) {
      Zotero.logError("[ZotDupe] Config dialog init error: " + e);
    }
  },

  /**
   * Populate the collection dropdown with user library collections.
   */
  async _populateCollections() {
    var select = document.getElementById("zotdupe-collection-select");
    var libID = Zotero.Libraries.userLibraryID;
    var collections = await Zotero.Collections.getByLibrary(libID);
    this._collections = collections;

    for (var col of collections) {
      var opt = document.createElementNS("http://www.w3.org/1999/xhtml", "option");
      opt.value = col.id;
      opt.textContent = col.name;
      select.appendChild(opt);
    }
  },

  /**
   * Count regular items in the library and display the count.
   */
  async _countItems() {
    var libID = Zotero.Libraries.userLibraryID;
    var items = await Zotero.Items.getAll(libID);
    this._itemCount = items.filter(function (item) {
      return item.isRegularItem();
    }).length;
    document.getElementById("zotdupe-item-count").textContent = this._itemCount;
  },

  /**
   * Load saved preferences and apply them to the dialog controls.
   */
  _loadPrefs() {
    // Threshold
    var thresholdPref = Zotero.Prefs.get(this._prefBranch + "threshold", true);
    var sliderValue = 1; // default: balanced
    if (thresholdPref === "strict") sliderValue = 0;
    else if (thresholdPref === "relaxed") sliderValue = 2;
    var slider = document.getElementById("zotdupe-threshold-slider");
    slider.value = sliderValue;
    this.onThresholdChange(sliderValue);

    // Advanced checkboxes
    var prefs = {
      "zotdupe-opt-legal":       "enableLegalFingerprint",
      "zotdupe-opt-preprint":    "enablePreprintDetection",
      "zotdupe-opt-translation": "enableTranslationDetection",
      "zotdupe-opt-crosstype":   "enableCrossType",
      "zotdupe-opt-minhash":     "enableMinHash",
    };
    for (var [elemId, prefKey] of Object.entries(prefs)) {
      var val = Zotero.Prefs.get(this._prefBranch + prefKey, true);
      if (typeof val === "boolean") {
        document.getElementById(elemId).checked = val;
      }
    }
  },

  /**
   * Handle scope radio button change — enable/disable collection dropdown.
   */
  onScopeChange() {
    var radios = document.querySelectorAll('input[name="scope"]');
    var isCollection = false;
    for (var r of radios) {
      if (r.checked && r.value === "collection") {
        isCollection = true;
        break;
      }
    }
    var select = document.getElementById("zotdupe-collection-select");
    select.disabled = !isCollection;
    this._updateEstimate();
  },

  /**
   * Handle threshold slider change.
   * @param {number|string} value - Slider position: 0=strict, 1=balanced, 2=relaxed
   */
  onThresholdChange(value) {
    var idx = parseInt(value, 10);
    var t = this._thresholds[idx];
    var desc = document.getElementById("zotdupe-threshold-desc");
    desc.textContent = "Pragul curent: \u2265 " + t.value.toFixed(2) + " — " + t.desc;
  },

  /**
   * Toggle the advanced options section visibility.
   */
  toggleAdvanced() {
    var body = document.getElementById("zotdupe-advanced-body");
    var indicator = document.getElementById("zotdupe-advanced-indicator");
    var collapsed = body.classList.toggle("zotdupe-collapsed");
    indicator.textContent = collapsed ? "\u25B6" : "\u25BC";
    // Adjust window height if needed
    window.sizeToContent && window.sizeToContent();
  },

  /**
   * Update the estimated scan duration text.
   */
  _updateEstimate() {
    var count = this._itemCount;
    // If collection scope, try to estimate from collection
    var radios = document.querySelectorAll('input[name="scope"]');
    var isCollection = false;
    for (var r of radios) {
      if (r.checked && r.value === "collection") {
        isCollection = true;
        break;
      }
    }

    if (isCollection) {
      // Use a rough estimate — actual count would need async lookup
      count = Math.min(count, Math.round(count * 0.3));
    }

    var est;
    if (count < 100) {
      est = "< 1 secundă";
    } else if (count < 500) {
      est = "câteva secunde";
    } else if (count < 2000) {
      est = "~10–30 secunde";
    } else if (count < 10000) {
      est = "~1–3 minute";
    } else {
      est = "câteva minute (bibliotecă mare)";
    }

    document.getElementById("zotdupe-estimate-text").textContent = est;
  },

  /**
   * Gather configuration and launch the scan.
   */
  async onScan() {
    // Determine scope
    var radios = document.querySelectorAll('input[name="scope"]');
    var scope = "library";
    for (var r of radios) {
      if (r.checked) {
        scope = r.value;
        break;
      }
    }

    var collectionID = null;
    if (scope === "collection") {
      var select = document.getElementById("zotdupe-collection-select");
      collectionID = select.value ? parseInt(select.value, 10) : null;
      if (!collectionID) {
        // No collection selected — flash the dropdown
        select.style.outline = "2px solid #e53935";
        setTimeout(function () { select.style.outline = ""; }, 1500);
        return;
      }
    }

    // Determine threshold
    var slider = document.getElementById("zotdupe-threshold-slider");
    var thresholdIdx = parseInt(slider.value, 10);
    var thresholdNames = ["strict", "balanced", "relaxed"];
    var thresholdName = thresholdNames[thresholdIdx];
    var thresholdValue = this._thresholds[thresholdIdx].value;

    // Save threshold pref
    Zotero.Prefs.set(this._prefBranch + "threshold", thresholdName, true);

    // Gather advanced options and save prefs
    var options = {
      enableLegalFingerprint:    document.getElementById("zotdupe-opt-legal").checked,
      enablePreprintDetection:   document.getElementById("zotdupe-opt-preprint").checked,
      enableTranslationDetection: document.getElementById("zotdupe-opt-translation").checked,
      enableCrossType:           document.getElementById("zotdupe-opt-crosstype").checked,
      enableMinHash:             document.getElementById("zotdupe-opt-minhash").checked,
    };

    for (var [key, val] of Object.entries(options)) {
      Zotero.Prefs.set(this._prefBranch + key, val, true);
    }

    // Build scan options
    var scanOptions = Object.assign({}, options, {
      libraryID: Zotero.Libraries.userLibraryID,
      collectionID: collectionID,
      threshold: thresholdName,
    });

    // Show progress UI and disable controls
    var self = this;
    this._showProgress();

    // Wire up progress callback
    scanOptions.onProgress = function (info) {
      self._updateProgress(info);
    };

    try {
      var result = await ZotDupe.scan(scanOptions);

      // Build zoteroItems map from scanned items
      var zoteroItemsMap = {};
      var allItems = await Zotero.Items.getAll(Zotero.Libraries.userLibraryID);
      allItems = allItems.filter(function (item) {
        return item.isRegularItem && item.isRegularItem();
      });
      for (var item of allItems) {
        zoteroItemsMap[item.id] = item;
      }

      // Build config object to pass to the results panel
      var config = {
        scope: scope,
        collectionID: collectionID,
        threshold: thresholdValue,
        thresholdName: thresholdName,
        options: options,
        scanResult: result,
        zoteroItems: zoteroItemsMap,
      };

      // Close this dialog
      window.close();

      // Open results panel and pass config via window arguments
      var mainWindow = Zotero.getMainWindow();
      if (mainWindow) {
        mainWindow.openDialog(
          "chrome://zotdupe/content/ui/results-panel.xhtml",
          "zotdupe-results",
          "chrome,centerscreen,resizable=yes,width=900,height=600",
          config
        );
      }
    } catch (e) {
      Zotero.logError("[ZotDupe] Scan error: " + e);
      this._hideProgress();
    }
  },

  /**
   * Show the progress overlay and disable scan controls.
   */
  _showProgress() {
    document.getElementById("zotdupe-progress").style.display = "block";
    document.getElementById("zotdupe-btn-scan").disabled = true;
    document.getElementById("zotdupe-btn-cancel").disabled = true;
    // Reset bar
    document.getElementById("zotdupe-progress-bar-fill").style.width = "0%";
    document.getElementById("zotdupe-progress-status").textContent = "Se scanează...";
  },

  /**
   * Hide the progress overlay and re-enable controls.
   */
  _hideProgress() {
    document.getElementById("zotdupe-progress").style.display = "none";
    document.getElementById("zotdupe-btn-scan").disabled = false;
    document.getElementById("zotdupe-btn-cancel").disabled = false;
  },

  /**
   * Update the progress bar and status text.
   * @param {{phase: string, message: string, progress: number}} info
   */
  _updateProgress(info) {
    if (!info) return;
    var statusEl = document.getElementById("zotdupe-progress-status");
    var fillEl = document.getElementById("zotdupe-progress-bar-fill");
    if (info.message) {
      statusEl.textContent = info.message;
    }
    if (typeof info.progress === "number") {
      fillEl.style.width = Math.round(info.progress * 100) + "%";
    }
  },

  /**
   * Cancel and close the dialog.
   */
  onCancel() {
    window.close();
  },
};
