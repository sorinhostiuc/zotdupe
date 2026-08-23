/* eslint-env mozilla/browser-window */
var _io = window.arguments ? window.arguments[0] : null;
var Zotero = _io ? _io.Zotero : (typeof Zotero !== 'undefined' ? Zotero : null);
var ZotDupe = _io ? _io.ZotDupe : (typeof ZotDupe !== 'undefined' ? ZotDupe : null);

/**
 * ZotDupe — Merge Preview Dialog (Screen 3)
 *
 * Side-by-side field comparison showing canonical (master) item
 * versus all duplicates in a cluster. Color-coded rows indicate
 * identical, differing, or missing-on-master fields. Users can
 * click cells to choose which value to keep for differing fields.
 *
 * Receives data through window.arguments[0]:
 *   { cluster, zoteroItems, clusterIndex }
 *
 * Returns result via window.arguments[0].result:
 *   { merged: true/false, fieldSelections: {...} }
 */

var ZotDupeMergePreview = {

    // ── State ──────────────────────────────────────────────────
    cluster: null,
    clusterIndex: 0,
    canonicalId: null,
    masterItem: null,
    duplicateItems: [],
    allItems: [],
    fieldSelections: {},  // { fieldName: itemId } — which item's value to keep
    excludedIds: new Set(), // IDs of items excluded from merge

    // Fields to compare (common across most types)
    COMPARE_FIELDS: [
        'title', 'date', 'DOI', 'ISBN', 'url', 'publicationTitle',
        'abstractNote', 'language', 'publisher', 'place', 'volume',
        'issue', 'pages', 'extra', 'shortTitle', 'rights',
        'archive', 'archiveLocation', 'callNumber', 'libraryCatalog',
        'accessDate', 'ISSN', 'numPages', 'edition', 'series',
        'seriesNumber', 'bookTitle', 'proceedingsTitle',
        'conferenceName', 'thesisType', 'university',
        'reportNumber', 'reportType', 'institution',
        'repository', 'archiveID', 'websiteTitle', 'websiteType'
    ],

    // ── Human-readable field labels ────────────────────────────
    FIELD_LABELS: {
        title: 'Title',
        date: 'Date',
        DOI: 'DOI',
        ISBN: 'ISBN',
        ISSN: 'ISSN',
        url: 'URL',
        publicationTitle: 'Publication',
        abstractNote: 'Abstract',
        language: 'Language',
        publisher: 'Publisher',
        place: 'Place',
        volume: 'Volume',
        issue: 'Issue',
        pages: 'Pages',
        extra: 'Extra',
        shortTitle: 'Short title',
        rights: 'Rights',
        archive: 'Archive',
        archiveLocation: 'Archive loc.',
        callNumber: 'Call number',
        libraryCatalog: 'Catalog',
        accessDate: 'Access date',
        numPages: 'Num. pages',
        edition: 'Edition',
        series: 'Series',
        seriesNumber: 'Series no.',
        bookTitle: 'Book title',
        proceedingsTitle: 'Proc. title',
        conferenceName: 'Conference',
        thesisType: 'Thesis type',
        university: 'University',
        reportNumber: 'Report no.',
        reportType: 'Report type',
        institution: 'Institution',
        repository: 'Repository',
        archiveID: 'Archive ID',
        websiteTitle: 'Website title',
        websiteType: 'Website type'
    },

    // ===========================================================
    // init — entry point, called on window load
    // ===========================================================
    init: function () {
        try {
            var args = (window.arguments && window.arguments[0]) || {};
            this.cluster = args.cluster || {};
            this.clusterIndex = (args.clusterIndex != null) ? args.clusterIndex : 0;
            this.canonicalId = this.cluster.canonicalId || null;
            this.fieldSelections = {};

            // Build item arrays
            this._buildItemArrays();

            // Render
            this.renderHeader();
            this.renderFieldTable();
            this.renderWarnings();
        } catch (e) {
            if (typeof Components !== 'undefined') {
                Components.utils.reportError('ZotDupeMergePreview.init: ' + e);
            }
        }
    },

    // ===========================================================
    // _buildItemArrays — separate master from duplicates
    // ===========================================================
    _buildItemArrays: function () {
        var items = this.cluster.items || [];
        var ids = this.cluster.ids || [];
        this.allItems = [];
        this.masterItem = null;
        this.duplicateItems = [];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var itemId = ids[i] || item.id || i;
            // Attach id reference for selection tracking
            item._zotdupeId = itemId;

            this.allItems.push(item);
            if (String(itemId) === String(this.canonicalId)) {
                this.masterItem = item;
            } else {
                this.duplicateItems.push(item);
            }
        }

        // Fallback: if no master found, use first item
        if (!this.masterItem && this.allItems.length > 0) {
            this.masterItem = this.allItems[0];
            this.duplicateItems = this.allItems.slice(1);
        }
    },

    // ===========================================================
    // renderHeader
    // ===========================================================
    renderHeader: function () {
        var titleEl = document.getElementById('merge-preview-title');
        if (titleEl) {
            titleEl.textContent = 'Merge Preview \u2014 Cluster #' + (this.clusterIndex + 1);
        }
    },

    // ===========================================================
    // renderFieldTable — build the comparison table
    // ===========================================================
    renderFieldTable: function () {
        var thead = document.getElementById('merge-preview-thead');
        var tbody = document.getElementById('merge-preview-tbody');
        if (!thead || !tbody) return;

        thead.innerHTML = '';
        tbody.innerHTML = '';

        var master = this.masterItem;
        var dups = this.duplicateItems;
        if (!master) return;

        // ── Build header row ──
        var headerRow = document.createElement('tr');
        var self = this;

        var thField = document.createElement('th');
        thField.className = 'col-field';
        thField.textContent = 'Field';
        headerRow.appendChild(thField);

        var thMaster = document.createElement('th');
        thMaster.className = 'col-master';
        thMaster.innerHTML = '<span class="col-header-text">Canonical (MASTER)</span>';
        headerRow.appendChild(thMaster);

        for (var d = 0; d < dups.length; d++) {
            var thDup = document.createElement('th');
            var dupId = dups[d]._zotdupeId;
            var isExcluded = this.excludedIds.has(dupId);
            thDup.className = 'col-dup' + (isExcluded ? ' col-excluded' : '');
            thDup.setAttribute('data-col-index', String(d + 1));

            // Include checkbox for duplicates (only if 3+ items total)
            if (this.allItems.length > 2) {
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'col-include-cb';
                cb.checked = !isExcluded;
                cb.title = isExcluded ? 'Include in merge' : 'Exclude from merge';
                (function (itemId, cbEl) {
                    cbEl.addEventListener('change', function () {
                        self.onToggleInclude(itemId, cbEl.checked);
                    });
                })(dupId, cb);
                thDup.appendChild(cb);
            }

            var dupLabel = document.createElement('span');
            dupLabel.className = 'col-header-text';
            dupLabel.textContent = ' Duplicate ' + (d + 1);
            thDup.appendChild(dupLabel);
            headerRow.appendChild(thDup);
        }

        thead.appendChild(headerRow);

        // ── Gather all field names present across items ──
        var fieldSet = {};
        var fieldOrder = [];

        // Start with the compare fields in defined order
        for (var f = 0; f < this.COMPARE_FIELDS.length; f++) {
            var fn = this.COMPARE_FIELDS[f];
            fieldSet[fn] = true;
        }

        // Also add any extra fields found on items
        var allItemsList = [master].concat(dups);
        for (var ii = 0; ii < allItemsList.length; ii++) {
            var item = allItemsList[ii];
            for (var key in item) {
                if (!item.hasOwnProperty(key)) continue;
                if (key === 'id' || key === 'itemType' || key === 'creators' ||
                    key === 'dateAdded' || key === 'tags' || key === 'collections' ||
                    key === 'attachments' || key === '_zotdupeId' ||
                    key === 'hasPDF' || key === 'attachmentCount' ||
                    key === 'firstCreator') continue;
                if (!fieldSet[key]) {
                    fieldSet[key] = true;
                }
            }
        }

        // Build ordered list: defined fields first, then extras
        for (var cf = 0; cf < this.COMPARE_FIELDS.length; cf++) {
            fieldOrder.push(this.COMPARE_FIELDS[cf]);
        }
        for (var ek in fieldSet) {
            if (fieldSet.hasOwnProperty(ek) && fieldOrder.indexOf(ek) === -1) {
                fieldOrder.push(ek);
            }
        }

        // Filter to only fields that have at least one non-empty value
        var activeFields = [];
        for (var af = 0; af < fieldOrder.length; af++) {
            var fname = fieldOrder[af];
            var hasValue = false;
            for (var ai = 0; ai < allItemsList.length; ai++) {
                var val = allItemsList[ai][fname];
                if (val !== null && val !== undefined && val !== '') {
                    hasValue = true;
                    break;
                }
            }
            if (hasValue) activeFields.push(fname);
        }

        // ── Special row: Item type ──
        this._addSpecialRow(tbody, 'Item type', allItemsList, function (item) {
            return item.itemType || '—';
        }, false);

        // ── Field rows ──
        for (var r = 0; r < activeFields.length; r++) {
            this._addFieldRow(tbody, activeFields[r], master, dups);
        }

        // ── Special row: Tags ──
        this._addSpecialRow(tbody, 'Tags', allItemsList, function (item) {
            return self._formatTags(item.tags);
        }, true);

        // ── Special row: Attachments ──
        this._addSpecialRow(tbody, 'Attachments', allItemsList, function (item) {
            return self._formatAttachments(item);
        }, true);

        // ── Special row: Collections ──
        this._addSpecialRow(tbody, 'Collections', allItemsList, function (item) {
            return self._formatCollections(item);
        }, true);
    },

    // ===========================================================
    // _addFieldRow — add a single field comparison row
    // ===========================================================
    _addFieldRow: function (tbody, fieldName, master, dups) {
        var tr = document.createElement('tr');
        var allItems = [master].concat(dups);

        // Get all values
        var masterVal = this._getFieldValue(master, fieldName);
        var values = [masterVal];
        for (var i = 0; i < dups.length; i++) {
            values.push(this._getFieldValue(dups[i], fieldName));
        }

        // Determine row type
        var allIdentical = true;
        var masterEmpty = (masterVal === '');
        var anyDupHasValue = false;

        for (var v = 1; v < values.length; v++) {
            if (values[v] !== masterVal) allIdentical = false;
            if (values[v] !== '') anyDupHasValue = true;
        }

        var rowClass = 'row-identical';
        if (!allIdentical) rowClass = 'row-different';
        tr.className = rowClass;

        // Field name cell
        var tdField = document.createElement('td');
        tdField.className = 'cell-field';
        tdField.textContent = this.FIELD_LABELS[fieldName] || fieldName;
        tr.appendChild(tdField);

        // Value cells
        for (var c = 0; c < allItems.length; c++) {
            var td = document.createElement('td');
            td.className = 'cell-value';
            var cellVal = values[c];
            var item = allItems[c];
            var itemId = item._zotdupeId;
            var isMaster = (c === 0);

            // Missing on master, present on duplicate
            if (isMaster && masterEmpty && anyDupHasValue) {
                td.classList.add('cell-missing-on-master');
                td.innerHTML = '<span class="empty-value">(empty)</span>';
            } else if (!isMaster && !masterEmpty && cellVal === '') {
                // Duplicate has no value
                td.innerHTML = '<span class="empty-value">(empty)</span>';
            } else if (!isMaster && masterEmpty && cellVal !== '') {
                // Duplicate has value, master doesn't
                td.classList.add('cell-missing-on-master');
                var plusSpan = document.createElement('span');
                plusSpan.className = 'missing-plus';
                plusSpan.textContent = '+';
                td.appendChild(plusSpan);
                td.appendChild(document.createTextNode(this._truncate(cellVal, 200)));
            } else if (cellVal === '') {
                td.innerHTML = '<span class="empty-value">(empty)</span>';
            } else {
                td.textContent = this._truncate(cellVal, 200);
            }

            // Check if this item is excluded
            var isExcluded = this.excludedIds.has(itemId);
            if (isExcluded) {
                td.classList.add('cell-excluded');
            }

            // Make clickable if values differ and item is not excluded
            if (!allIdentical && cellVal !== '' && !isExcluded) {
                td.classList.add('cell-selectable');

                // Default selection: master value if non-empty, else first non-empty included dup
                if (!this.fieldSelections[fieldName]) {
                    if (masterVal !== '') {
                        this.fieldSelections[fieldName] = master._zotdupeId;
                    } else {
                        for (var fd = 0; fd < dups.length; fd++) {
                            if (this._getFieldValue(dups[fd], fieldName) !== '' &&
                                !this.excludedIds.has(dups[fd]._zotdupeId)) {
                                this.fieldSelections[fieldName] = dups[fd]._zotdupeId;
                                break;
                            }
                        }
                    }
                }

                // Mark as selected if this item is the selected one
                if (String(this.fieldSelections[fieldName]) === String(itemId)) {
                    td.classList.add('cell-selected');
                    var check = document.createElement('span');
                    check.className = 'selected-check';
                    check.textContent = '\u2713';
                    td.insertBefore(check, td.firstChild);
                }

                // Click handler
                (function (fn, iid, self) {
                    td.addEventListener('click', function () {
                        self.onFieldSelect(fn, iid);
                    });
                })(fieldName, itemId, this);
            }

            tr.appendChild(td);
        }

        tbody.appendChild(tr);
    },

    // ===========================================================
    // _addSpecialRow — item type, tags, attachments, collections
    // ===========================================================
    _addSpecialRow: function (tbody, label, allItems, formatter, isHtml) {
        var tr = document.createElement('tr');
        tr.className = 'row-identical'; // default

        var tdField = document.createElement('td');
        tdField.className = 'cell-field';
        tdField.textContent = label;
        tr.appendChild(tdField);

        var masterType = allItems[0] ? allItems[0].itemType : '';

        for (var i = 0; i < allItems.length; i++) {
            var td = document.createElement('td');
            td.className = 'cell-value';

            var content = formatter(allItems[i]);

            if (isHtml && content instanceof DocumentFragment) {
                td.appendChild(content);
            } else if (isHtml && typeof content === 'string') {
                td.innerHTML = content;
            } else {
                td.textContent = content || '—';
            }

            // Cross-type indicator for Tip item row
            if (label === 'Item type' && i > 0 && allItems[i].itemType !== masterType) {
                tr.className = 'row-different';
                var note = document.createElement('div');
                note.className = 'type-change-note';
                note.textContent = '(will be changed)';
                td.appendChild(note);
            }

            tr.appendChild(td);
        }

        // Check if special row values differ
        if (label === 'Tags' || label === 'Collections') {
            // Show union note on master cell
            var masterCell = tr.children[1]; // first value cell
            if (masterCell) {
                var unionNote = document.createElement('span');
                unionNote.className = 'union-note';
                unionNote.textContent = '(result: union)';
                masterCell.appendChild(unionNote);
            }
        }

        tbody.appendChild(tr);
    },

    // ===========================================================
    // onToggleInclude — checkbox in column header toggles item inclusion
    // ===========================================================
    onToggleInclude: function (itemId, included) {
        if (included) {
            this.excludedIds.delete(itemId);
        } else {
            this.excludedIds.add(itemId);
            // Clear any field selections pointing to this item
            for (var fn in this.fieldSelections) {
                if (this.fieldSelections.hasOwnProperty(fn) &&
                    String(this.fieldSelections[fn]) === String(itemId)) {
                    delete this.fieldSelections[fn];
                }
            }
        }
        this.renderFieldTable();
        this.renderWarnings();
        this._updateMergeButton();
    },

    /**
     * Update the merge button label to reflect how many items will be merged.
     */
    _updateMergeButton: function () {
        var btn = document.getElementById('merge-btn-execute');
        if (!btn) return;
        var includedCount = this.allItems.length - this.excludedIds.size;
        if (includedCount < 2) {
            btn.disabled = true;
            btn.textContent = 'Need at least 2 items';
        } else {
            btn.disabled = false;
            btn.textContent = 'Execute merge (' + includedCount + ' items)';
        }
    },

    // ===========================================================
    // onFieldSelect — user clicks to select which value to keep
    // ===========================================================
    onFieldSelect: function (fieldName, itemId) {
        // Don't allow selecting from excluded items
        if (this.excludedIds.has(itemId)) return;
        this.fieldSelections[fieldName] = itemId;
        // Re-render the table to update visual state
        this.renderFieldTable();
    },

    // ===========================================================
    // renderWarnings — cross-type merge warnings
    // ===========================================================
    renderWarnings: function () {
        var warningsDiv = document.getElementById('merge-preview-warnings');
        if (!warningsDiv) return;
        warningsDiv.innerHTML = '';

        if (!this.masterItem) return;
        var masterType = this.masterItem.itemType;

        for (var i = 0; i < this.duplicateItems.length; i++) {
            var dup = this.duplicateItems[i];
            if (!dup.itemType || dup.itemType === masterType) continue;

            // Cross-type detected
            var lostFields = {};
            if (typeof ZotDupe !== 'undefined' && ZotDupe.Merger && ZotDupe.Merger.findLostFields) {
                lostFields = ZotDupe.Merger.findLostFields(dup, masterType);
            } else {
                // Fallback: manually check using FIELDS_BY_TYPE if available
                lostFields = this._findLostFieldsFallback(dup, masterType);
            }

            var lostNames = [];
            for (var key in lostFields) {
                if (lostFields.hasOwnProperty(key)) {
                    lostNames.push(key);
                }
            }

            var warnDiv = document.createElement('div');
            warnDiv.className = 'merge-warning';

            var text = 'Warning: Item ' + (i + 1) + ' (' + dup.itemType + ') ' +
                       'will be changed to type \'' + masterType + '\' before merge.';

            if (lostNames.length > 0) {
                text += ' Fields \'' + lostNames.join('\' and \'') +
                        '\' will be saved in the Extra field.';
            }

            warnDiv.textContent = text;
            warningsDiv.appendChild(warnDiv);
        }
    },

    // ===========================================================
    // onMerge — execute merge with selected field values
    // ===========================================================
    onMerge: function () {
        if (window.arguments && window.arguments[0]) {
            window.arguments[0].result = {
                merged: true,
                fieldSelections: this.fieldSelections,
                excludedIds: Array.from(this.excludedIds)
            };
        }
        window.close();
    },

    // ===========================================================
    // onCancel — close without merging
    // ===========================================================
    onCancel: function () {
        if (window.arguments && window.arguments[0]) {
            window.arguments[0].result = { merged: false };
        }
        window.close();
    },

    // ===========================================================
    // Internal helpers
    // ===========================================================

    /**
     * Get a string value for a field from an item, normalizing empties.
     */
    _getFieldValue: function (item, fieldName) {
        if (!item) return '';
        var val = item[fieldName];
        if (val === null || val === undefined) return '';
        return String(val);
    },

    /**
     * Truncate text to maxLen characters.
     */
    _truncate: function (text, maxLen) {
        if (!text) return '';
        if (text.length <= maxLen) return text;
        return text.substring(0, maxLen) + '\u2026';
    },

    /**
     * Format tags array as HTML string with tag badges.
     */
    _formatTags: function (tags) {
        if (!tags || tags.length === 0) return '<span class="empty-value">(none)</span>';
        var html = '';
        for (var i = 0; i < tags.length; i++) {
            html += '<span class="tag-item">' + this._escapeHtml(tags[i].tag || tags[i]) + '</span>';
        }
        return html;
    },

    /**
     * Format attachments list.
     */
    _formatAttachments: function (item) {
        if (!item) return '<span class="empty-value">(none)</span>';
        var attachments = item.attachments;
        if (!attachments || attachments.length === 0) {
            if (item.hasPDF) return '<span class="attachment-item">PDF</span>';
            if (item.attachmentCount) return '<span class="attachment-item">' + item.attachmentCount + ' attachment(s)</span>';
            return '<span class="empty-value">(none)</span>';
        }
        var html = '';
        for (var i = 0; i < attachments.length; i++) {
            var att = attachments[i];
            var name = (typeof att === 'string') ? att : (att.title || att.filename || 'attachment');
            html += '<span class="attachment-item">' + this._escapeHtml(name) + '</span>';
        }
        return html;
    },

    /**
     * Format collections list.
     */
    _formatCollections: function (item) {
        if (!item) return '<span class="empty-value">(none)</span>';
        var collections = item.collections;
        if (!collections || collections.length === 0) {
            return '<span class="empty-value">(none)</span>';
        }
        var html = '';
        for (var i = 0; i < collections.length; i++) {
            var col = collections[i];
            var name = (typeof col === 'string') ? col : (col.name || col.id || col);
            html += '<span class="collection-item">' + this._escapeHtml(String(name)) + '</span>';
        }
        return html;
    },

    /**
     * Escape HTML special characters.
     */
    _escapeHtml: function (str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    /**
     * Fallback for findLostFields when ZotDupe.Merger is not available.
     * Uses a hardcoded subset of FIELDS_BY_TYPE.
     */
    _findLostFieldsFallback: function (item, newType) {
        var FIELDS_BY_TYPE = {
            journalArticle: ['title', 'abstractNote', 'publicationTitle', 'volume', 'issue', 'pages', 'date', 'DOI', 'ISSN', 'url', 'language', 'shortTitle', 'extra'],
            book: ['title', 'abstractNote', 'publisher', 'place', 'date', 'ISBN', 'url', 'numPages', 'edition', 'series', 'seriesNumber', 'language', 'shortTitle', 'extra'],
            bookSection: ['title', 'abstractNote', 'bookTitle', 'publisher', 'place', 'date', 'ISBN', 'url', 'pages', 'volume', 'edition', 'series', 'seriesNumber', 'language', 'shortTitle', 'extra'],
            conferencePaper: ['title', 'abstractNote', 'proceedingsTitle', 'conferenceName', 'place', 'date', 'DOI', 'ISBN', 'url', 'pages', 'volume', 'publisher', 'language', 'shortTitle', 'extra'],
            thesis: ['title', 'abstractNote', 'thesisType', 'university', 'place', 'date', 'url', 'numPages', 'language', 'shortTitle', 'extra'],
            report: ['title', 'abstractNote', 'reportNumber', 'reportType', 'institution', 'place', 'date', 'url', 'pages', 'language', 'shortTitle', 'extra'],
            preprint: ['title', 'abstractNote', 'repository', 'archiveID', 'date', 'DOI', 'url', 'language', 'shortTitle', 'extra'],
            webpage: ['title', 'abstractNote', 'websiteTitle', 'websiteType', 'date', 'url', 'language', 'shortTitle', 'extra']
        };
        var BASE_FIELDS = ['title', 'abstractNote', 'date', 'url', 'language', 'shortTitle', 'extra'];
        var SKIP_FIELDS = ['id', 'itemType', 'creators', 'dateAdded', 'tags', 'collections',
                           'attachments', '_zotdupeId', 'hasPDF', 'attachmentCount', 'firstCreator'];

        var validArr = FIELDS_BY_TYPE[newType] || BASE_FIELDS;
        var valid = {};
        for (var i = 0; i < validArr.length; i++) valid[validArr[i]] = true;

        var lost = {};
        for (var key in item) {
            if (!item.hasOwnProperty(key)) continue;
            if (SKIP_FIELDS.indexOf(key) !== -1) continue;
            var val = item[key];
            if (val === null || val === undefined || val === '') continue;
            if (!valid[key]) lost[key] = val;
        }
        return lost;
    }
};
