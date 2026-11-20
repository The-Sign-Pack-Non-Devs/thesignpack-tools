// ============================================================
//  SQ FT Calculator (UI) 1.5  -  for Adobe Illustrator
//  Author: Joao Victor Malz
//  Copyright: (c) 2026 Joao Victor Malz
//  Created for use at The Sign Pack
//
//  Lists every selected art with its dimensions, the sq ft math, and an editable
//  quantity - then totals everything at the bottom, updating live as you change
//  quantities. Also has a "Scale: X : X" field (default 1:1): "1 : 12" means the art is
//  drawn at 1/12 real size, so measurements are MULTIPLIED by (right / left) to get the
//  true size. It multiplies on top of the automatic Large Canvas correction.
//
//  Usage:
//    1. Select one or more arts/groups (each is calculated separately, clipping masks
//       respected).
//    2. File > Scripts > SQFT Calculator
//
//  Click the total (it selects itself) and press Ctrl+C to copy it.
//  Assumes the document is at real size (1 in = 72 pt).
//  Large Canvas (1/10 scale) documents are detected automatically.
// ============================================================


#target illustrator
#targetengine "sqftcalc"
var TSP_ASSET_SELF = ($.global.__SELF_OVERRIDE ? $.global.__SELF_OVERRIDE : $.fileName);

// ---- Code sent to Illustrator travels as plain hex digits (4 per character): no quotes, backslashes or line
//      breaks for the transport to damage ("Expected: )" errors on some computers) ----
function spSendCode(src) {
    src = String(src);
    var h = "";
    for (var i = 0; i < src.length; i++) {
        var x = src.charCodeAt(i).toString(16);
        while (x.length < 4) x = "0" + x;
        h += x;
    }
    return 'eval((function(h){var r="";for(var i=0;i+4<=h.length;i+=4)r+=String.fromCharCode(parseInt(h.substring(i,i+4),16));return r;})("' + h + '"));';
}

