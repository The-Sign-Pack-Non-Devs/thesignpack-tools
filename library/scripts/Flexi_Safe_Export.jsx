// ============================================================
//  Flexi-Safe Export 1.4  -  for Adobe Illustrator
//  Author: Joao Victor Malz
//  Copyright: (c) 2026 Joao Victor Malz
//  Created for use at The Sign Pack
//
//  Makes client-handoff PDFs (and optional .ai) that survive import into
//  FlexiDesign/FlexiSIGN and other RIP/cut software that ignores Illustrator
//  clipping masks.
//
//   - Images inside clipping masks are rasterized (that is what a baked shape cut IS
//     for pixels) at the DPI / color / background you pick: 150 or 300 DPI, CMYK or RGB,
//     Transparent or White. Defaults: 150, CMYK, Transparent.
//   - Vector content sharing a mask with an image stays vector (children are split,
//     each keeps the mask shape).
//   - Resolution is auto-capped for very large art so Illustrator can not silently
//     collapse it to garbage values.
//   - "Smart name": project number from the file name, the project's production folder
//     and the next free version. "Same version" keeps the latest version in the folder
//     (it is overwritten).
//
//  Also: per-artboard export, bleed option (trim cuts at the bleed mark), text
//  outlined, grouped output, artboard-edge trim.
//
//  IMPORTANT: compare output against the original before sending to a client the
//  first time, and after any Illustrator update.
// ============================================================

#target illustrator
var TSP_ASSET_SELF = ($.global.__SELF_OVERRIDE ? $.global.__SELF_OVERRIDE : $.fileName);