(function () {
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
    var TITLE_PNG = "sqft_title_png.png";
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
    // This window uses a smaller logo (70%) than the UI Kit one, so it lives here.
    var WORDMARK_SMALL = "sqft_wordmark_small.png";
    function addHeaderLogo(parent, w) {
        if (STYLED_UI) {
            try {
                var wf = assetFile(WORDMARK_SMALL);
                if (wf && wf.length > 50) return parent.add("image", undefined, wf);
            } catch (eWs) {}
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
        im.alignment = ["right", "bottom"];
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
    var BTN_ADDTOTAL = { key: "addtotal", w: 136, h: 28, n: "sqft_addtotal_n.png", h2: "sqft_addtotal_h2.png", p: "sqft_addtotal_p.png", d: "sqft_addtotal_d.png" };


    // ------------------ SETTINGS ------------------
    var DECIMALS         = 2;                // decimals shown for sq ft values
    var FONT_NAME        = "Gotham-Medium";  // font for the "+ Add Total SQ FT" label
    var TOTAL_LABEL_SIZE = 48;               // pt - size of the placed total label
    var LAYER_NAME       = "Measurements";   // where the label goes; created if missing
    // ----------------------------------------------

    if (app.documents.length === 0) { spAlert("Open a document first."); return; }
    var doc = app.activeDocument;
    if (doc.selection.length === 0) { spAlert("Select one or more arts first."); return; }

    // Large Canvas documents report coordinates at 1/10 of real size
    var docScale = 1;
    try { if (doc.scaleFactor) docScale = doc.scaleFactor; } catch (eS) {}

    // ---- TRUE bounds (respects clipping masks, skips hidden/guides) ----
    function getItemBounds(item) {
        if (item.hidden) return null;
        if (item.typename === "PathItem" && item.guides) return null;

        if (item.typename === "GroupItem") {
            if (item.clipped) {
                for (var c = 0; c < item.pageItems.length; c++) {
                    var pi = item.pageItems[c];
                    if (pi.typename === "PathItem" && pi.clipping) {
                        return pi.geometricBounds;
                    }
                    if (pi.typename === "CompoundPathItem" &&
                        pi.pathItems.length > 0 && pi.pathItems[0].clipping) {
                        return pi.geometricBounds;
                    }
                }
            }
            var u = null;
            for (var g = 0; g < item.pageItems.length; g++) {
                var cb = getItemBounds(item.pageItems[g]);
                if (!cb) continue;
                if (!u) {
                    u = [cb[0], cb[1], cb[2], cb[3]];
                } else {
                    if (cb[0] < u[0]) u[0] = cb[0];
                    if (cb[1] > u[1]) u[1] = cb[1];
                    if (cb[2] > u[2]) u[2] = cb[2];
                    if (cb[3] < u[3]) u[3] = cb[3];
                }
            }
            if (u) return u;
        }
        return item.geometricBounds;
    }

    function round2(v) {
        var f = Math.pow(10, DECIMALS);
        return Math.round(v * f) / f;
    }
    function fmt(v) {
        // fixed decimals for tidy columns
        return v.toFixed(DECIMALS);
    }

    // ---- Measure every selected item ----
    var rows = [];
    for (var i = 0; i < doc.selection.length; i++) {
        var it = doc.selection[i];
        var b = getItemBounds(it);
        if (!b) continue;

        var wIn = ((b[2] - b[0]) / 72) * docScale;
        var hIn = ((b[1] - b[3]) / 72) * docScale;
        var sqft = (wIn * hIn) / 144;

        rows.push({
            name: (it.name && it.name !== "") ? it.name : null,
            rawW: wIn, rawH: hIn, // before the manual Scale field is applied
            w: wIn, h: hIn, sqft: sqft, qty: 1,
            left: b[0], top: b[1], hPts: (b[1] - b[3])
        });
    }

    if (rows.length === 0) { spAlert("Nothing measurable in the selection."); return; }

    // ---- Sort into view order: top to bottom, left to right ----
    // Items whose tops are within half the smaller item's height are
    // treated as the same visual row and ordered left to right.
    rows.sort(function (a, b) {
        var tol = Math.min(a.hPts, b.hPts) / 2;
        if (Math.abs(a.top - b.top) <= tol) return a.left - b.left;
        return b.top - a.top; // higher on the page first
    });

    // Fallback names follow the sorted (visual) order
    for (var n = 0; n < rows.length; n++) {
        if (!rows[n].name) rows[n].name = "Art " + (n + 1);
    }

    // ---- Build the dialog ----
    // Close a previous instance of the palette if one is still open
    try {
        if ($.global.__sqftWin && $.global.__sqftWin instanceof Window) {
            $.global.__sqftWin.close();
        }
    } catch (ePrev) {}



    var win = new Window("palette", "SQ FT Calculator");
    $.global.__sqftWin = win;
    paintWin(win);   // dark grey first: the UI Kit picks the white logo on a dark window
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = uik().MARGINS;
    win.spacing = uik().SPACING;

    var logoRow = win.add("group");
    logoRow.alignment = ["fill", "top"];
    logoRow.alignChildren = ["left", "bottom"];
    logoRow.spacing = 10;
    logoRow.margins = 0;
    addHeaderLogo(logoRow, win);
    var logoSpacer = logoRow.add("group");
    logoSpacer.alignment = ["fill", "bottom"];
    addHeaderTitle(logoRow, "SQ FT Calculator");
    addAccentLine(win);

    // Column widths
    var W_NAME = 110, W_CALC = 165, W_SQFT = 55, W_QTY = 40, W_SUB = 65;

    // Header
    var header = win.add("group");
    header.spacing = 6;
    function headCell(parent, text, w) {
        var t = parent.add("statictext", undefined, text);
        t.preferredSize.width = w;
        t.graphics.font = ScriptUI.newFont(t.graphics.font.name, "BOLD", t.graphics.font.size);
        return t;
    }
    headCell(header, "Art", W_NAME);
    headCell(header, "Calculation", W_CALC);
    headCell(header, "SQ FT", W_SQFT);
    headCell(header, "Qty", W_QTY);
    headCell(header, "Subtotal", W_SUB);

    // Scrollable area if there are many rows
    var listHost;
    if (rows.length > 10) {
        listHost = win.add("panel");
        listHost.alignChildren = ["fill", "top"];
        listHost.maximumSize.height = 420;
    } else {
        listHost = win;
    }

    var subtotalLabels = [];
    var qtyFields = [];
    var calcLabels = [];
    var sqftLabels = [];

    for (var r = 0; r < rows.length; r++) {
        (function (idx) {
            var row = rows[idx];
            var g = listHost.add("group");
            g.spacing = 6;

            var nameT = g.add("statictext", undefined, row.name);
            nameT.preferredSize.width = W_NAME;

            var calcStr = fmt(row.w) + '" \u00D7 ' + fmt(row.h) + '" \u00F7 144';
            var calcT = g.add("statictext", undefined, calcStr);
            calcT.preferredSize.width = W_CALC;
            calcLabels.push(calcT);

            var sqftT = g.add("statictext", undefined, fmt(round2(row.sqft)));
            sqftT.preferredSize.width = W_SQFT;
            sqftLabels.push(sqftT);

            var qtyE = g.add("edittext", undefined, "1");
            qtyE.preferredSize.width = W_QTY;
            qtyFields.push(qtyE);

            var subT = g.add("statictext", undefined, fmt(round2(row.sqft)));
            subT.preferredSize.width = W_SUB;
            subtotalLabels.push(subT);

            qtyE.onChanging = function () { recalc(); };
            qtyE.onChange   = function () { recalc(); };
        })(r);
    }

    // Scale field - "1 : 12" means the art is drawn at 1/12 real
    // size, so measurements get MULTIPLIED by (right / left) to
    // recover the true size. Default 1:1 changes nothing - same
    // result as before this field existed. Multiplies on top of
    // the automatic Large Canvas (docScale) correction, doesn't
    // replace it.
    var scaleGroup = win.add("group");
    scaleGroup.add("statictext", undefined, "Scale:");
    var scaleLeftE = scaleGroup.add("edittext", undefined, "1");
    scaleLeftE.characters = 4;
    scaleGroup.add("statictext", undefined, ":");
    var scaleRightE = scaleGroup.add("edittext", undefined, "1");
    scaleRightE.characters = 4;

    function getScaleFactor() {
        var l = parseFloat(scaleLeftE.text);
        var r = parseFloat(scaleRightE.text);
        if (isNaN(l) || isNaN(r) || l <= 0 || r <= 0) return 1;
        return r / l;
    }

    scaleLeftE.onChanging  = function () { recalcAll(); };
    scaleLeftE.onChange    = function () { recalcAll(); };
    scaleRightE.onChanging = function () { recalcAll(); };
    scaleRightE.onChange   = function () { recalcAll(); };

    // Divider + total
    win.add("panel").preferredSize.height = 1;

    var totalGroup = win.add("group");
    totalGroup.alignment = "right";
    var totalCaption = totalGroup.add("statictext", undefined, "TOTAL:");
    totalCaption.graphics.font = ScriptUI.newFont(totalCaption.graphics.font.name, "BOLD", totalCaption.graphics.font.size + 2);
    // Read-only edittext: OS-level plain text, so Ctrl+C / Cmd+C works
    // on both Windows and Mac and pastes at whatever size you're typing
    var totalT = totalGroup.add("edittext", undefined, "0");
    totalT.readonly = true;
    totalT.characters = 10;
    totalT.onActivate = function () {
        this.active = true;
        this.textSelection = [0, this.text.length];
    };
    var totalUnit = totalGroup.add("statictext", undefined, "SQ FT");
    totalUnit.graphics.font = ScriptUI.newFont(totalUnit.graphics.font.name, "BOLD", totalUnit.graphics.font.size + 2);

    function recalc() {
        var total = 0;
        for (var k = 0; k < rows.length; k++) {
            var q = parseFloat(qtyFields[k].text);
            if (isNaN(q) || q < 0) q = 0;
            rows[k].qty = q;
            var sub = round2(rows[k].sqft) * q;
            subtotalLabels[k].text = fmt(sub);
            total += sub;
        }
        totalT.text = fmt(total); // number only - this is what gets copied
    }

    // Applies the manual Scale field to every row's raw dimensions,
    // updates the Calculation/SQ FT columns, then re-runs recalc()
    // for subtotals/total. Called once at start and on every edit
    // to either scale field.
    function recalcAll() {
        var sf = getScaleFactor();
        for (var m = 0; m < rows.length; m++) {
            var row = rows[m];
            row.w = row.rawW * sf;
            row.h = row.rawH * sf;
            row.sqft = (row.w * row.h) / 144;
            calcLabels[m].text = fmt(row.w) + '" \u00D7 ' + fmt(row.h) + '" \u00F7 144';
            sqftLabels[m].text = fmt(round2(row.sqft));
        }
        recalc();
    }
    recalcAll();

    // Note at the bottom
    var note = win.add("statictext", undefined,
        "Tip: click the total, then Ctrl+C (Cmd+C on Mac) to copy the number.");
    note.alignment = "right";

    // ---- Places "TOTAL SQ FT: XX" at the center of the current view ----
    // Self-contained (no outside variables) because it's sent through
    // BridgeTalk - the reliable way to modify the document from a
    // floating palette without PARM errors.
    function addTotalLabel(totalStr, fontName, fontSize, layerName) {
        try {
            var doc = app.activeDocument;

            var lay = null;
            for (var i = 0; i < doc.layers.length; i++) {
                if (doc.layers[i].name.toLowerCase() === layerName.toLowerCase()) {
                    lay = doc.layers[i];
                    break;
                }
            }
            if (!lay) {
                lay = doc.layers.add();
                lay.name = layerName;
                lay.zOrder(ZOrderMethod.BRINGTOFRONT);
            }
            var wasLocked = lay.locked;
            lay.locked = false;
            lay.visible = true;

            var black;
            if (doc.documentColorSpace === DocumentColorSpace.CMYK) {
                black = new CMYKColor();
                black.cyan = 0; black.magenta = 0; black.yellow = 0; black.black = 100;
            } else {
                black = new RGBColor();
                black.red = 0; black.green = 0; black.blue = 0;
            }

            var tf = lay.textFrames.add();
            tf.contents = "TOTAL SQ FT: " + totalStr;
            var attrs = tf.textRange.characterAttributes;

            var f = null;
            try { f = app.textFonts.getByName(fontName); } catch (e1) {}
            if (!f) {
                for (var k = 0; k < app.textFonts.length; k++) {
                    var n = app.textFonts[k].name.toLowerCase();
                    if (n.indexOf("gotham") !== -1 && n.indexOf("medium") !== -1 &&
                        n.indexOf("italic") === -1) {
                        f = app.textFonts[k];
                        break;
                    }
                }
            }
            try { if (f) attrs.textFont = f; } catch (e2) {}
            try { attrs.size = fontSize; } catch (e3) {}
            try { attrs.fillColor = black; } catch (e4) {}

            var c = doc.activeView.centerPoint;
            tf.position = [c[0] - tf.width / 2, c[1] + tf.height / 2];

            lay.locked = wasLocked;
            app.redraw();
        } catch (eAll) {
            spAlert("Couldn't add the total label: " + eAll);
        }
    }

    // Buttons
    var btns = win.add("group");
    btns.alignment = "right";
    var addBtn = btns.add("button", undefined, "+ Add Total SQ FT");
    addBtn.onClick = function () {
        var bt = new BridgeTalk();
        bt.target = "illustrator";
        bt.body = spSendCode(uik().popupDefs + "(" + String(addTotalLabel) + ')("' + totalT.text + '", "' +
                  FONT_NAME + '", ' + TOTAL_LABEL_SIZE + ', "' + LAYER_NAME + '");');
        bt.send();
    };
    var closeBtn = btns.add("button", undefined, "Close", { name: "ok" });
    closeBtn.onClick = function () { win.close(); };
    paintStyle(win);
    styleGreenButton(addBtn, BTN_ADDTOTAL);

    win.location = uik().pos();
    win.show();

})();