function flexiSafeExport() {
    // ---- UI Kit: logo, popups and standard sizes live in ONE shared file ----
    // Needs "UI_Kit_x.x.jsx" in the same folder as this script (the highest version
    // is used). If it is missing the script still works: plain system popups, no logo.
    var UIK_SELF = "";
    try { UIK_SELF = $.fileName; } catch (eUS) {}
    var UIK_CACHE = null;
    function uik() {
        if (UIK_CACHE) return UIK_CACHE;
        var kit = null;
        try {
            var folder = new File(UIK_SELF).parent;
            var files = folder.getFiles();
            var best = null, bestV = null;
            for (var i = 0; i < files.length; i++) {
                if (!(files[i] instanceof File)) continue;
                var m = decodeURI(files[i].name).match(/^UI[ _]Kit(?:[ _]*v?(\d+(?:\.\d+)*))?\.jsx$/i);
                if (!m) continue;
                var v = (m[1] || "0").split(".");
                var newer = !bestV;
                for (var n = 0; !newer && n < 4; n++) {
                    var x = parseInt(v[n] || "0", 10), y = parseInt(bestV[n] || "0", 10);
                    if (x !== y) { newer = (x > y); break; }
                }
                if (newer) { best = files[i]; bestV = v; }
            }
            if (best) {
                $.global.__SIGNPACK_LOADING_UI = true;
                $.global.__SIGNPACK_UIKIT = null;
                try { $.evalFile(best); } catch (eKit) {}
                $.global.__SIGNPACK_LOADING_UI = false;
                kit = $.global.__SIGNPACK_UIKIT;
            }
        } catch (eFind) {}
        if (!kit || !kit.spAlert) {
            kit = {
                version: "none", missing: true, TITLE_SIZE: 15, MARGINS: 16, SPACING: 10,
                pos: function () { return [90, 140]; },
                spAlert: function (message) { alert(message); },
                spConfirm: function (message) { return confirm(message); },
                addLogo: function () { return null; },
                popupDefs: "function spAlert(message, title) { alert(message); }\nfunction spConfirm(message, title, yesText) { return confirm(message); }\n"
            };
            try {
                if (!$.global.__SIGNPACK_UIKIT_WARNED) {
                    $.global.__SIGNPACK_UIKIT_WARNED = true;
                    alert("The UI Kit file was not found.\n\nPut \"UI_Kit_x.x.jsx\" in the same folder as this script to get the logo and the dark popups. The script works without it.");
                }
            } catch (eWarn) {}
        }
        UIK_CACHE = kit;
        return kit;
    }
    function spAlert(message, title) { uik().spAlert(message, title); }
    function spConfirm(message, title, yesText) { return uik().spConfirm(message, title, yesText); }
    function addLogo(parent, w) { return uik().addLogo(parent, w); }

    // ---- Look: dark grey window, white text, green accents ----
    // STYLED_UI = false gives the plain system look back (use it if the labels are hard to read).
    var STYLED_UI = true;
    var TSP_BG = [43 / 255, 43 / 255, 43 / 255, 1];          // window background, #2B2B2B
    var TSP_GREEN = [34 / 255, 164 / 255, 56 / 255, 1];      // company green
    var TSP_GREEN_HI = [52 / 255, 184 / 255, 76 / 255, 1];   // lighter green (hover, panel titles)
    var TITLE_PNG = "flexi_title_png.png";
    function paintWin(w) {
        if (!STYLED_UI) return;
        try { w.graphics.backgroundColor = w.graphics.newBrush(w.graphics.BrushType.SOLID_COLOR, TSP_BG); } catch (ePw) {}
    }
    // White text everywhere, green panel titles. Controls marked keepColor are left alone.
    function paintStyle(ctl) {
        if (!STYLED_UI) return;
        try {
            var g = ctl.graphics;
            var t = ctl.type;
            if (t === "statictext" || t === "checkbox" || t === "radiobutton" || t === "panel" || t === "edittext" || t === "listbox") {
                if (!ctl.keepColor) g.foregroundColor = g.newPen(g.PenType.SOLID_COLOR, (t === "panel") ? TSP_GREEN_HI : [1, 1, 1, 1], 1);
            }
        } catch (ePs) {}
        try {
            if (ctl.children) { for (var pi = 0; pi < ctl.children.length; pi++) paintStyle(ctl.children[pi]); }
        } catch (ePc) {}
    }
    // Pictures are real PNG files in the assets folder next to this script (nothing is written to Temp).
    function assetFile(name) {
        try {
            var f = new File(File(TSP_ASSET_SELF).parent.fsName + "/assets/" + name);
            return f.exists ? f : null;
        } catch (eAf) { return null; }
    }
    // Button pictures (the text is part of the picture, so it is always centered).
    function btnImage(key, data) {
        try {
            var f = assetFile(data);
            if (f && f.length > 50) return ScriptUI.newImage(f);
        } catch (eBi) {}
        return null;
    }
    function btnSet(def) {
        return { n: btnImage(def.key + "_n", def.n), h: btnImage(def.key + "_h", def.h2), p: btnImage(def.key + "_p", def.p), d: btnImage(def.key + "_d", def.d), w: def.w, hgt: def.h };
    }
    // Green rounded main button. A second set (alt) can be used with btn.useAlt(true), e.g. Create / Rename.
    // If anything fails, the button stays native.
    function styleGreenButton(btn, def, altDef) {
        if (!STYLED_UI) return;
        try {
            var sets = [btnSet(def)];
            if (altDef) sets.push(btnSet(altDef));
            if (!sets[0].n || (altDef && !sets[1].n)) return;
            var cur = 0;
            btn.preferredSize = [def.w, def.h];
            btn.useAlt = function (on) { cur = (on && altDef) ? 1 : 0; try { btn.notify("onDraw"); } catch (eUa) {} };
            btn.onDraw = function (stt) {
                var gb = this.graphics;
                var bw = this.size.width, bh = this.size.height;
                var s = sets[cur];
                gb.newPath(); gb.rectPath(0, 0, bw, bh);
                gb.fillPath(gb.newBrush(gb.BrushType.SOLID_COLOR, TSP_BG));
                var im = s.n;
                if (!this.enabled) { if (s.d) im = s.d; }
                else { try { if (stt && stt.leftButtonPressed && s.p) im = s.p; else if (stt && stt.mouseOver && s.h) im = s.h; } catch (eSt) {} }
                gb.drawImage(im, 0, 0, bw, bh);
            };
            var redrawBtn = function () { try { btn.notify("onDraw"); } catch (eNd) {} };
            btn.addEventListener("mouseover", redrawBtn);
            btn.addEventListener("mouseout", redrawBtn);
            btn.addEventListener("mousedown", redrawBtn);
            btn.addEventListener("mouseup", redrawBtn);
        } catch (eGb) {}
    }
    // Logo: The Sign Pack wordmark from the UI Kit on the styled window, the old logo otherwise.
    function addHeaderLogo(parent, w) {
        if (STYLED_UI) {
            try { var im = uik().addWordmark ? uik().addWordmark(parent) : null; if (im) return im; } catch (eWm) {}
        }
        return addLogo(parent, w);
    }
    // Title as a small picture (bold capitals), because the window font cannot be set bold/bigger reliably.
    function addHeaderTitle(parent, fallbackText) {
        var im = null;
        if (STYLED_UI) {
            try {
                var tf = assetFile(TITLE_PNG);
                if (tf && tf.length > 50) im = parent.add("image", undefined, tf);
            } catch (eTi) { im = null; }
        }
        if (!im) {
            im = parent.add("statictext", undefined, fallbackText);
            try { im.graphics.font = ScriptUI.newFont("dialog", "BOLD", uik().TITLE_SIZE); } catch (eFt) {}
        }
        im.alignment = ["right", "center"];
        return im;
    }
    function addAccentLine(w) {
        if (!STYLED_UI) return;
        try {
            var ln = w.add("group");
            ln.alignment = ["fill", "top"];
            ln.preferredSize = [10, 4];
            ln.graphics.backgroundColor = ln.graphics.newBrush(ln.graphics.BrushType.SOLID_COLOR, TSP_GREEN);
        } catch (eAl) {}
    }
    var BTN_FLEXI = { key: "flexi", w: 172, h: 28, n: "flexi_flexi_n.png", h2: "flexi_flexi_h2.png", p: "flexi_flexi_p.png", d: "flexi_flexi_d.png" };


    // ------------------ SETTINGS ------------------
    var DEFAULT_PRESET  = "[PDF/X-1a:2001]"; // preselected when no saved preference
    var DEFAULT_BLEED   = "0.125";           // inches, shown in the bleed box
    var OUTLINE_TEXT    = true;              // convert all text to outlines
    var KEEP_EDITABLE   = true;              // preserve AI editing data in the PDF (opens grouped; larger file)
    var PREF_KEY        = "TheSignPack_FlexiPDFPreset";
    var MAX_SIDE_PX     = 16000;             // Illustrator raster limit: max pixels per side
    var MAX_TOTAL_PX    = 50000000;          // Illustrator raster limit: max total pixels
    // ----------------------------------------------

    if (app.documents.length === 0) {
        spAlert("Please open a document first.");
        return;
    }

    var doc = app.activeDocument;
    var originalFilePath = "";

    try {
        if (!doc.saved) doc.save();
        originalFilePath = doc.fullName.fsName;
    } catch (e) {
        spAlert("Please save your original .ai file first.");
        return;
    }

    var docName = doc.name.replace(/\.[^\.]+$/, '');
    var cleanDocName = docName.replace(/[\/\\:*?"<>|]/g, '-');
    var pdfPresets = app.PDFPresetsList;



    // ---- UI ----
    function colGroup(parent) {
        var g = parent.add("group");
        g.orientation = "column"; g.alignChildren = ["fill", "top"]; g.alignment = ["fill", "top"]; g.spacing = 8;
        return g;
    }
    function makePanel(parent, title) {
        var pn = parent.add("panel", undefined, title);
        pn.orientation = "column"; pn.alignChildren = ["left", "top"]; pn.margins = [12, 16, 12, 12]; pn.spacing = 6;
        return pn;
    }
    var win = new Window("dialog", "Flexi-Safe Export 1.4");
    paintWin(win);   // dark grey first: the UI Kit picks the white logo on a dark window
    win.orientation = "column"; win.alignChildren = ["fill", "top"]; win.margins = uik().MARGINS; win.spacing = uik().SPACING;

    var logoRow = win.add("group");
    logoRow.alignment = ["fill", "top"];
    logoRow.alignChildren = ["left", "center"];
    logoRow.spacing = 10;
    logoRow.margins = 0;
    addHeaderLogo(logoRow, win);
    var logoSpacer = logoRow.add("group");
    logoSpacer.alignment = ["fill", "center"];
    addHeaderTitle(logoRow, "Flexi-Safe Export");
    addAccentLine(win);

    var cols = win.add("group");
    cols.orientation = "row"; cols.alignChildren = ["fill", "top"]; cols.spacing = 12;
    var colA = colGroup(cols), colB = colGroup(cols);

    // ---- Left: where to save, file name, preset ----
    var pnlSave = makePanel(colA, "1. Where to save");
    var grpFolder = pnlSave.add("group");
    var btnFolder = grpFolder.add("button", undefined, "Browse...");
    var txtFolder = grpFolder.add("edittext", undefined, doc.path.fsName); txtFolder.characters = 32;

    btnFolder.onClick = function () {
        var startFolder = new Folder(txtFolder.text);
        if (!startFolder.exists) startFolder = new Folder(doc.path.fsName);
        var selectedFolder = Folder.selectDialog("Select destination folder", startFolder);
        if (selectedFolder) txtFolder.text = selectedFolder.fsName;
    };

    var pnlName = makePanel(colA, "2. File name");
    var grpNameHead = pnlName.add("group");
    grpNameHead.orientation = "row";
    var btnSmartName = grpNameHead.add("button", undefined, "Smart name");
    var btnSameVersion = grpNameHead.add("button", undefined, "Same version");
    var txtCustomName = pnlName.add("edittext", undefined, cleanDocName + " ");
    txtCustomName.characters = 38;

    var firstAbName = doc.artboards[0].name.replace(/[\/\\:*?"<>|]/g, '-');
    var txtPreview = pnlName.add("statictext", undefined, "Preview: " + txtCustomName.text + firstAbName + ".pdf");
    txtPreview.preferredSize.width = 330;
    var txtSmartNote = pnlName.add("statictext", undefined, "");
    txtSmartNote.preferredSize.width = 330;

    function updatePreview() {
        var currentText = txtCustomName.text;
        if (currentText === "") currentText = cleanDocName + " ";
        txtPreview.text = "Preview: " + currentText + firstAbName + ".pdf";
    }
    txtCustomName.onChanging = function () { updatePreview(); };

    // Smart name (from Export Production Files): project number (digits at the start of the file
    // name), the project's production folder and the next free version in it. The project folder
    // is found by walking UP from the open file to the folder whose name starts with the project
    // number; the production folder is then looked for inside it (up to 3 levels down):
    // "Final Production Files" first, otherwise any "Production Files".
    function startsWithProject(nm, proj) {
        return nm.indexOf(proj) === 0 && !/^\d/.test(nm.substr(proj.length));
    }
    function findProductionFolder(proj) {
        try {
            var cur = doc.path;
            var projFolder = null;
            for (var up = 0; up < 10 && cur; up++) {
                if (startsWithProject(decodeURI(cur.name), proj)) { projFolder = cur; break; }
                cur = cur.parent;
            }
            if (!projFolder) return null;
            var best = null, any = null;
            function walk(fld, depth) {
                if (depth > 3) return;
                var kids = fld.getFiles();
                for (var k = 0; k < kids.length; k++) {
                    if (!(kids[k] instanceof Folder)) continue;
                    var nm = decodeURI(kids[k].name);
                    if (/^final\s+production\s+files?$/i.test(nm)) { if (!best) best = kids[k]; }
                    else if (/production\s+files?/i.test(nm)) { if (!any) any = kids[k]; }
                    walk(kids[k], depth + 1);
                }
            }
            walk(projFolder, 1);
            return best || any;
        } catch (eFp) { return null; }
    }
    // Highest _v<N> already in a folder for this project (0 if none).
    var DEFAULT_MIDDLE = "Production Files";
    function scanNaming(folderPath, proj) {
        var res = { last: 0 };
        try {
            var fld = new Folder(folderPath);
            var fl = fld.exists ? fld.getFiles() : [];
            var rxV = new RegExp("^" + proj + ".*?_v(\\d+)", "i");
            for (var sf = 0; sf < fl.length; sf++) {
                var mv = decodeURI(fl[sf].name).match(rxV);
                if (!mv) continue;
                var vn = parseInt(mv[1], 10);
                if (vn > res.last) res.last = vn;
            }
        } catch (eSn) {}
        return res;
    }
    function shortenPath(p) {
        p = String(p);
        return (p.length > 48) ? ("..." + p.substr(p.length - 45)) : p;
    }
    var smartSameVersion = false;
    function smartApply() {
        var pm = docName.match(/^(\d{4,})/);
        if (!pm) {
            spAlert("Could not find a project number at the start of the file name.");
            return;
        }
        var proj = pm[1];
        var prodFolder = findProductionFolder(proj);
        if (prodFolder) {
            txtFolder.text = prodFolder.fsName;
            txtSmartNote.text = "Production folder found: " + shortenPath(prodFolder.fsName);
        } else {
            txtSmartNote.text = "No production folder found - using the folder above.";
        }
        var last = scanNaming(txtFolder.text, proj).last;
        // "Same version" re-uses the highest version already in the folder (overwrites it); otherwise the next one.
        txtCustomName.text = proj + "_" + DEFAULT_MIDDLE + "_v" + ((smartSameVersion && last > 0) ? last : (last + 1)) + " ";
        updatePreview();
    }
    // Second click goes back to the name and folder from before the first click.
    var smartUndo = null;
    function smartClick(same) {
        if (smartUndo) {
            txtCustomName.text = smartUndo.name;
            txtFolder.text = smartUndo.folder;
            txtSmartNote.text = "";
            smartUndo = null;
            updatePreview();
            return;
        }
        var before = { name: txtCustomName.text, folder: txtFolder.text };
        smartSameVersion = same;
        try { smartApply(); } finally { smartSameVersion = false; }
        if (txtCustomName.text !== before.name || txtFolder.text !== before.folder) smartUndo = before;
    }
    btnSmartName.onClick = function () { smartClick(false); };
    btnSameVersion.onClick = function () { smartClick(true); };
    btnSmartName.helpTip = "Fills in the project number from the file name, the project's production folder and the next free version (for example 126080_Production Files_v3). Click again to undo.";
    btnSameVersion.helpTip = "Like Smart name, but keeps the latest version number already in the folder, so the files of that version are overwritten. Click it again to go back.";

    var pnlPreset = makePanel(colA, "3. PDF preset");
    var dropdownPresets = pnlPreset.add("dropdownlist", undefined, pdfPresets);

    var savedPreset = "";
    try { savedPreset = app.preferences.getStringPreference(PREF_KEY); } catch (e) {}
    if (savedPreset === "") savedPreset = DEFAULT_PRESET;

    var presetIndex = 0;
    for (var p = 0; p < pdfPresets.length; p++) {
        if (pdfPresets[p] === savedPreset) { presetIndex = p; break; }
    }
    dropdownPresets.selection = presetIndex;
    dropdownPresets.preferredSize.width = 330;

    // ---- Right: images, other settings ----
    var pnlRasterP = makePanel(colB, "4. Image rasterization");
    var grpRaster = pnlRasterP.add("group");
    grpRaster.add("statictext", undefined, "DPI:");
    var ddDpi = grpRaster.add("dropdownlist", undefined, ["150", "300"]);
    ddDpi.selection = 0; // 150
    grpRaster.add("statictext", undefined, "Color:");
    var ddColor = grpRaster.add("dropdownlist", undefined, ["CMYK", "RGB"]);
    ddColor.selection = 0; // CMYK
    grpRaster.add("statictext", undefined, "Background:");
    var ddBg = grpRaster.add("dropdownlist", undefined, ["Transparent", "White"]);
    ddBg.selection = 0; // Transparent

    var pnlOther = makePanel(colB, "5. Additional settings");
    var chkSaveAi = pnlOther.add("checkbox", undefined, "Also save baked .ai file(s)");
    chkSaveAi.value = true;

    var chkDisableView = pnlOther.add("checkbox", undefined, "Prevent PDFs from opening automatically");
    chkDisableView.value = false;

    var grpBleed = pnlOther.add("group");
    var chkBleed = grpBleed.add("checkbox", undefined, "Add bleed:");
    chkBleed.value = false;
    var txtBleed = grpBleed.add("edittext", undefined, DEFAULT_BLEED);
    txtBleed.characters = 6;
    txtBleed.enabled = false;
    grpBleed.add("statictext", undefined, "inches (art is trimmed at the bleed mark)");

    chkBleed.onClick = function () { txtBleed.enabled = chkBleed.value; };

    var warningGroup = win.add("group");
    warningGroup.orientation = "column";
    warningGroup.alignChildren = ["center", "top"];
    warningGroup.spacing = 2;
    warningGroup.margins = [0, 5, 0, 0];
    warningGroup.add("statictext", undefined, "Processing runs in the background.");
    warningGroup.add("statictext", undefined, "(Illustrator may look frozen, but it hasn't crashed!)");
    warningGroup.add("statictext", undefined, "Compare the result with the original before sending to a client.");

    var grpButtons = win.add("group"); grpButtons.alignment = ["right", "top"]; grpButtons.margins = [0, 10, 0, 0];
    var btnExport = grpButtons.add("button", undefined, "Export Flexi-Safe Files");
    var btnCancel = grpButtons.add("button", undefined, "Close");

    btnCancel.onClick = function () { win.close(); };
    paintStyle(win);
    styleGreenButton(btnExport, BTN_FLEXI);

    btnExport.onClick = function () {
        if (txtFolder.text === "") { spAlert("Select an output folder."); return; }
        var destFolder = new Folder(txtFolder.text);
        if (!destFolder.exists) { spAlert("Folder does not exist."); return; }

        var presetName = dropdownPresets.selection.text;
        try { app.preferences.setStringPreference(PREF_KEY, presetName); } catch (e) {}

        var customNameInput = txtCustomName.text;
        if (customNameInput === "") customNameInput = cleanDocName + " ";
        var saveAi = chkSaveAi.value;
        var preventOpening = chkDisableView.value;

        var rasterDpi = parseInt(ddDpi.selection.text, 10);
        if (isNaN(rasterDpi) || rasterDpi <= 0) rasterDpi = 150;
        var rasterCMYK = (ddColor.selection.text === "CMYK");
        var rasterTransparent = (ddBg.selection.text === "Transparent");

        var bleedPts = 0;
        if (chkBleed.value) {
            var bleedIn = parseFloat(txtBleed.text);
            if (isNaN(bleedIn) || bleedIn < 0) bleedIn = 0;
            bleedPts = bleedIn * 72;
        }

        var total = doc.artboards.length;
        var exportedCount = 0;

        win.close();

        var originalFile = new File(originalFilePath);
        var prevInteractionLevel = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

        // Declared outside the try so the error handler can clean them up
        var masterTempFile = null;
        var tempAiFile = null;
        var masterDoc = null;
        var tempDoc = null;

        function cleanupTempFiles() {
            try { if (masterDoc) masterDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC0) {}
            try {
                if (tempDoc && tempDoc.name && /^_flexi_temp_/.test(tempDoc.name)) {
                    tempDoc.close(SaveOptions.DONOTSAVECHANGES);
                }
            } catch (eC1) {}
            try { if (tempAiFile && tempAiFile.exists) tempAiFile.remove(); } catch (eC2) {}
            try { if (masterTempFile && masterTempFile.exists) masterTempFile.remove(); } catch (eC3) {}
        }

        function unlockAllLayers(layers) {
            for (var L = 0; L < layers.length; L++) {
                try {
                    if (layers[L].locked) layers[L].locked = false;
                    if (!layers[L].visible) layers[L].visible = true;
                    if (layers[L].layers.length > 0) unlockAllLayers(layers[L].layers);
                } catch (eL) {}
            }
        }

        function containsRaster(item) {
            if (item.typename === "RasterItem" || item.typename === "PlacedItem") return true;
            if (item.typename === "GroupItem" || item.typename === "CompoundPathItem") {
                var kids = (item.typename === "GroupItem") ? item.pageItems : item.pathItems;
                for (var k = 0; k < kids.length; k++) {
                    if (containsRaster(kids[k])) return true;
                }
            }
            return false;
        }

        // Single pass: collect every clip group, innermost FIRST
        function collectClipGroups(container, out) {
            for (var k = 0; k < container.pageItems.length; k++) {
                var it = container.pageItems[k];
                if (it.typename === "GroupItem") {
                    collectClipGroups(it, out);
                    if (it.clipped) out.push(it);
                }
            }
        }

        var bakedVector = 0;
        var rasterizedImgs = 0;
        var failed = 0;
        var textOutlined = 0;
        var trimmed = 0;

        // ---- Vector crop of one clip group (selection-based) ----
        function bakeVectorGroup(dcRef, grp) {
            dcRef.selection = null;
            grp.selected = true;
            try { app.executeMenuCommand("OffsetPath v22"); } catch (eOS) {} // Outline Stroke
            try { app.executeMenuCommand("expandStyle"); } catch (eE1) {}
            app.executeMenuCommand("Live Pathfinder Crop");
            app.executeMenuCommand("expandStyle");
            try { app.executeMenuCommand("group"); } catch (eG) {}
            dcRef.selection = null;
        }

        // ---- Rasterize one image clip group at the CHOSEN settings ----
        // Bounds are padded one output pixel outward so pixel-grid
        // snapping can't leave a transparent sliver at the boundary.
        // Resolution is capped for very large art so Illustrator can't
        // silently collapse it.
        function rasterizeImageGroup(dcRef, grp, sf, boundsRect) {
            var dpi = rasterDpi;

            var target = null;
            if (boundsRect) {
                var pad = 72 / dpi;
                if (pad < 1) pad = 1;
                target = [boundsRect[0] - pad, boundsRect[1] + pad,
                          boundsRect[2] + pad, boundsRect[3] - pad];
            }

            // Cap for physical size (real inches; Large Canvas corrected)
            try {
                var mb = target;
                if (!mb) mb = grp.visibleBounds;
                var wInches = ((mb[2] - mb[0]) / 72) * sf;
                var hInches = ((mb[1] - mb[3]) / 72) * sf;
                if (wInches > 0 && hInches > 0) {
                    var sideCap = Math.floor(MAX_SIDE_PX / Math.max(wInches, hInches));
                    var areaCap = Math.floor(Math.sqrt(MAX_TOTAL_PX / (wInches * hInches)));
                    var cap = Math.min(sideCap, areaCap);
                    if (cap < 36) cap = 36;
                    if (dpi > cap) dpi = cap;
                }
            } catch (eCap) {}

            var ro = new RasterizeOptions();
            // Large Canvas fix: Illustrator reads this resolution in
            // CANVAS units (1/10 real on Large Canvas), so a 150 request
            // produced 15 real DPI. Multiplying by the scale factor makes
            // the requested DPI come out as REAL DPI on any canvas type.
            ro.resolution = dpi * sf;
            ro.transparency = rasterTransparent;
            ro.antiAliasingMethod = AntiAliasingMethod.ARTOPTIMIZED;

            if (target) dcRef.rasterize(grp, target, ro);
            else dcRef.rasterize(grp, undefined, ro);
        }

        // Rectangle intersection for [l, t, r, b] bounds; null if none
        function intersectRect(a, b) {
            var l = Math.max(a[0], b[0]);
            var t = Math.min(a[1], b[1]);
            var r = Math.min(a[2], b[2]);
            var bt = Math.max(a[3], b[3]);
            if (r <= l || t <= bt) return null;
            return [l, t, r, bt];
        }

        // ---- Bake ONE clip group into real geometry ----
        // Vector-only: cropped as vectors. Contains images: children are
        // SPLIT - vector siblings cropped as vectors; image-bearing
        // siblings rasterized at the chosen settings, cut to the mask.
        function bakeClipGroup(dcRef, clipGroup, sf) {
            try {
                if (!containsRaster(clipGroup)) {
                    bakeVectorGroup(dcRef, clipGroup);
                    bakedVector++;
                    return;
                }

                // Find the mask path
                var mask = null;
                var maskIsCompound = false;
                for (var c = 0; c < clipGroup.pageItems.length; c++) {
                    var pi = clipGroup.pageItems[c];
                    if (pi.typename === "PathItem" && pi.clipping) { mask = pi; break; }
                    if (pi.typename === "CompoundPathItem" &&
                        pi.pathItems.length > 0 && pi.pathItems[0].clipping) {
                        mask = pi; maskIsCompound = true; break;
                    }
                }
                if (!mask) {
                    rasterizeImageGroup(dcRef, clipGroup, sf, null);
                    rasterizedImgs++;
                    return;
                }

                var maskBounds = mask.geometricBounds;

                // Split children; dissolve plain groups that MIX images
                // and vectors so vectors never rasterize with a photo
                var queue = [];
                for (var k = 0; k < clipGroup.pageItems.length; k++) {
                    if (clipGroup.pageItems[k] !== mask) queue.push(clipGroup.pageItems[k]);
                }

                while (queue.length > 0) {
                    var kid = queue.shift();
                    try {
                        if (kid.typename === "GroupItem" && !kid.clipped && containsRaster(kid)) {
                            var subs = [];
                            for (var s2 = 0; s2 < kid.pageItems.length; s2++) subs.push(kid.pageItems[s2]);
                            for (var s3 = 0; s3 < subs.length; s3++) {
                                subs[s3].move(kid, ElementPlacement.PLACEBEFORE);
                            }
                            try { kid.remove(); } catch (eKR) {}
                            queue = subs.concat(queue);
                            continue;
                        }

                        var w = dcRef.groupItems.add();
                        w.move(clipGroup, ElementPlacement.PLACEBEFORE);
                        kid.move(w, ElementPlacement.PLACEATEND);

                        var mCopy = mask.duplicate(w, ElementPlacement.PLACEATBEGINNING);
                        try { mCopy.filled = false; mCopy.stroked = false; } catch (eMF) {}
                        if (maskIsCompound) {
                            try { mCopy.pathItems[0].clipping = true; } catch (eMC) {}
                        } else {
                            mCopy.clipping = true;
                        }
                        w.clipped = true;

                        if (containsRaster(kid)) {
                            var kb = null;
                            try { kb = kid.visibleBounds; } catch (eKB) {}
                            var hardBounds = kb ? intersectRect(maskBounds, kb) : maskBounds;
                            rasterizeImageGroup(dcRef, w, sf, hardBounds || maskBounds);
                            rasterizedImgs++;
                        } else {
                            bakeVectorGroup(dcRef, w);
                            bakedVector++;
                        }
                    } catch (eKid) { failed++; }
                }

                try { clipGroup.remove(); } catch (eRm) {}

            } catch (eMask) {
                try {
                    rasterizeImageGroup(dcRef, clipGroup, sf, null);
                    rasterizedImgs++;
                } catch (eFB) {
                    failed++;
                    try { clipGroup.clipped = false; } catch (eRel) {}
                }
                dcRef.selection = null;
            }
        }

        try {
            // ---- 1. Master copy: bake everything ONCE ----
            masterTempFile = new File(destFolder.fsName + "/_flexi_master_build.ai");
            originalFile.copy(masterTempFile);
            masterDoc = app.open(masterTempFile);

            var masterSf = 1;
            try { if (masterDoc.scaleFactor) masterSf = masterDoc.scaleFactor; } catch (eSf) {}

            unlockAllLayers(masterDoc.layers);
            try { app.executeMenuCommand("unlockAll"); } catch (e) {}
            try { app.executeMenuCommand("showAll"); } catch (e) {}

            // Match the chosen rasterization color space. NOTE: this
            // switches the DOCUMENT color mode on the temp copy - if the
            // file was authored in the other mode, vector colors convert
            // too (that's what makes the rasterized images come out in
            // the chosen space).
            try {
                var isCMYK = (masterDoc.documentColorSpace === DocumentColorSpace.CMYK);
                if (rasterCMYK && !isCMYK) app.executeMenuCommand("doc-color-cmyk");
                if (!rasterCMYK && isCMYK) app.executeMenuCommand("doc-color-rgb");
            } catch (eCS) {}

            // Outline all text first (so masks only contain paths)
            if (OUTLINE_TEXT) {
                var tFrames = masterDoc.textFrames;
                for (var t = tFrames.length - 1; t >= 0; t--) {
                    try { tFrames[t].createOutline(); textOutlined++; } catch (eT) {}
                }
            }

            // Bake all clip masks, innermost first
            var clipGroups = [];
            for (var Lr = 0; Lr < masterDoc.layers.length; Lr++) {
                collectClipGroups(masterDoc.layers[Lr], clipGroups);
            }
            for (var cg = 0; cg < clipGroups.length; cg++) {
                bakeClipGroup(masterDoc, clipGroups[cg], masterSf);
            }

            masterDoc.save();
            masterDoc.close(SaveOptions.DONOTSAVECHANGES);
            masterDoc = null;

            // ---- 2. One PDF (+.ai) per artboard from the baked master ----
            for (var i = 0; i < total; i++) {
                var abName = doc.artboards[i].name;
                var cleanArtboardName = abName.replace(/[\/\\:*?"<>|]/g, '-');
                var baseFileName = customNameInput + cleanArtboardName;

                tempAiFile = new File(destFolder.fsName + "/_flexi_temp_" + i + ".ai");
                masterTempFile.copy(tempAiFile);

                tempDoc = app.open(tempAiFile);
                app.activeDocument = tempDoc;

                var tempSf = 1;
                try { if (tempDoc.scaleFactor) tempSf = tempDoc.scaleFactor; } catch (eSf2) {}

                tempDoc.selection = null;
                tempDoc.artboards.setActiveArtboardIndex(i);

                try {
                    app.executeMenuCommand('selectallinartboard');
                    app.executeMenuCommand('hide');
                    app.executeMenuCommand('selectall');
                    app.executeMenuCommand('clear');
                    app.executeMenuCommand('showAll');
                } catch (e) {}

                var abCount = tempDoc.artboards.length;
                for (var a = abCount - 1; a >= 0; a--) {
                    if (a !== i) {
                        try { tempDoc.artboards[a].remove(); } catch (e) {}
                    }
                }

                // ---- Trim anything sticking outside the TRIM BOUNDARY ----
                // (artboard, extended by the bleed amount when bleed is on)
                try {
                    var abR = tempDoc.artboards[0].artboardRect; // [l, t, r, b]
                    var trimR = [abR[0] - bleedPts, abR[1] + bleedPts,
                                 abR[2] + bleedPts, abR[3] - bleedPts];
                    var TOL = 0.5; // pt - ignore hairline overhang
                    var offenders = [];
                    for (var Lt = 0; Lt < tempDoc.layers.length; Lt++) {
                        var layerItems = tempDoc.layers[Lt].pageItems;
                        for (var pi2 = 0; pi2 < layerItems.length; pi2++) {
                            var cand = layerItems[pi2];
                            try {
                                if (cand.typename === "PathItem" && cand.guides) continue;
                                var vb = cand.visibleBounds;
                                if (vb[0] < trimR[0] - TOL || vb[1] > trimR[1] + TOL ||
                                    vb[2] > trimR[2] + TOL || vb[3] < trimR[3] - TOL) {
                                    offenders.push(cand);
                                }
                            } catch (eVb) {}
                        }
                    }
                    for (var of2 = 0; of2 < offenders.length; of2++) {
                        try {
                            var offender = offenders[of2];
                            var trimGroup = tempDoc.groupItems.add();
                            trimGroup.move(offender, ElementPlacement.PLACEBEFORE);
                            offender.move(trimGroup, ElementPlacement.PLACEATEND);
                            var maskRect = trimGroup.pathItems.rectangle(
                                trimR[1], trimR[0], trimR[2] - trimR[0], trimR[1] - trimR[3]);
                            maskRect.stroked = false;
                            maskRect.filled = false;
                            maskRect.clipping = true;
                            trimGroup.clipped = true;

                            bakeClipGroup(tempDoc, trimGroup, tempSf);
                            trimmed++;
                        } catch (eTrim) { failed++; }
                    }
                } catch (eTrimAll) {}

                var pdfTargetFile = new File(destFolder.fsName + "/" + baseFileName + ".pdf");
                var pdfSaveOpts = new PDFSaveOptions();
                pdfSaveOpts.pDFPreset = presetName;
                pdfSaveOpts.preserveEditability = KEEP_EDITABLE; // keeps groups when the PDF is opened
                pdfSaveOpts.viewAfterSaving = !preventOpening;
                pdfSaveOpts.artboardRange = "1";

                // Bleed: exactly what the UI says - preset bleed is overridden
                try {
                    pdfSaveOpts.bleedLink = false;
                    pdfSaveOpts.bleedOffsetRect = [bleedPts, bleedPts, bleedPts, bleedPts];
                } catch (eBleed) {}

                // Highest-quality flattener (only applies when the chosen
                // preset flattens transparency, e.g. PDF/X-1a)
                try { pdfSaveOpts.flattenerPreset = "[High Resolution]"; } catch (eFlat) {}

                tempDoc.saveAs(pdfTargetFile, pdfSaveOpts);

                if (saveAi) {
                    var aiTargetFile = new File(destFolder.fsName + "/" + baseFileName + ".ai");
                    var aiSaveOpts = new IllustratorSaveOptions();
                    aiSaveOpts.pdfCompatible = true;
                    tempDoc.saveAs(aiTargetFile, aiSaveOpts);
                }

                tempDoc.close(SaveOptions.DONOTSAVECHANGES);
                tempDoc = null;
                tempAiFile.remove();
                tempAiFile = null;

                $.gc();

                app.activeDocument = doc;
                exportedCount++;
            }

            masterTempFile.remove();
            masterTempFile = null;

            app.userInteractionLevel = prevInteractionLevel;

            var msg = "Done!\n" + exportedCount + " artboard(s) exported as Flexi-safe files.\n\n" +
                      bakedVector + " vector section(s) baked into geometry\n" +
                      rasterizedImgs + " image section(s) rasterized at " + rasterDpi + " DPI (" +
                      (rasterCMYK ? "CMYK" : "RGB") + ", " +
                      (rasterTransparent ? "transparent" : "white") + " background)\n" +
                      textOutlined + " text frame(s) outlined\n" +
                      trimmed + " object(s) trimmed at the trim boundary";
            if (failed > 0) {
                msg += "\n\n[!] " + failed + " mask(s) could NOT be baked and were released instead - " +
                       "CHECK THE PDFs around complex areas before sending.";
            }
            spAlert(msg);

        } catch (error) {
            app.userInteractionLevel = prevInteractionLevel;
            cleanupTempFiles();
            spAlert("Flexi-Safe Export failed:\n" + error +
                  "\n\nExported before the error: " + exportedCount + " of " + total + " artboards." +
                  "\nYour original file was not modified. Temporary files were cleaned up.");
        }
    };

    win.location = uik().pos();
    win.show();
}

flexiSafeExport();
