// ============================================================
//  Preflight Check 1.1
//  Author: Joao Victor Malz
//  Copyright: (c) 2026 Joao Victor Malz
//  Created for use at The Sign Pack
//
//  Checks the open file before export. Two sections, every row shows a status icon:
//    green check = OK, yellow triangle = warning, red cross = wrong, grey dash = not run.
//
//  STANDARD CHECKS (always, every job):
//    Image DPI, Unused swatches, Text (live / missing font / overset),
//    File color mode, Open paths (production layers only),
//    Clipping masks (hidden ones are red), External links.
//
//  SIGN TYPE CHECKS (pick the sign type in the dropdown). The list of sign types and
//  the layers each one needs come from "Sign_Types_x.x.json"; the Client list from
//  "Clients_x.x.json" (both in the same folder as this script).
//    Layers: every layer of the sign type must exist (missing = wrong), with its exact
//            name (a different spelling = wrong, only capitals / spaces = warning)
//            and the right layer colour. The Fix button creates / renames / recolours.
//    Layer Art: on layers with a rule, paths need the stroke (1 pt) and colour
//            (100% black or 100% magenta / CutContour spot). Free layers are not checked.
//    Plus: hairline strokes, stacked duplicates, items off the artboard, artboard size.
//  Scope: with nothing selected the whole file is checked (or the artboard picked in the
//  list); with something selected only that art is checked (the layers are always checked
//  for the whole file).
//
//  "View" on a row lists its items below; double-click an item to jump to it. All
//  read-only except the focus/select action. Thresholds and production layer names
//  are in SETTINGS below.
// ============================================================


#target illustrator
#targetengine "signpack_preflight"
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

// Message handed back to Sign Pack Tools (the status bar shows it): SUCCESS: / WARNING: / ERROR:
var TSP_NAME = "Preflight Check 1.1";
var TSP_RESULT = "";

// ==================== SETTINGS ====================
var SETTINGS = {
    DPI_WARN: 150,                 // below this = warning
    DPI_BAD: 100,                  // below this = red
    HAIRLINE_MIN_PT: 0.5,
    OVERHANG_BLEED_INCHES: 0,      // General / vinyl: art past the artboard
    ARTBOARD_MIN_INCHES: 1,
    ARTBOARD_MAX_INCHES: 600,
    MIN_AVG_THICKNESS_INCHES: 0.08,// thin-shape heuristic (avg, not narrowest)
    MIN_VINYL_WIDTH_INCHES: 0.125, // narrowest part of a vinyl piece (e.g. stem of a letter)
    MIN_THIN_EDGE_INCHES: 0.6,     // ...only flagged if the narrow part runs this long (ignores sharp tips)
    NARROW_SKIP_AVG_INCHES: 0.5,   // big plain pieces (avg thickness above this) are skipped
    NARROW_MAX_SHAPES: 300,        // safety cap for the narrowest-width check
    MIN_ITEM_WIDTH_INCHES: 0.2,    // undersized items / islands. mm = in x 25.4
    MIN_ITEM_HEIGHT_INCHES: 0.2,
    MIN_GAP_INCHES: 0.06,          // optional tight-gap check (bounding boxes)
    GAP_MAX_ITEMS: 400,            // gap check is O(n^2), skip above this
    MAX_IMAGE_ROWS: 100,           // images listed in the Image DPI row
    MAX_ROWS: 50,                  // per-check cap on listed items
    // A layer is a "production layer" if its name CONTAINS any of these
    // (case-insensitive). Used by open paths, cut layer, stroke-only,
    // print-vs-cut bleed. EDIT to match your layer names.
    PRODUCTION_LAYER_KEYS: ["cut", "route", "contour", "thru", "outline", "hole", "whiteink"],
    CUT_SPOT_NAME: "CutContour"    // spot color name (must be 100% M)
};
// ====================================================

// ==================== CLIENT PRESETS ====================
// The real list is read from Clients_x.x.json (same folder) when the script starts;
// this built-in list is only the fallback if that file is missing. A client can
// override any SETTINGS value above and, per sign type, only the fields that differ.
// To add a client, edit Clients_x.x.json (see the notes inside it).
var CLIENTS = [
    { label: "The Sign Pack - Production", settings: {}, mode: "production" },
    { label: "The Sign Pack - Design", settings: {}, mode: "design" }
];
// Design mode runs fewer checks: only the rows listed here (plus any Bleed row).
// Edit these lists to move a check between Production and Design.
var DESIGN_STANDARD = ["Image DPI", "Unused Swatches", "Named Colors", "Text (live / fonts)", "File Color Mode", "External Links"];
var DESIGN_JOB = ["Sheet Notes", "Layers", "Extra Layers", "Layer Art (stroke / colour)", "Hairline Strokes", "Items Off Artboard", "Artboard Size"];
var CURRENT_MODE = "production";
var CURRENT_CLIENT = null;
function modeAllows(kind, label) {
    if (CURRENT_MODE !== "design") return true;
    var list = (kind === "std") ? DESIGN_STANDARD : DESIGN_JOB;
    for (var i = 0; i < list.length; i++) if (list[i] === label) return true;
    if (kind === "job" && (label.indexOf("Bleed") === 0 || label.indexOf("No Bleed") === 0)) return true;
    return false;
}
var BASE_SETTINGS = {};
(function () { for (var k in SETTINGS) BASE_SETTINGS[k] = SETTINGS[k]; })();
function applyClientSettings(client) {
    CURRENT_CLIENT = client || null;
    CURRENT_MODE = (client && client.mode) ? client.mode : "production";
    for (var k in BASE_SETTINGS) SETTINGS[k] = BASE_SETTINGS[k];
    if (client && client.settings) for (var o in client.settings) SETTINGS[o] = client.settings[o];
}
// ========================================================

var SELF_PATH = "";
try { SELF_PATH = $.global.__SELF_OVERRIDE ? $.global.__SELF_OVERRIDE : $.fileName; $.global.__SELF_OVERRIDE = null; } catch (eSP) {}
    // ---- UI Kit: logo, popups and standard sizes live in ONE shared file ----
    // Needs "UI_Kit_x.x.jsx" in the same folder as this script (the highest version
    // is used). If it is missing the script still works: plain system popups, no logo.
    var UIK_SELF = "";
    try { UIK_SELF = SELF_PATH; } catch (eUS) {}
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
    var TITLE_PNG = "pf_title_png.png";
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
    var BTN_FIX = { key: "fix", w: 84, h: 28, n: "pf_fix_n.png", h2: "pf_fix_h2.png", p: "pf_fix_p.png", d: "pf_fix_d.png" };
    var BTN_ADDLABEL = { key: "addlabel", w: 84, h: 28, n: "pf_addlabel_n.png", h2: "pf_addlabel_h2.png", p: "pf_addlabel_p.png", d: "pf_addlabel_d.png" };


    // ---- Data files: JSON first (an old .jsx copy stays as a backup) ----
    function spCmpVer(a, b) {
        var len = (a.length > b.length) ? a.length : b.length;
        for (var n = 0; n < len; n++) {
            var x = parseInt(a[n] || "0", 10), y = parseInt(b[n] || "0", 10);
            if (x !== y) return (x > y) ? 1 : -1;
        }
        return 0;
    }
    function spBefore(x, y) {
        var c = spCmpVer(x.ver, y.ver);
        if (c !== 0) return c > 0;
        return x.isJson && !y.isJson;
    }
    // Finds "<base> x.x.json" (and, if withJsx, ".jsx") next to the script.
    // Highest version first; with the same version the .json goes first.
    function spFindData(scriptPath, base, withJsx) {
        var list = [];
        try {
            var rx = new RegExp("^" + base + "(?:[ _]*v?(\\d+(?:\\.\\d+)*))?\\.(json" + (withJsx ? "|jsx" : "") + ")$", "i");
            var files = new File(scriptPath).parent.getFiles();
            for (var i = 0; i < files.length; i++) {
                if (!(files[i] instanceof File)) continue;
                var nm = decodeURI(files[i].name);
                var m = nm.match(rx);
                if (!m) continue;
                list.push({ file: files[i], name: nm, ver: (m[1] || "0").split("."), isJson: (m[2].toLowerCase() === "json") });
            }
        } catch (eFind) {}
        for (var a = 1; a < list.length; a++) {
            var cur = list[a], b = a - 1;
            while (b >= 0 && spBefore(cur, list[b])) { list[b + 1] = list[b]; b--; }
            list[b + 1] = cur;
        }
        return list;
    }
    function spReadJson(f) {
        f.encoding = "UTF-8";
        if (!f.open("r")) throw new Error("the file could not be opened");
        var txt = f.read();
        f.close();
        if (txt.charCodeAt(0) === 0xFEFF) txt = txt.substr(1);
        txt = txt.replace(/^\s+/, "");
        if (txt.charAt(0) !== "{") throw new Error("it does not look like a JSON file");
        return eval("(" + txt + ")");
    }
    function spIsArray(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
    // Problem text for one sign type (or, with partial, for an override that lists only some fields). "" = fine.
    function spTypeProblem(st, nm, partial) {
        var okEl = { black: 1, magenta: 1 };
        if (!st || typeof st !== "object") return nm + ": not a valid entry.";
        if (!partial && (typeof st.label !== "string" || st.label === "")) return nm + ": missing label.";
        if (st.notes !== undefined && !spIsArray(st.notes)) return nm + ": notes must be a list of texts.";
        if (st.addNotes !== undefined && !spIsArray(st.addNotes)) return nm + ": addNotes must be a list of texts.";
        if (!partial && !spIsArray(st.layers)) return nm + ": missing the layers list.";
        if (st.layers !== undefined) {
            if (!spIsArray(st.layers)) return nm + ": layers must be a list.";
            for (var i = 0; i < st.layers.length; i++) {
                var ly = st.layers[i];
                if (!ly || typeof ly.name !== "string" || ly.name === "") return nm + ": layer #" + (i + 1) + " has no name.";
                if (typeof ly.color !== "string" || ly.color === "") return nm + ": layer \"" + ly.name + "\" has no color.";
                if (ly.stroke !== undefined && ly.stroke !== null && typeof ly.stroke !== "number") return nm + ": layer \"" + ly.name + "\": stroke must be a number or null.";
                if (ly.element !== undefined && ly.element !== null && !okEl[ly.element]) return nm + ": layer \"" + ly.name + "\": element must be \"black\", \"magenta\" or null.";
            }
        }
        return "";
    }

    // ---- Sign Types (shared file) -------------------------------------
    // Loads the highest "Sign_Types_x.x.json" found in the same folder as this
    // script (the old "Sign_Types_x.x.jsx" is used only if the .json is missing or
    // broken). Returns { version, defaultType, types, source } or null (after an
    // error window, unless quiet).
    function loadSignTypes(scriptPath, scriptTitle, quiet) {
        function fail(title, lines) {
            if (quiet) return null;
            try {
                var d = new Window("dialog", title);
                d.orientation = "column";
                d.alignChildren = ["fill", "top"];
                d.margins = 20;
                d.spacing = 12;
                var h = d.add("statictext", undefined, title);
                try { h.graphics.font = ScriptUI.newFont("dialog", "BOLD", uik().TITLE_SIZE); } catch (eF1) {}
                var t = d.add("statictext", undefined, lines.join("\n"), { multiline: true });
                t.preferredSize = [480, 20 * (lines.length + 3)];
                var g = d.add("group");
                g.alignment = ["center", "top"];
                var okb = g.add("button", undefined, "OK", { name: "ok" });
                okb.preferredSize.width = 100;
                d.center();
                d.show();
            } catch (eW) {
                alert(title + "\n\n" + lines.join("\n"));
            }
            return null;
        }
        var cands = spFindData(scriptPath, "Sign[ _]Types", true);
        var where = "";
        try { where = new File(scriptPath).parent.fsName; } catch (eWh) {}
        if (cands.length === 0) {
            return fail("Sign Types file missing", [
                scriptTitle + " needs the Sign Types file to run, and it was not found in this folder:",
                where,
                "",
                "Download the latest \"Sign_Types_x.x.json\" and put it in the same folder as " + scriptTitle + ", then run it again."
            ]);
        }
        var firstProblems = null, firstName = "";
        for (var ci = 0; ci < cands.length; ci++) {
            var cand = cands[ci];
            var data = null, problems = [];
            if (cand.isJson) {
                try { data = spReadJson(cand.file); } catch (eJ) { problems.push("Could not read the file: " + eJ); }
            } else {
                $.global.__SIGNPACK_LOADING = true;
                $.global.__SIGNPACK_SIGN_TYPES = null;
                try { $.evalFile(cand.file); } catch (eLoad) { problems.push("Could not read the file: " + eLoad); }
                $.global.__SIGNPACK_LOADING = false;
                data = $.global.__SIGNPACK_SIGN_TYPES;
                $.global.__SIGNPACK_SIGN_TYPES = null;
            }
            if (problems.length === 0) {
                if (!data || !data.types || !spIsArray(data.types) || !data.types.length) {
                    problems.push("It does not contain any sign types.");
                } else {
                    for (var s = 0; s < data.types.length && problems.length < 6; s++) {
                        var st = data.types[s];
                        var pr = spTypeProblem(st, (st && st.label) ? st.label : ("Sign type #" + (s + 1)), false);
                        if (pr) problems.push(pr);
                    }
                }
            }
            if (problems.length === 0) {
                if (!data.colors || typeof data.colors !== "object") data.colors = {};
                if (!data.version) data.version = cand.ver.join(".");
                if (!data.defaultType) data.defaultType = data.types[0].label;
                data.source = cand.isJson ? "json" : "jsx";
                return data;
            }
            if (!firstProblems) { firstProblems = problems; firstName = cand.name; }
        }
        var lines = ["The Sign Types file (" + firstName + ") has a problem:", ""];
        for (var q = 0; q < firstProblems.length; q++) lines.push(firstProblems[q]);
        lines.push("");
        lines.push("Fix the file, or download the latest one and put it in the same folder as " + scriptTitle + ".");
        return fail("Sign Types file problem", lines);
    }

    // ---- Client profiles (Clients_x.x.json, optional) ----
    // A client lists only what is DIFFERENT from The Sign Pack standard. If the file is
    // missing or broken, the built-in standard profiles are used (and a broken file is reported once).
    function spClientDefaults() {
        return [
            { label: "The Sign Pack - Production", mode: "production", settings: {}, "export": { preset: "", bleed: "none" }, signTypes: {} },
            { label: "The Sign Pack - Design", "for": ["preflight"], mode: "design", settings: {}, signTypes: {} }
        ];
    }
    // forScript: "preflight" | "helper" | "export". Returns { version, source, clients, problem }.
    function loadClients(scriptPath, forScript, quiet) {
        var problems = [], raw = null, ver = "built-in", src = "built-in";
        var cands = spFindData(scriptPath, "Clients", false);
        if (cands.length > 0) {
            try {
                raw = spReadJson(cands[0].file);
                if (!raw || !spIsArray(raw.clients) || raw.clients.length === 0) {
                    problems.push(cands[0].name + " has no clients list.");
                    raw = null;
                } else {
                    ver = raw.version ? String(raw.version) : cands[0].ver.join(".");
                    src = "json";
                }
            } catch (eRead) {
                problems.push("Could not read " + cands[0].name + ": " + eRead);
                raw = null;
            }
        }
        function build(list, report) {
            var out = [], seen = {};
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                if (!c || typeof c.label !== "string" || c.label === "") { if (report) problems.push("Client #" + (i + 1) + ": missing label."); continue; }
                if (c.enabled === false) continue;
                var only = spIsArray(c["for"]) ? c["for"] : null;
                if (only) {
                    var okFor = false;
                    for (var k = 0; k < only.length; k++) if (String(only[k]).toLowerCase() === forScript) okFor = true;
                    if (!okFor) continue;
                }
                if (seen[c.label]) { if (report) problems.push("Client \"" + c.label + "\" is listed twice (the first one is used)."); continue; }
                seen[c.label] = true;
                var sts = {}, ov = (c.signTypes && typeof c.signTypes === "object") ? c.signTypes : {};
                for (var tn in ov) {
                    var pr = spTypeProblem(ov[tn], c.label + " / " + tn, true);
                    if (pr) { if (report) problems.push(pr); } else sts[tn] = ov[tn];
                }
                out.push({
                    label: c.label,
                    mode: (c.mode === "design") ? "design" : "production",
                    settings: (c.settings && typeof c.settings === "object") ? c.settings : {},
                    exp: (c["export"] && typeof c["export"] === "object") ? c["export"] : {},
                    signTypes: sts
                });
            }
            return out;
        }
        var clients = raw ? build(raw.clients, true) : [];
        if (clients.length === 0) {
            if (raw) problems.push("No usable client was found in the file.");
            clients = build(spClientDefaults(), false);
            ver = "built-in";
            src = "built-in";
        }
        if (problems.length > 0 && !quiet) {
            try {
                if (!$.global.__SIGNPACK_CLIENTS_WARNED) {
                    $.global.__SIGNPACK_CLIENTS_WARNED = true;
                    uik().spAlert("The Clients file has a problem:\n\n- " + problems.join("\n- ") + "\n\nThe entries with problems are skipped. If nothing usable is left, the standard The Sign Pack profiles are used.", "Clients file problem");
                }
            } catch (eWarn) {}
        }
        return { version: ver, source: src, clients: clients, problem: problems.join("\n") };
    }
    function findClientByLabel(list, label) {
        for (var i = 0; i < list.length; i++) if (list[i].label === label) return list[i];
        return null;
    }
    // The sign type as this client wants it: the standard entry with the client's changes on top.
    function applyClientToType(t, client) {
        var ov = (client && client.signTypes) ? client.signTypes[t.label] : null;
        if (!ov) return t;
        var r = {}, k;
        for (k in t) r[k] = t[k];
        for (k in ov) {
            if (k === "addNotes" || k === "label") continue;
            r[k] = ov[k];
        }
        if (ov.addNotes && ov.addNotes.length) r.notes = (r.notes || []).concat(ov.addNotes);
        return r;
    }

    // ---- Open another script of the toolkit (same folder as this one) ----
    function findSibling(scriptPath, rx) {
        try {
            var files = new File(scriptPath).parent.getFiles();
            var best = null, bestV = null;
            for (var i = 0; i < files.length; i++) {
                if (!(files[i] instanceof File)) continue;
                var m = decodeURI(files[i].name).match(rx);
                if (!m) continue;
                var v = (m[1] || "0").split(".");
                var newer = !bestV;
                if (bestV) {
                    var len = (v.length > bestV.length) ? v.length : bestV.length;
                    for (var n = 0; n < len; n++) {
                        var x = parseInt(v[n] || "0", 10), y = parseInt(bestV[n] || "0", 10);
                        if (x !== y) { newer = (x > y); break; }
                    }
                }
                if (newer) { best = files[i]; bestV = v; }
            }
            return best;
        } catch (eFs) { return null; }
    }
    // Starts the script in its own persistent engine (so its window stays open).
    function launchScript(f, engineName) {
        function lit(str) { return '"' + String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"'; }
        var bt = new BridgeTalk();
        bt.target = "illustrator";
        bt.body = '#targetengine "' + engineName + '"\n' + spSendCode('$.global.__SELF_OVERRIDE = ' + lit(f.fsName) + ';$.evalFile(new File(' + lit(f.fsName) + '));');
        bt.onError = function (er) { spAlert("Could not open " + decodeURI(f.name) + ":\n" + (er && er.body ? er.body : er)); };
        bt.send();
    }
    function addSignTypesTag(parent, ver) {
        try {
            var vt = parent.add("statictext", undefined, "Sign Types " + ver);
            vt.keepColor = true;
            try { vt.graphics.foregroundColor = vt.graphics.newPen(vt.graphics.PenType.SOLID_COLOR, [0.55, 0.55, 0.55], 1); } catch (eC) {}
            return vt;
        } catch (eT) { return null; }
    }

function main() {
    // JOBMODE: this copy of the script was started inside Illustrator's main engine by the
    // palette, only to scan the document (the palette engine can lose access to the document).
    var JOBMODE = ($.global.__PF_JOB ? true : false);
    if (JOBMODE && app.documents.length === 0) {
        $.global.__PF_JOB = null;
        $.global.__PF_RESULT = "({nodoc:true})";
        return;
    }
    if (app.documents.length === 0) {
        spAlert("Please open a document first.");
        TSP_RESULT = "ERROR: " + TSP_NAME + ": no document is open.";
        return;
    }

    var doc = app.activeDocument;
    var sf = 1;
    var topCache = null;
    var topLayerCache = null;
    var pathColorCache = null;  // fill / stroke color of every path, read once per scan
    var gapEnabled = false;
    var curType = null;
    var scopeIdx = -1;          // -1 = all artboards, otherwise the artboard being checked
    var scopeRect = null;
    var selRect = null;         // union of the selected items (only while scanning, and only when no artboard is picked)
    var selCount = 0;

    function docIsAlive(d) {
        try { var n = d.name; var c = d.artboards.length; return true; } catch (e) { return false; }
    }
    // Returns true if a usable document was found.
    function refreshDoc() {
        var cand = null;
        // 1) the active document (can throw while the palette has focus)
        try { if (app.documents.length > 0) cand = app.activeDocument; } catch (e1) { cand = null; }
        // 2) otherwise keep the one we have, if it still exists
        // 2) otherwise just keep the one we already have (trusted; never re-tested,
        //    because the test itself can throw while the palette has focus)
        if (!cand) cand = doc;
        // 3) otherwise any open document
        if (!cand) {
            try { if (app.documents.length > 0) cand = app.documents[0]; } catch (e2) { cand = null; }
        }
        if (!cand) { topCache = null; topLayerCache = null; pathColorCache = null; return false; }
        doc = cand;
        sf = 1;
        try { if (doc.scaleFactor) sf = doc.scaleFactor; } catch (eSf) {}
        topCache = null;
        topLayerCache = null;
        pathColorCache = null;
        try {
            if (scopeIdx >= 0 && scopeIdx < doc.artboards.length) scopeRect = doc.artboards[scopeIdx].artboardRect;
            else { scopeIdx = -1; scopeRect = null; }
        } catch (eScope) { scopeIdx = -1; scopeRect = null; }
        selRect = null; selCount = 0;
        if (JOBMODE && scopeIdx < 0) {
            try {
                var sel = doc.selection;
                if (sel && sel.length > 0) {
                    for (var si = 0; si < sel.length; si++) {
                        var vb = null;
                        try { vb = sel[si].geometricBounds; } catch (eVb) { vb = null; }
                        if (!vb) continue;
                        if (!selRect) selRect = [vb[0], vb[1], vb[2], vb[3]];
                        else {
                            if (vb[0] < selRect[0]) selRect[0] = vb[0];
                            if (vb[1] > selRect[1]) selRect[1] = vb[1];
                            if (vb[2] > selRect[2]) selRect[2] = vb[2];
                            if (vb[3] < selRect[3]) selRect[3] = vb[3];
                        }
                        selCount++;
                    }
                }
            } catch (eSel) { selRect = null; selCount = 0; }
        }
        return true;
    }
    refreshDoc();

    // ---- Unit helpers (Large Canvas safe) -----------------------
    function inD(inches) { return inches * 72 / sf; }          // inches -> doc units
    function toIn(v) { return (v * sf) / 72; }                 // doc units -> inches
    function f3(v) { return (Math.round(v * 1000) / 1000).toFixed(3); }

    function mk(sev, check, name, detail, collection, idx) {
        return { sev: sev, check: check, name: name, detail: detail, collection: collection, idx: idx };
    }

    // ---- Shared helpers ----------------------------------------
    function getTrueBounds(item) {
        if (!item || item.hidden) return null;
        if (item.typename === "PathItem" && item.guides) return null;
        if (item.typename === "GroupItem") {
            if (item.clipped) {
                for (var c = 0; c < item.pageItems.length; c++) {
                    var pi = item.pageItems[c];
                    if (pi.typename === "PathItem" && pi.clipping) return pi.geometricBounds;
                    if (pi.typename === "CompoundPathItem" &&
                        pi.pathItems.length > 0 && pi.pathItems[0].clipping) return pi.geometricBounds;
                }
            }
            var u = null;
            for (var g = 0; g < item.pageItems.length; g++) {
                var cb = getTrueBounds(item.pageItems[g]);
                if (!cb) continue;
                if (!u) { u = [cb[0], cb[1], cb[2], cb[3]]; }
                else {
                    if (cb[0] < u[0]) u[0] = cb[0];
                    if (cb[1] > u[1]) u[1] = cb[1];
                    if (cb[2] > u[2]) u[2] = cb[2];
                    if (cb[3] < u[3]) u[3] = cb[3];
                }
            }
            return u;
        }
        return item.geometricBounds;
    }

    function isTopLevel(it) {
        try { return it.parent && it.parent.typename === "Layer"; } catch (e) { return false; }
    }

    // Hidden itself, in a hidden group, or on a hidden layer.
    function effHidden(it) {
        var p = it, guard = 0;
        while (p && guard++ < 60) {
            try {
                if (p.typename === "Layer") { if (!p.visible) return true; }
                else if (p.typename === "Document") break;
                else if (p.hidden) return true;
            } catch (e1) {}
            try { p = p.parent; } catch (e2) { break; }
        }
        return false;
    }

    function matchesProd(name) {
        var n = normName(name);
        for (var k = 0; k < SETTINGS.PRODUCTION_LAYER_KEYS.length; k++) {
            if (n.indexOf(normName(SETTINGS.PRODUCTION_LAYER_KEYS[k])) >= 0) return true;
        }
        return false;
    }
    function onProdLayer(it) {
        var p = it, guard = 0;
        while (p && guard++ < 60) {
            try {
                if (p.typename === "Layer" && matchesProd(p.name)) return true;
                if (p.typename === "Document") break;
                p = p.parent;
            } catch (e) { break; }
        }
        return false;
    }
    function layerNameOf(it) {
        var p = it, guard = 0;
        while (p && guard++ < 60) {
            try {
                if (p.typename === "Layer") return p.name;
                p = p.parent;
            } catch (e) { break; }
        }
        return "(no layer)";
    }

    // Layer-name helpers (CutContour / BoundingBox / routed layers)
    function normName(n) { return ("" + n).toLowerCase().replace(/[\s_\-]/g, ""); }
    function isCutLayerName(n) { return normName(n).indexOf("cutcontour") >= 0; }
    function isOutlineLayerName(n) { return normName(n).indexOf("outline") === 0; }
    function isHolesLayerName(n) { return normName(n).indexOf("hole") >= 0; }
    function isWhiteInkLayerName(n) { return normName(n).indexOf("whiteink") >= 0; }
    function isBBoxLayerName(n) { var x = normName(n); return x.indexOf("boundingbox") >= 0 || x.indexOf("bbox") >= 0; }
    function isRoutedLayerName(n) { return normName(n).indexOf("rout") >= 0; }
    function isCutSpotName(n) { return normName(n) === normName(SETTINGS.CUT_SPOT_NAME); }
    function onLayerWhere(it, test) {
        var p = it, guard = 0;
        while (p && guard++ < 60) {
            try {
                if (p.typename === "Layer" && test(p.name)) return true;
                if (p.typename === "Document") break;
                p = p.parent;
            } catch (e) { break; }
        }
        return false;
    }

    // Top-level items with true bounds, computed once per scan.
    // kind: "cut", "bbox", "outline", "holes", "white" (production layers) or "art" (everything else)
    // doc.pageItems lists EVERY item, nested ones too, and asking each one for
    // its parent is slow. Do it once per scan and let every check share the result.
    function anySubLayers(layers) {
        for (var q = 0; q < layers.length; q++) {
            try { if (layers[q].layers.length > 0) return true; } catch (eQ) { return true; }
        }
        return false;
    }
    // idx for items found through their layer: "L<layer>:<item>" (e.g. "L2:15"), turned back
    // into the item by resolveTopIdx. Plain numbers still mean doc.pageItems[number].
    function resolveTopIdx(d, idx) {
        if (typeof idx !== "string") return d.pageItems[idx];
        var m = idx.match(/^L(\d+):(\d+)$/);
        if (!m) return null;
        return d.layers[parseInt(m[1], 10)].pageItems[parseInt(m[2], 10)];
    }
    function getTopLayerItems() {
        if (topLayerCache) return topLayerCache;
        topLayerCache = [];
        // Fast way: only when no layer has sub-layers (then every item a layer lists is top-level)
        try {
            var lays = doc.layers;
            if (!anySubLayers(lays)) {
                var fast = [];
                for (var la = 0; la < lays.length; la++) {
                    var lItems = lays[la].pageItems;
                    for (var lk = 0; lk < lItems.length; lk++) {
                        try { fast.push({ it: lItems[lk], idx: "L" + la + ":" + lk }); } catch (eL) {}
                    }
                }
                topLayerCache = fast;
                return topLayerCache;
            }
        } catch (eFast) { topLayerCache = []; }
        var flat0 = doc.pageItems;
        for (var i0 = 0; i0 < flat0.length; i0++) {
            try {
                var it0 = flat0[i0];
                if (isTopLevel(it0)) topLayerCache.push({ it: it0, idx: i0 });
            } catch (e0) {}
        }
        return topLayerCache;
    }
    function getTop() {
        if (topCache) return topCache;
        topCache = [];
        var flat = getTopLayerItems();
        for (var i = 0; i < flat.length; i++) {
            try {
                var it = flat[i].it;
                var gi = flat[i].idx;
                if (!inScope(it)) continue;
                if (effHidden(it)) continue;
                var tb = getTrueBounds(it);
                if (!tb) continue;
                var kind = "art";
                if (onLayerWhere(it, isCutLayerName)) kind = "cut";
                else if (onLayerWhere(it, isBBoxLayerName)) kind = "bbox";
                else if (onLayerWhere(it, isOutlineLayerName)) kind = "outline";
                else if (onLayerWhere(it, isHolesLayerName)) kind = "holes";
                else if (onLayerWhere(it, isWhiteInkLayerName)) kind = "white";
                topCache.push({ it: it, idx: gi, tb: tb, kind: kind });
            } catch (e) {}
        }
        return topCache;
    }
    function getArt() {
        var all = getTop(), out = [];
        for (var i = 0; i < all.length; i++) if (all[i].kind === "art") out.push(all[i]);
        return out;
    }
    // True when the item touches the artboard being checked (always true for "All artboards")
    function inScope(it) {
        var r = scopeRect || selRect;
        if (!r) return true;
        try {
            var b = it.geometricBounds;
            return !(b[2] < r[0] || b[0] > r[2] || b[1] < r[3] || b[3] > r[1]);
        } catch (e) { return true; }
    }
    function layerHasScopedItem(ly) {
        try {
            var items = ly.pageItems;
            if (items.length === 0) return false;
            if (!scopeRect && !selRect) return true;
            for (var q = 0; q < items.length; q++) if (inScope(items[q])) return true;
        } catch (e) {}
        return false;
    }
    function overlapsRect(tb, r) {
        return !(tb[2] < r[0] || tb[0] > r[2] || tb[1] < r[3] || tb[3] > r[1]);
    }
    function unionBounds(list) {
        var u = null;
        for (var i = 0; i < list.length; i++) {
            var b = list[i].tb;
            if (!u) u = [b[0], b[1], b[2], b[3]];
            else {
                if (b[0] < u[0]) u[0] = b[0];
                if (b[1] > u[1]) u[1] = b[1];
                if (b[2] > u[2]) u[2] = b[2];
                if (b[3] < u[3]) u[3] = b[3];
            }
        }
        return u;
    }
    function nameOf(it) { try { return it.name || it.typename; } catch (e) { return "Item"; } }

    // Color key used to match swatches against artwork colors.
    function colorKey(c) {
        if (!c) return null;
        try {
            switch (c.typename) {
                case "SpotColor": return "S:" + c.spot.name;
                case "CMYKColor": return "C:" + Math.round(c.cyan) + "," + Math.round(c.magenta) + "," + Math.round(c.yellow) + "," + Math.round(c.black);
                case "RGBColor": return "R:" + Math.round(c.red) + "," + Math.round(c.green) + "," + Math.round(c.blue);
                case "GrayColor": return "K:" + Math.round(c.gray);
                case "GradientColor": return "G:" + c.gradient.name;
                case "PatternColor": return "P:" + c.pattern.name;
            }
        } catch (e) {}
        return null;
    }
    function addUsed(c, used) {
        var k = colorKey(c);
        if (!k) return;
        used[k] = true;
        try {
            if (c.typename === "GradientColor") {
                var stops = c.gradient.gradientStops;
                for (var s = 0; s < stops.length; s++) addUsed(stops[s].color, used);
            }
        } catch (e) {}
    }

    // Net-material thickness helpers (thin shapes / islands)
    function estimatePerimeter(pathItem) {
        var pts = pathItem.pathPoints;
        var n = pts.length;
        if (n < 2) return 0;
        var total = 0;
        var segments = pathItem.closed ? n : n - 1;
        for (var i = 0; i < segments; i++) {
            var a = pts[i].anchor;
            var b = pts[(i + 1) % n].anchor;
            var dx = b[0] - a[0], dy = b[1] - a[1];
            total += Math.sqrt(dx * dx + dy * dy);
        }
        return total;
    }
    function boundsInside(inner, outer) {
        var e = 0.01;
        return inner[0] >= outer[0] - e && inner[2] <= outer[2] + e &&
               inner[1] <= outer[1] + e && inner[3] >= outer[3] - e;
    }
    // Sub-paths of a compound path with nesting depth (0 = outer, 1 = hole, ...)
    function compoundSubs(cp) {
        var subs = [];
        for (var p = 0; p < cp.pathItems.length; p++) {
            var sp = cp.pathItems[p];
            var a = 0;
            try { a = Math.abs(sp.area); } catch (eA) {}
            if (a <= 0) continue;
            subs.push({ area: a, per: estimatePerimeter(sp), b: sp.geometricBounds, depth: 0 });
        }
        for (var i = 0; i < subs.length; i++) {
            for (var j = 0; j < subs.length; j++) {
                if (i === j) continue;
                if (subs[j].area > subs[i].area && boundsInside(subs[i].b, subs[j].b)) subs[i].depth++;
            }
        }
        return subs;
    }

    // Each check can call setInfo("what was checked", "badge") so the row can say
    // what it covered even when everything is fine. Reset before every check.
    var infoNote = "", infoBadge = "";
    function setInfo(text, badge) { infoNote = text || ""; infoBadge = badge || ""; }
    function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
    function problemCount(issues) {
        var n = 0;
        for (var i = 0; i < issues.length; i++) if (issues[i].sev !== "ok") n++;
        return n;
    }

    function capRows(issues, extraCheck, limit) {
        var max = limit || SETTINGS.MAX_ROWS;
        if (issues.length > max) {
            var more = issues.length - max;
            var sev = issues[0].sev;
            issues.length = max;
            issues.push(mk(sev, extraCheck, "...and " + more + " more", "Only the first " + max + " are listed", null, null));
        }
        return issues;
    }

    // ============================================================
    //  STANDARD CHECKS
    // ============================================================

    // ---- Image DPI ----------------------------------------------
    function checkDPI() {
        var issues = [];
        var okRows = [], total = 0;
        var colls = [["placedItems", doc.placedItems], ["rasterItems", doc.rasterItems]];
        for (var c = 0; c < colls.length; c++) {
            var coll = colls[c][1];
            for (var i = 0; i < coll.length; i++) {
                try {
                    var item = coll[i];
                    if (!inScope(item)) continue;
                    if (effHidden(item)) continue;
                    var m = item.matrix;
                    var scaleX = Math.sqrt(m.mValueA * m.mValueA + m.mValueB * m.mValueB) * sf;
                    var scaleY = Math.sqrt(m.mValueC * m.mValueC + m.mValueD * m.mValueD) * sf;
                    var ppiX = scaleX > 0 ? Math.round(72 / scaleX) : 0;
                    var ppiY = scaleY > 0 ? Math.round(72 / scaleY) : 0;
                    var ppi = (ppiX > 0 && ppiY > 0) ? Math.min(ppiX, ppiY) : (ppiX || ppiY);
                    if (ppi > 0) {
                        total++;
                        var nm = "Unnamed";
                        try { nm = item.name || (item.file ? item.file.displayName : "Unnamed"); } catch (eN) {}
                        if (ppi < SETTINGS.DPI_WARN) {
                            issues.push(mk(ppi < SETTINGS.DPI_BAD ? "bad" : "warn", "Image DPI", nm,
                                ppi + " DPI at final size (warn < " + SETTINGS.DPI_WARN + ", red < " + SETTINGS.DPI_BAD + ")",
                                colls[c][0], i));
                        } else {
                            okRows.push(mk("ok", "Image DPI", nm, ppi + " DPI at final size", colls[c][0], i));
                        }
                    }
                } catch (eItem) {}
            }
        }
        if (total === 0) { setInfo("No images in the file"); return null; }
        var bads = [], warns = [];
        for (var q = 0; q < issues.length; q++) (issues[q].sev === "bad" ? bads : warns).push(issues[q]);
        var all = capRows(bads.concat(warns).concat(okRows), "Image DPI", SETTINGS.MAX_IMAGE_ROWS);
        setInfo(plural(total, "image") + " checked", plural(total, "image"));
        return all;
    }

    // ---- Unused swatches -----------------------------------------
    var unusedSwatchNames = [];
    function getPathColors() {
        if (pathColorCache) return pathColorCache;
        pathColorCache = [];
        var pp = doc.pathItems;
        for (var pi = 0; pi < pp.length; pi++) {
            var ent = { p: null, i: pi, fc: null, sc: null, stroked: false, g: false, c: false, sw: 0, b: null, np: -1 };
            try {
                var one = pp[pi];
                ent.p = one;
                if (one.filled) ent.fc = one.fillColor;
                if (one.stroked) { ent.sc = one.strokeColor; ent.stroked = true; ent.sw = one.strokeWidth; }
                ent.g = one.guides;
                ent.c = one.clipping;
            } catch (eP) {}
            pathColorCache.push(ent);
        }
        return pathColorCache;
    }
    function checkSwatches() {
        unusedSwatchNames = [];
        var used = {};
        var pcs = getPathColors();
        for (var i = 0; i < pcs.length; i++) {
            try {
                if (pcs[i].fc) addUsed(pcs[i].fc, used);
                if (pcs[i].sc) addUsed(pcs[i].sc, used);
            } catch (e1) {}
        }
        var frames = doc.textFrames;
        for (var t = 0; t < frames.length; t++) {
            try {
                var tf = frames[t];
                var rngs = tf.textRanges;
                for (var r = 0; r < rngs.length; r++) {
                    try {
                        var ca = rngs[r].characterAttributes;
                        addUsed(ca.fillColor, used);
                        addUsed(ca.strokeColor, used);
                    } catch (e2) {}
                }
            } catch (e3) {}
        }
        var issues = [];
        var sw = doc.swatches;
        var swChecked = 0;
        for (var s = 0; s < sw.length; s++) {
            try {
                var swatch = sw[s];
                var nm = swatch.name;
                if (nm.charAt(0) === "[") continue;       // [None], [Registration]
                var k = colorKey(swatch.color);
                if (!k) continue;
                swChecked++;
                if (!used[k]) {
                    var swIss = mk("warn", "Unused Swatch", nm, "Not used by any artwork", null, null);
                    swIss.rgb = colorRGB(swatch.color);
                    swIss.desc = colorDesc(swatch.color);
                    issues.push(swIss); unusedSwatchNames.push(nm);
                }
            } catch (e4) {}
        }
        setInfo(plural(swChecked, "swatch") + " checked");
        return capRows(issues, "Unused Swatch");
    }

    // ---- Named colors (the old Check All Colors) ------------------
    // Lists every spot color and every color that has a named swatch, used by
    // the artwork. Each row can be focused, and "Add Label" puts a labelled
    // color square in the file (for the client's color legend).
    function colorSpec(c) {
        try {
            if (c.typename === "SpotColor") return "spot|" + c.spot.name;
            if (c.typename === "CMYKColor") return "cmyk|" + c.cyan + "|" + c.magenta + "|" + c.yellow + "|" + c.black;
            if (c.typename === "RGBColor") return "rgb|" + c.red + "|" + c.green + "|" + c.blue;
            if (c.typename === "GrayColor") return "gray|" + c.gray;
        } catch (e) {}
        return "";
    }
    // On-screen approximation of the color (CMYK is converted with the simple formula,
    // a spot color uses its alternate color), used only for the little color square.
    function colorRGB(c) {
        var rgb = [0, 0, 0];
        try {
            if (c.typename === "SpotColor") return colorRGB(c.spot.color);
            if (c.typename === "RGBColor") rgb = [c.red, c.green, c.blue];
            else if (c.typename === "CMYKColor") {
                var k = c.black / 100;
                rgb = [255 * (1 - c.cyan / 100) * (1 - k), 255 * (1 - c.magenta / 100) * (1 - k), 255 * (1 - c.yellow / 100) * (1 - k)];
            } else if (c.typename === "GrayColor") {
                var g = 255 * (1 - c.gray / 100);
                rgb = [g, g, g];
            }
        } catch (e) {}
        return [Math.max(0, Math.min(255, Math.round(rgb[0]))), Math.max(0, Math.min(255, Math.round(rgb[1]))), Math.max(0, Math.min(255, Math.round(rgb[2])))];
    }
    function colorDesc(c) {
        try {
            if (c.typename === "SpotColor") return "Spot color";
            if (c.typename === "CMYKColor") return "CMYK " + Math.round(c.cyan) + " / " + Math.round(c.magenta) + " / " + Math.round(c.yellow) + " / " + Math.round(c.black);
            if (c.typename === "RGBColor") return "RGB " + Math.round(c.red) + " / " + Math.round(c.green) + " / " + Math.round(c.blue);
            if (c.typename === "GrayColor") return "Gray " + Math.round(c.gray) + "%";
        } catch (e) {}
        return "Color";
    }
    function checkColors() {
        var rows = [], seenKey = {}, seenName = {};
        function addColor(color, coll, idx) {
            if (!color) return;
            var t = color.typename;
            if (t !== "SpotColor" && t !== "CMYKColor" && t !== "RGBColor" && t !== "GrayColor") return;
            var key = colorKey(color);
            if (!key || seenKey[key]) return;
            var name = "", useColor = color;
            if (t === "SpotColor") {
                name = color.spot.name;
            } else {
                try {
                    var swatch = doc.swatches.getByColor(color);
                    if (!swatch || !swatch.name || swatch.name.charAt(0) === "[") return;
                    name = swatch.name;
                    useColor = swatch.color;
                } catch (eSw) { return; }
            }
            seenKey[key] = true;
            if (seenName[name]) return;
            seenName[name] = true;
            var r = mk("ok", "Named Color", name, colorDesc(useColor), coll, idx);
            r.spec = colorSpec(useColor);
            r.rgb = colorRGB(useColor);
            rows.push(r);
        }
        var pcs2 = getPathColors();
        for (var i = 0; i < pcs2.length; i++) {
            try {
                if (!pcs2[i].p || !inScope(pcs2[i].p)) continue;
                if (pcs2[i].fc) addColor(pcs2[i].fc, "pathItems", pcs2[i].i);
                if (pcs2[i].sc) addColor(pcs2[i].sc, "pathItems", pcs2[i].i);
            } catch (e1) {}
        }
        var frames = doc.textFrames;
        for (var t2 = 0; t2 < frames.length; t2++) {
            try {
                var tf = frames[t2];
                if (!inScope(tf)) continue;
                var ca = tf.textRange.characterAttributes;
                addColor(ca.fillColor, "textFrames", t2);
                addColor(ca.strokeColor, "textFrames", t2);
            } catch (e2) {}
        }
        if (rows.length === 0) { setInfo("No named colors found in the file"); return []; }
        var n = rows.length;
        setInfo(plural(n, "named color") + " in use. Select one and press Add Label.", plural(n, "color"));
        return capRows(rows, "Named Color", SETTINGS.MAX_IMAGE_ROWS);
    }

    // ---- Text: live / missing font / overset ---------------------
    function checkText() {
        var issues = [];
        var frames = doc.textFrames;
        var tfChecked = 0;
        for (var i = 0; i < frames.length; i++) {
            try {
                var tf = frames[i];
                if (!inScope(tf)) continue;
                if (effHidden(tf)) continue;
                tfChecked++;
                var label = (tf.name && tf.name !== "") ? tf.name : "Text frame " + (i + 1);
                var preview = "";
                try { preview = tf.contents.substr(0, 30); } catch (eC) {}
                var flagged = false;

                var seen = {};
                var ranges = tf.textRanges;
                for (var c = 0; c < ranges.length; c++) {
                    var fontName = "";
                    try { fontName = ranges[c].textFont.name; } catch (eF) { continue; }
                    if (seen[fontName]) continue;
                    seen[fontName] = true;
                    var found = true;
                    try { app.textFonts.getByName(fontName); } catch (eLookup) { found = false; }
                    if (!found) {
                        issues.push(mk("bad", "Missing Font", label, fontName + " is not installed", "textFrames", i));
                        flagged = true;
                    }
                }
                var overflowed = false;
                try { overflowed = tf.overflowed; } catch (eOv) {}
                if (overflowed) {
                    issues.push(mk("bad", "Overset Text", label, "Text overflows its frame: " + preview, "textFrames", i));
                    flagged = true;
                }
                if (!flagged) {
                    issues.push(mk("warn", "Live Text", label, "Not outlined: " + preview, "textFrames", i));
                }
            } catch (eTf) {}
        }
        // Keep red items first so the cap never hides them
        var bad = [], warn = [];
        for (var q = 0; q < issues.length; q++) (issues[q].sev === "bad" ? bad : warn).push(issues[q]);
        setInfo(tfChecked === 0 ? "No text frames in the file" : plural(tfChecked, "text frame") + " checked");
        return capRows(bad.concat(warn), "Text");
    }

    // ---- File color mode -----------------------------------------
    function checkColorMode() {
        var issues = [];
        var docIsCMYK = (doc.documentColorSpace === DocumentColorSpace.CMYK);
        if (!docIsCMYK) {
            issues.push(mk("warn", "Document Color Mode", doc.name,
                "Document is not in CMYK color mode. Check if there is a client spec", null, null));
        }
        var flat = getTopLayerItems();
        for (var fi = 0; fi < flat.length; fi++) {
            var i = flat[fi].idx;
            try {
                var it = flat[fi].it;
                if (!inScope(it)) continue;
                var counts = { rgb: 0, cmyk: 0 };
                countWrongMode(it, docIsCMYK, counts);
                var wrong = docIsCMYK ? counts.rgb : counts.cmyk;
                if (wrong > 0) {
                    issues.push(mk("bad", "Wrong Color Mode",
                        wrong > 1 ? nameOf(it) + " (" + wrong + " items)" : nameOf(it),
                        (docIsCMYK ? "RGB color in a CMYK document" : "CMYK color in an RGB document"),
                        "pageItems", i));
                }
            } catch (eItem) {}
        }
        setInfo("Document is " + (docIsCMYK ? "CMYK" : "not CMYK") + "; top-level items checked for the wrong color mode");
        return capRows(issues, "Wrong Color Mode");
    }
    function countWrongMode(it, docIsCMYK, counts) {
        function look(color) {
            if (!color) return;
            try {
                if (docIsCMYK && color.typename === "RGBColor") counts.rgb++;
                else if (!docIsCMYK && color.typename === "CMYKColor") counts.cmyk++;
            } catch (e) {}
        }
        try { if (it.filled) look(it.fillColor); } catch (e1) {}
        try { if (it.stroked) look(it.strokeColor); } catch (e2) {}
        try {
            if (it.typename === "GroupItem") {
                for (var g = 0; g < it.pageItems.length; g++) countWrongMode(it.pageItems[g], docIsCMYK, counts);
            } else if (it.typename === "CompoundPathItem") {
                for (var p = 0; p < it.pathItems.length; p++) countWrongMode(it.pathItems[p], docIsCMYK, counts);
            }
        } catch (eR) {}
    }

    // ---- Open paths (production layers only) ---------------------
    function checkOpenPaths() {
        var issues = [];
        var groups = {}, order = [];
        var paths = doc.pathItems;
        var opChecked = 0;
        for (var i = 0; i < paths.length; i++) {
            try {
                var p = paths[i];
                if (p.guides || p.clipping) continue;
                if (!inScope(p)) continue;
                if (effHidden(p)) continue;
                if (!onProdLayer(p)) continue;
                opChecked++;
                if (p.closed) continue;
                var ln = layerNameOf(p);
                if (!groups[ln]) { groups[ln] = { count: 0, idx: i }; order.push(ln); }
                groups[ln].count++;
            } catch (e) {}
        }
        for (var o = 0; o < order.length; o++) {
            var g = groups[order[o]];
            issues.push(mk("bad", "Open Path", "Layer \"" + order[o] + "\" (" + g.count + " path" + (g.count > 1 ? "s" : "") + ")",
                "Open path on a production layer", "pathItems", g.idx));
        }
        if (findProdLayers().length === 0) {
            setInfo("No production layer found, so nothing was checked. Layer names must contain: " + SETTINGS.PRODUCTION_LAYER_KEYS.join(", "));
            return null;
        }
        setInfo(plural(opChecked, "path") + " checked on production layers");
        return issues;
    }

    // ---- Clipping masks ---------------------------------------------
    function checkClipping() {
        var issues = [];
        var groups = doc.groupItems;
        var clipCount = 0;
        for (var i = 0; i < groups.length; i++) {
            try {
                var g = groups[i];
                if (!g.clipped) continue;
                if (!inScope(g)) continue;
                clipCount++;
                var hidden = effHidden(g);
                issues.push(mk(hidden ? "bad" : "warn", hidden ? "Hidden Clipping Mask" : "Clipping Mask",
                    nameOf(g) + " (on \"" + layerNameOf(g) + "\")",
                    hidden ? "Mask is hidden (hidden group or hidden layer)" : "Visible clipping mask, verify the result",
                    "groupItems", i));
            } catch (e) {}
        }
        var bad = [], warn = [];
        for (var q = 0; q < issues.length; q++) (issues[q].sev === "bad" ? bad : warn).push(issues[q]);
        setInfo(clipCount === 0 ? "No clipping masks in the file (" + plural(groups.length, "group") + " checked)" : plural(clipCount, "clipping mask") + " found");
        return capRows(bad.concat(warn), "Clipping Mask");
    }

    // ---- External links -----------------------------------------------
    function checkLinks() {
        var issues = [];
        var placed = doc.placedItems;
        for (var i = 0; i < placed.length; i++) {
            try {
                var item = placed[i];
                if (!inScope(item)) continue;
                var exists = false, path = "(no file reference)";
                try { if (item.file) { path = item.file.fsName; exists = item.file.exists; } } catch (eF) {}
                var nm = "Unnamed";
                try { nm = item.name || (item.file ? item.file.displayName : "Unnamed"); } catch (eN) {}
                if (!exists) issues.push(mk("bad", "Missing Link", nm, path, "placedItems", i));
                else issues.push(mk("warn", "Linked File", nm, "Still linked: " + path, "placedItems", i));
            } catch (eItem) {}
        }
        var bad = [], warn = [];
        for (var q = 0; q < issues.length; q++) (issues[q].sev === "bad" ? bad : warn).push(issues[q]);
        setInfo(placed.length === 0 ? "No linked files in the file" : plural(placed.length, "linked file") + " checked");
        return capRows(bad.concat(warn), "External Link");
    }

    // ============================================================
    //  JOB CHECKS
    // ============================================================

    function walkLayers(layers, fn, depth, topIdx) {
        for (var i = 0; i < layers.length; i++) {
            var ly = layers[i];
            var ti = (depth === 0) ? i : topIdx;
            fn(ly, depth, depth === 0 ? i : null);
            try { if (ly.layers && ly.layers.length) walkLayers(ly.layers, fn, depth + 1, ti); } catch (e) {}
        }
    }
    function findProdLayers() {
        var out = [];
        walkLayers(doc.layers, function (ly) {
            try { if (matchesProd(ly.name) && layerHasScopedItem(ly)) out.push(ly.name); } catch (e) {}
        }, 0, 0);
        return out;
    }

    function jCutLayer(sevWhenMissing) {
        return function () {
            var found = findProdLayers();
            if (found.length > 0) return [];
            return [mk(sevWhenMissing, "Cut Layer", "No cut / route layer with artwork",
                "Looked for a layer whose name contains: " + SETTINGS.PRODUCTION_LAYER_KEYS.join(", "), null, null)];
        };
    }

    function jArtboardSize() {
        var issues = [];
        for (var a = 0; a < doc.artboards.length; a++) {
            if (scopeIdx >= 0 && a !== scopeIdx) continue;
            try {
                var r = doc.artboards[a].artboardRect;
                var wIn = toIn(Math.abs(r[2] - r[0])), hIn = toIn(Math.abs(r[1] - r[3]));
                if (wIn < SETTINGS.ARTBOARD_MIN_INCHES || wIn > SETTINGS.ARTBOARD_MAX_INCHES ||
                    hIn < SETTINGS.ARTBOARD_MIN_INCHES || hIn > SETTINGS.ARTBOARD_MAX_INCHES) {
                    issues.push(mk("warn", "Artboard Size", doc.artboards[a].name,
                        wIn.toFixed(2) + "in x " + hIn.toFixed(2) + "in, verify this is correct", "artboard", a));
                }
            } catch (e) {}
        }
        return issues;
    }

    function jOverhang() {
        var issues = [];
        var tol = 0.05;
        var bl = inD(SETTINGS.OVERHANG_BLEED_INCHES);
        var tops = getArt();
        for (var a = 0; a < doc.artboards.length; a++) {
            if (scopeIdx >= 0 && a !== scopeIdx) continue;
            try {
                var raw = doc.artboards[a].artboardRect;
                var ab = [raw[0] - bl, raw[1] + bl, raw[2] + bl, raw[3] - bl];
                for (var t = 0; t < tops.length; t++) {
                    var tb = tops[t].tb;
                    var overlaps = !(tb[2] < ab[0] - tol || tb[0] > ab[2] + tol || tb[1] < ab[3] - tol || tb[3] > ab[1] + tol);
                    if (!overlaps) continue;
                    var inside = (tb[0] >= ab[0] - tol && tb[2] <= ab[2] + tol && tb[1] <= ab[1] + tol && tb[3] >= ab[3] - tol);
                    if (!inside) issues.push(mk("warn", "Overhang", nameOf(tops[t].it),
                        "Extends past artboard \"" + doc.artboards[a].name + "\"", "artboard", a));
                }
            } catch (e) {}
        }
        return capRows(issues, "Overhang");
    }

    function jOutside() {
        if (scopeIdx >= 0) { setInfo("Only checked when All artboards is selected"); return null; }
        var issues = [];
        var tops = getTop();
        for (var t = 0; t < tops.length; t++) {
            var hit = false;
            for (var a = 0; a < doc.artboards.length; a++) {
                if (overlapsRect(tops[t].tb, doc.artboards[a].artboardRect)) { hit = true; break; }
            }
            if (!hit) issues.push(mk("warn", "Off-Artboard", nameOf(tops[t].it), "Sits completely outside every artboard", "pageItems", tops[t].idx));
        }
        return capRows(issues, "Off-Artboard");
    }

    function jEmpty() {
        var issues = [];
        walkLayers(doc.layers, function (ly, depth, topIdx) {
            try {
                if (ly.pageItems.length === 0 && (!ly.layers || ly.layers.length === 0)) {
                    issues.push(mk("warn", "Empty Layer", ly.name, "Layer has nothing on it", topIdx !== null ? "layer" : null, topIdx));
                }
            } catch (e) {}
        }, 0, 0);
        var frames = doc.textFrames;
        for (var i = 0; i < frames.length; i++) {
            try {
                if (frames[i].contents === "") issues.push(mk("warn", "Empty Text", nameOf(frames[i]), "Text frame has no text", "textFrames", i));
            } catch (e1) {}
        }
        var paths = doc.pathItems;
        for (var p = 0; p < paths.length; p++) {
            try {
                if (paths[p].pathPoints.length === 1 && !paths[p].guides) issues.push(mk("warn", "Stray Point", nameOf(paths[p]), "Path with a single anchor point", "pathItems", p));
            } catch (e2) {}
        }
        return capRows(issues, "Empty / Stray");
    }

    // Bounds and point count of a path, read once and kept (only needed by a few checks)
    function ensureGeom(e) {
        if (e.np !== -1) return;
        try { e.b = e.p.geometricBounds; } catch (eG1) { e.b = null; }
        try { e.np = e.p.pathPoints.length; } catch (eG2) { e.np = 0; }
    }
    function boundsInScope(b) {
        var r = scopeRect || selRect;
        if (!r) return true;
        if (!b) return true;
        return !(b[2] < r[0] || b[0] > r[2] || b[1] < r[3] || b[3] > r[1]);
    }
    function jDuplicates(sev) {
        return function () {
            var issues = [];
            var pcs = getPathColors();
            var groupsByKey = {}, keyOrder = [];
            for (var i = 0; i < pcs.length; i++) {
                try {
                    var e = pcs[i];
                    if (!e.p || e.g || e.c) continue;
                    ensureGeom(e);
                    if (!e.b || !boundsInScope(e.b)) continue;
                    var b = e.b;
                    var key = Math.round(b[0] * 100) + "|" + Math.round(b[1] * 100) + "|" + Math.round(b[2] * 100) + "|" + Math.round(b[3] * 100) +
                              "|" + e.np + "|" + (e.fc ? colorKey(e.fc) : "nf") + "|" + (e.sc ? colorKey(e.sc) : "ns");
                    if (groupsByKey[key] === undefined) { groupsByKey[key] = [i]; keyOrder.push(key); }
                    else groupsByKey[key].push(i);
                } catch (e0) {}
            }
            // Only paths that look identical need the (slow) hidden check
            for (var k = 0; k < keyOrder.length; k++) {
                var list = groupsByKey[keyOrder[k]];
                if (list.length < 2) continue;
                var vis = [];
                for (var m = 0; m < list.length; m++) {
                    try { if (!effHidden(pcs[list[m]].p)) vis.push(list[m]); } catch (eH) {}
                }
                if (vis.length >= 2) {
                    issues.push(mk(sev, "Stacked Duplicate", nameOf(pcs[vis[1]].p), "Identical shape stacked on top of another", "pathItems", pcs[vis[0]].i));
                }
            }
            return capRows(issues, "Stacked Duplicate");
        };
    }

    function jHairlines() {
        var issues = [];
        var pcs = getPathColors();
        var scoped = !!(scopeRect || selRect);
        for (var i = 0; i < pcs.length; i++) {
            try {
                var e = pcs[i];
                if (!e.p || !e.stroked || e.g || e.c) continue;
                var sw = e.sw * sf;   // real pt = doc units x scale factor
                if (!(sw > 0 && sw < SETTINGS.HAIRLINE_MIN_PT)) continue;
                if (scoped) { ensureGeom(e); if (!boundsInScope(e.b)) continue; }
                if (!effHidden(e.p)) {
                    issues.push(mk("warn", "Hairline Stroke", nameOf(e.p),
                        sw.toFixed(3) + "pt (below " + SETTINGS.HAIRLINE_MIN_PT + "pt)", "pathItems", e.i));
                }
            } catch (e1) {}
        }
        return capRows(issues, "Hairline Stroke");
    }

    function jTransparency() {
        var issues = [];
        var tops = getArt();
        for (var t = 0; t < tops.length; t++) {
            try {
                var it = tops[t].it;
                var op = 100, bm = null;
                try { op = it.opacity; } catch (eOp) {}
                try { bm = it.blendingMode; } catch (eBm) {}
                var flags = [];
                if (op < 100) flags.push(op + "% opacity");
                if (bm !== null && bm !== BlendModes.NORMAL) flags.push("blend mode: " + bm);
                if (flags.length) issues.push(mk("warn", "Transparency", nameOf(it), flags.join(", "), "pageItems", tops[t].idx));
            } catch (e) {}
        }
        return capRows(issues, "Transparency");
    }

    function jPureBlack() {
        var issues = [];
        var flat = getTopLayerItems();
        for (var fi = 0; fi < flat.length; fi++) {
            var i = flat[fi].idx;
            try {
                var it = flat[fi].it;
                if (effHidden(it)) continue;
                if (!inScope(it)) continue;
                var n = countBlack(it);
                if (n > 0) issues.push(mk("warn", "Pure Black Fill", n > 1 ? nameOf(it) + " (" + n + " items)" : nameOf(it),
                    "C0 M0 Y0 K100, verify rich black wasn't intended", "pageItems", i));
            } catch (e) {}
        }
        return capRows(issues, "Pure Black Fill");
    }
    function countBlack(it) {
        var n = 0;
        try {
            if ((it.typename === "PathItem") && it.filled) {
                var c = it.fillColor;
                if (c.typename === "CMYKColor" && c.cyan === 0 && c.magenta === 0 && c.yellow === 0 && c.black === 100) n++;
            } else if (it.typename === "GroupItem") {
                for (var g = 0; g < it.pageItems.length; g++) n += countBlack(it.pageItems[g]);
            } else if (it.typename === "CompoundPathItem" && it.pathItems.length > 0) {
                var c2 = it.pathItems[0].fillColor;
                if (c2.typename === "CMYKColor" && c2.cyan === 0 && c2.magenta === 0 && c2.yellow === 0 && c2.black === 100) n++;
            }
        } catch (e) {}
        return n;
    }

    // Thin shapes: 2 x net area / perimeter (outer minus holes)
    function reportThin(thicknessPt, name, idx, issues) {
        var inches = thicknessPt / 72;
        if (inches < SETTINGS.MIN_AVG_THICKNESS_INCHES) {
            issues.push(mk("warn", "Thin Shape (avg)", name,
                f3(inches) + "in avg thickness (below " + SETTINGS.MIN_AVG_THICKNESS_INCHES + "in), estimate, verify by eye", "pageItems", idx));
        }
    }
    function thinPath(p, idx, issues) {
        try {
            if (p.hidden || !p.closed || !p.filled) return;
            var area = Math.abs(p.area);
            if (area <= 0) return;
            var per = estimatePerimeter(p);
            if (per <= 0) return;
            reportThin((2 * area * sf) / per, nameOf(p), idx, issues);
        } catch (e) {}
    }
    function thinCompound(cp, idx, issues) {
        try {
            var subs = compoundSubs(cp);
            if (!subs.length) return;
            var net = 0, per = 0;
            for (var i = 0; i < subs.length; i++) {
                net += (subs[i].depth % 2 === 0) ? subs[i].area : -subs[i].area;
                per += subs[i].per;
            }
            if (net <= 0 || per <= 0) return;
            reportThin((2 * net * sf) / per, nameOf(cp), idx, issues);
        } catch (e) {}
    }
    function thinCollect(it, idx, issues) {
        try {
            if (it.hidden) return;
            if (it.typename === "PathItem") thinPath(it, idx, issues);
            else if (it.typename === "CompoundPathItem" && it.pathItems.length > 0) thinCompound(it, idx, issues);
            else if (it.typename === "GroupItem") for (var g = 0; g < it.pageItems.length; g++) thinCollect(it.pageItems[g], idx, issues);
        } catch (e) {}
    }
    function jThin() {
        var issues = [];
        var tops = getArt();
        for (var t = 0; t < tops.length; t++) thinCollect(tops[t].it, tops[t].idx, issues);
        return capRows(issues, "Thin Shape (avg)");
    }


    // ---- Narrowest width of vinyl pieces ---------------------------------
    // For each shape, walks the outline and measures how thick the material is
    // at each point (a short ray from the edge straight into the shape). A shape
    // is flagged when parts thinner than MIN_VINYL_WIDTH_INCHES run for at least
    // MIN_THIN_EDGE_INCHES (so sharp tips and corners don't count). One flag per
    // top-level piece. Estimate: verify by eye.
    function nwFlatten(p) {
        var pts = p.pathPoints, n = pts.length, out = [];
        if (n < 3) return out;
        var k = sf / 72;
        var segs = p.closed ? n : n - 1;
        for (var i = 0; i < segs; i++) {
            var a = pts[i], b = pts[(i + 1) % n];
            var p0 = a.anchor, p1 = a.rightDirection, p2 = b.leftDirection, p3 = b.anchor;
            var straight = Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1]) < 1e-6 &&
                           Math.abs(p2[0] - p3[0]) + Math.abs(p2[1] - p3[1]) < 1e-6;
            var steps = 1;
            if (!straight) {
                var len = (Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1]) +
                           Math.abs(p2[0] - p1[0]) + Math.abs(p2[1] - p1[1]) +
                           Math.abs(p3[0] - p2[0]) + Math.abs(p3[1] - p2[1])) * k;
                steps = Math.max(3, Math.min(24, Math.ceil(len / 0.05)));
            }
            for (var s2 = 0; s2 < steps; s2++) {
                var t = s2 / steps, u = 1 - t;
                var x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
                var y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
                out.push([x * k, y * k]);
            }
        }
        return out;
    }
    function nwPolyArea(poly) {
        var a = 0;
        for (var i = 0; i < poly.length; i++) {
            var q = poly[(i + 1) % poly.length];
            a += poly[i][0] * q[1] - q[0] * poly[i][1];
        }
        return a / 2;
    }
    function nwInside(pt, poly) {
        var c = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            if (((poly[i][1] > pt[1]) !== (poly[j][1] > pt[1])) &&
                (pt[0] < (poly[j][0] - poly[i][0]) * (pt[1] - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0])) c = !c;
        }
        return c;
    }
    // polys: outlines (inches) of ONE shape (a path, or all sub-paths of a compound path)
    // returns { min: narrowest thickness found, thin: length of edge thinner than the limit } or null
    function nwShape(polys) {
        var L = SETTINGS.MIN_VINYL_WIDTH_INCHES;
        var areas = [], depth = [], i, j, totalArea = 0, totalPer = 0;
        for (i = 0; i < polys.length; i++) areas.push(nwPolyArea(polys[i]));
        for (i = 0; i < polys.length; i++) {
            var d = 0;
            for (j = 0; j < polys.length; j++) {
                if (i === j) continue;
                if (Math.abs(areas[j]) > Math.abs(areas[i]) && nwInside(polys[i][0], polys[j])) d++;
            }
            depth.push(d);
            totalArea += (d % 2 === 0 ? 1 : -1) * Math.abs(areas[i]);
            for (var q = 0; q < polys[i].length; q++) {
                var pa = polys[i][q], pb = polys[i][(q + 1) % polys[i].length];
                totalPer += Math.sqrt((pb[0] - pa[0]) * (pb[0] - pa[0]) + (pb[1] - pa[1]) * (pb[1] - pa[1]));
            }
        }
        if (totalArea <= 0 || totalPer <= 0) return null;
        if ((2 * totalArea) / totalPer >= SETTINGS.NARROW_SKIP_AVG_INCHES) return null;   // big plain piece

        // edges (long ones are cut into pieces <= L) + grid of cells of size L
        var edges = [], grid = {}, cell = L;
        for (i = 0; i < polys.length; i++) {
            var sgn = areas[i] >= 0 ? 1 : -1;
            if (depth[i] % 2 === 1) sgn = -sgn;        // holes: material is outside the hole
            var poly = polys[i];
            for (var e = 0; e < poly.length; e++) {
                var A = poly[e], B = poly[(e + 1) % poly.length];
                var dx = B[0] - A[0], dy = B[1] - A[1];
                var len = Math.sqrt(dx * dx + dy * dy);
                if (len < 1e-7) continue;
                var parts = Math.max(1, Math.ceil(len / L));
                for (var pp = 0; pp < parts; pp++) {
                    var a0 = [A[0] + dx * pp / parts, A[1] + dy * pp / parts];
                    var a1 = [A[0] + dx * (pp + 1) / parts, A[1] + dy * (pp + 1) / parts];
                    // inward normal: left of travel (-dy, dx) when sgn > 0, right when sgn < 0
                    var nx = (-dy / len) * sgn, ny = (dx / len) * sgn;
                    var ed = { x1: a0[0], y1: a0[1], x2: a1[0], y2: a1[1], nx: nx, ny: ny, len: len / parts };
                    var id = edges.length;
                    edges.push(ed);
                    var cx1 = Math.floor(Math.min(a0[0], a1[0]) / cell), cx2 = Math.floor(Math.max(a0[0], a1[0]) / cell);
                    var cy1 = Math.floor(Math.min(a0[1], a1[1]) / cell), cy2 = Math.floor(Math.max(a0[1], a1[1]) / cell);
                    for (var gx = cx1; gx <= cx2; gx++) for (var gy = cy1; gy <= cy2; gy++) {
                        var key = gx + "," + gy;
                        if (!grid[key]) grid[key] = [];
                        grid[key].push(id);
                    }
                }
            }
        }
        var stride = Math.max(1, Math.ceil(edges.length / 220));   // at most ~220 samples per shape
        var minT = 1e9, thin = 0, stamp = [], sCount = 0;
        for (var si = 0; si < edges.length; si += stride) {
            var ed2 = edges[si];
            var px = (ed2.x1 + ed2.x2) / 2, py = (ed2.y1 + ed2.y2) / 2;
            var best = 1e9;
            var gcx = Math.floor(px / cell), gcy = Math.floor(py / cell);
            sCount++;
            for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
                var lst = grid[(gcx + ox) + "," + (gcy + oy)];
                if (!lst) continue;
                for (var li = 0; li < lst.length; li++) {
                    var eid = lst[li];
                    if (eid === si || stamp[eid] === sCount) continue;
                    stamp[eid] = sCount;
                    var o = edges[eid];
                    var ex = o.x2 - o.x1, ey = o.y2 - o.y1;
                    var den = ed2.nx * ey - ed2.ny * ex;
                    if (Math.abs(den) < 1e-12) continue;
                    var ax = o.x1 - px, ay = o.y1 - py;
                    var t = (ax * ey - ay * ex) / den;
                    var u = (ax * ed2.ny - ay * ed2.nx) / den;
                    if (t > 1e-5 && t <= L && u >= 0 && u <= 1 && t < best) best = t;
                }
            }
            if (best < minT) minT = best;
            if (best < L) thin += ed2.len * stride;
        }
        if (minT >= 1e9) return { min: L, thin: 0 };
        return { min: minT, thin: thin };
    }
    function nwCollect(it, out, depthGuard) {
        try {
            if (it.hidden || depthGuard > 20) return;
            if (it.typename === "PathItem") {
                if (it.guides || it.clipping || !it.closed) return;
                var pl = nwFlatten(it);
                if (pl.length >= 3) out.push([pl]);
            } else if (it.typename === "CompoundPathItem") {
                var polys = [];
                for (var c = 0; c < it.pathItems.length; c++) {
                    var sp = it.pathItems[c];
                    var f = nwFlatten(sp);
                    if (f.length >= 3) polys.push(f);
                }
                if (polys.length) out.push(polys);
            } else if (it.typename === "GroupItem") {
                for (var g = 0; g < it.pageItems.length; g++) nwCollect(it.pageItems[g], out, depthGuard + 1);
            }
        } catch (e) {}
    }
    // source: "art" = the filled artwork is the vinyl (cut vinyl);
    //         "cut" = the CutContour shapes are the vinyl (print & cut: printed art isn't checked)
    function jNarrow(source) {
        return function () {
            var issues = [];
            var tops = getTop();
            var pieces = 0, shapesDone = 0, capped = false;
            for (var t = 0; t < tops.length; t++) {
                var tp = tops[t];
                if (source === "art" ? tp.kind !== "art" : tp.kind !== "cut") continue;
                pieces++;
                var shapes = [];
                nwCollect(tp.it, shapes, 0);
                var worst = null, narrowCount = 0;
                for (var sh = 0; sh < shapes.length; sh++) {
                    if (shapesDone >= SETTINGS.NARROW_MAX_SHAPES) { capped = true; break; }
                    shapesDone++;
                    var r = null;
                    try { r = nwShape(shapes[sh]); } catch (eS) { r = null; }
                    if (r && r.min < SETTINGS.MIN_VINYL_WIDTH_INCHES && r.thin >= SETTINGS.MIN_THIN_EDGE_INCHES) {
                        narrowCount++;
                        if (!worst || r.min < worst.min) worst = r;
                    }
                }
                if (worst) {
                    issues.push(mk("bad", "Narrow Vinyl", nameOf(tp.it),
                        "Narrowest part about " + f3(worst.min) + "in (minimum " + SETTINGS.MIN_VINYL_WIDTH_INCHES + "in)" +
                        (narrowCount > 1 ? ", " + narrowCount + " narrow shapes in this piece" : "") + ". Estimate, verify by eye.",
                        "pageItems", tp.idx));
                }
                if (capped) break;
            }
            if (capped) issues.push(mk("warn", "Narrow Vinyl", "Stopped early", "Only the first " + SETTINGS.NARROW_MAX_SHAPES + " shapes were measured", null, null));
            setInfo(plural(pieces, "piece") + " / " + plural(shapesDone, "shape") + " measured" +
                (source === "cut" ? " (CutContour shapes only, printed art is not checked)" : ""));
            return capRows(issues, "Narrow Vinyl");
        };
    }

    function jUndersized() {
        var issues = [];
        var minW = SETTINGS.MIN_ITEM_WIDTH_INCHES, minH = SETTINGS.MIN_ITEM_HEIGHT_INCHES;
        var tops = getArt();
        for (var t = 0; t < tops.length; t++) {
            try {
                var it = tops[t].it;
                if (it.locked) continue;
                var tb = tops[t].tb;
                var wIn = toIn(tb[2] - tb[0]), hIn = toIn(tb[1] - tb[3]);
                if (wIn > 0 && hIn > 0 && (wIn < minW || hIn < minH)) {
                    issues.push(mk("warn", "Undersized Item", nameOf(it),
                        f3(wIn) + " x " + f3(hIn) + "in (min " + minW + " x " + minH + "in)", "pageItems", tops[t].idx));
                }
            } catch (e) {}
        }
        return capRows(issues, "Undersized Item");
    }

    // Tiny islands inside compound paths (e.g. the dot of an "i")
    function jIslands() {
        var issues = [];
        var minW = SETTINGS.MIN_ITEM_WIDTH_INCHES, minH = SETTINGS.MIN_ITEM_HEIGHT_INCHES;
        var cps = doc.compoundPathItems;
        for (var i = 0; i < cps.length; i++) {
            try {
                var cp = cps[i];
                if (!inScope(cp)) continue;
                if (effHidden(cp)) continue;
                var subs = compoundSubs(cp);
                for (var s = 0; s < subs.length; s++) {
                    if (subs[s].depth % 2 !== 0) continue;
                    var wIn = toIn(subs[s].b[2] - subs[s].b[0]), hIn = toIn(subs[s].b[1] - subs[s].b[3]);
                    if (wIn < minW && hIn < minH) {
                        issues.push(mk("warn", "Tiny Island", nameOf(cp),
                            "Piece of " + f3(wIn) + " x " + f3(hIn) + "in, hard to weed/apply", "compoundPathItems", i));
                        break;
                    }
                }
            } catch (e) {}
        }
        return capRows(issues, "Tiny Island");
    }

    // Stroke-only artwork (a stroke doesn't cut) outside production layers
    function jStrokeOnly() {
        var issues = [];
        var groups = {}, order = [];
        var paths = doc.pathItems;
        for (var i = 0; i < paths.length; i++) {
            try {
                var p = paths[i];
                if (p.guides || p.clipping || p.filled || !p.stroked) continue;
                if (!inScope(p)) continue;
                if (effHidden(p) || onProdLayer(p)) continue;
                var ln = layerNameOf(p);
                if (!groups[ln]) { groups[ln] = { count: 0, idx: i }; order.push(ln); }
                groups[ln].count++;
            } catch (e) {}
        }
        for (var o = 0; o < order.length; o++) {
            var g = groups[order[o]];
            issues.push(mk("warn", "Stroke-Only", "Layer \"" + order[o] + "\" (" + g.count + ")",
                "Stroke with no fill: a stroke won't cut as a shape. Expand or fill it.", "pathItems", g.idx));
        }
        return issues;
    }

    // Optional tight-gap check (bounding boxes, not true shape distance)
    function jGaps() {
        if (!gapEnabled) return null;
        var tops = getArt();
        if (tops.length > SETTINGS.GAP_MAX_ITEMS) {
            return [mk("warn", "Tight Gap", "Too many items (" + tops.length + ")", "Gap check skipped above " + SETTINGS.GAP_MAX_ITEMS + " top-level items", null, null)];
        }
        var thr = inD(SETTINGS.MIN_GAP_INCHES);
        var issues = [];
        for (var i = 0; i < tops.length && issues.length < SETTINGS.MAX_ROWS; i++) {
            for (var j = i + 1; j < tops.length; j++) {
                var a = tops[i].tb, b = tops[j].tb;
                var dx = Math.max(b[0] - a[2], a[0] - b[2]);
                var dy = Math.max(a[3] - b[1], b[3] - a[1]);
                if (dx <= 0 && dy <= 0) continue;          // overlapping boxes
                var gap = (dx > 0 && dy > 0) ? Math.sqrt(dx * dx + dy * dy) : Math.max(dx, dy);
                if (gap > 0 && gap < thr) {
                    issues.push(mk("warn", "Tight Gap", nameOf(tops[i].it) + " / " + nameOf(tops[j].it),
                        f3(toIn(gap)) + "in between bounding boxes (min " + SETTINGS.MIN_GAP_INCHES + "in)", "pageItems", tops[i].idx));
                    if (issues.length >= SETTINGS.MAX_ROWS) break;
                }
            }
        }
        return issues;
    }

    // Art that reaches an artboard edge must run past it by the bleed amount
    function sideReport(ext, need, tol, side, out) {
        if (ext >= -tol && ext < need - tol) out.push(side + " " + f3(toIn(Math.max(ext, 0))) + "in");
    }
    function jEdgeBleed(inches) {
        return function () {
            var issues = [];
            var need = inD(inches), tol = 0.05;
            var tops = getArt();
            for (var a = 0; a < doc.artboards.length; a++) {
                if (scopeIdx >= 0 && a !== scopeIdx) continue;
                var r = doc.artboards[a].artboardRect;
                for (var t = 0; t < tops.length; t++) {
                    var tb = tops[t].tb;
                    if (!overlapsRect(tb, r)) continue;
                    var shortSides = [];
                    sideReport(r[0] - tb[0], need, tol, "left", shortSides);
                    sideReport(tb[2] - r[2], need, tol, "right", shortSides);
                    sideReport(tb[1] - r[1], need, tol, "top", shortSides);
                    sideReport(r[3] - tb[3], need, tol, "bottom", shortSides);
                    if (shortSides.length) {
                        issues.push(mk("bad", "Missing Bleed", nameOf(tops[t].it),
                            "Reaches the edge but runs past it by only: " + shortSides.join(", ") + " (needs " + inches + "in) on \"" + doc.artboards[a].name + "\"",
                            "pageItems", tops[t].idx));
                    }
                }
            }
            return capRows(issues, "Missing Bleed");
        };
    }
    // Printed + cut: art must run past the CutContour shape
    function jPrintBleed(inches) {
        return function () {
            var issues = [];
            var need = inD(inches), tol = 0.05;
            var tops = getTop();
            for (var a = 0; a < doc.artboards.length; a++) {
                if (scopeIdx >= 0 && a !== scopeIdx) continue;
                var r = doc.artboards[a].artboardRect;
                var cuts = [], arts = [];
                for (var t = 0; t < tops.length; t++) {
                    if (!overlapsRect(tops[t].tb, r)) continue;
                    if (tops[t].kind === "cut") cuts.push(tops[t]);
                    else if (tops[t].kind === "art") arts.push(tops[t]);
                }
                if (!cuts.length || !arts.length) continue;
                var cu = unionBounds(cuts), au = unionBounds(arts);
                var shortSides = [];
                sideReport(cu[0] - au[0], need, tol, "left", shortSides);
                sideReport(au[2] - cu[2], need, tol, "right", shortSides);
                sideReport(au[1] - cu[1], need, tol, "top", shortSides);
                sideReport(cu[3] - au[3], need, tol, "bottom", shortSides);
                if (shortSides.length) {
                    issues.push(mk("bad", "Missing Print Bleed", "Artboard \"" + doc.artboards[a].name + "\"",
                        "Art reaches the CutContour line but extends past it by only: " + shortSides.join(", ") + " (needs " + inches + "in)",
                        "artboard", a));
                }
            }
            return issues;
        };
    }

    // ---- Production-layer helpers --------------------------------------
    function isCutStroke(c) {
        try { return c.typename === "SpotColor" && isCutSpotName(c.spot.name) && c.tint >= 99.5; } catch (e) { return false; }
    }
    function isBlack100(c) {
        try {
            return c.typename === "CMYKColor" && Math.round(c.cyan) === 0 && Math.round(c.magenta) === 0 &&
                   Math.round(c.yellow) === 0 && Math.round(c.black) === 100;
        } catch (e) { return false; }
    }
    function isWhiteInkFill(c) {
        try { return c.typename === "SpotColor" && normName(c.spot.name) === "whiteink" && c.tint >= 99.5; } catch (e) { return false; }
    }
    function layersWithItems(test) {
        var out = [];
        walkLayers(doc.layers, function (ly) {
            try { if (test(ly.name) && layerHasScopedItem(ly)) out.push(ly); } catch (e) {}
        }, 0, 0);
        return out;
    }
    function layerExistsNamed(test) {
        var found = false;
        walkLayers(doc.layers, function (ly) { try { if (test(ly.name)) found = true; } catch (e) {} }, 0, 0);
        return found;
    }
    // Checks every path on layers matching `test` against `rule`:
    //   closed, stroke: "req"|"forbid", strokeOk(color), width1pt,
    //   fill: "req"|"forbid", fillOk(color); plus clipping masks and images on the layer.
    // Returns { n, first, order[], reasons{} }.
    function checkLayerPaths(test, rule) {
        var res = { n: 0, first: null, order: [], reasons: {} };
        function flag(why) {
            if (!res.reasons[why]) { res.reasons[why] = 0; res.order.push(why); }
            res.reasons[why]++;
        }
        var paths = doc.pathItems;
        for (var i = 0; i < paths.length; i++) {
            try {
                var p = paths[i];
                if (p.guides || p.clipping) continue;
                if (!inScope(p)) continue;
                if (!onLayerWhere(p, test) || effHidden(p)) continue;
                res.n++;
                if (res.first === null) res.first = i;
                if (rule.closed && !p.closed) flag("open path");
                if (rule.stroke === "req") {
                    if (!p.stroked) flag("no stroke");
                    else {
                        if (rule.strokeOk && !rule.strokeOk(p.strokeColor)) flag(rule.strokeMsg);
                        if (rule.width1pt && Math.abs(p.strokeWidth * sf - 1) > 0.01) flag("stroke is not 1 pt");
                    }
                } else if (rule.stroke === "forbid" && p.stroked) flag("has a stroke");
                if (rule.fill === "req") {
                    if (!p.filled) flag("no fill");
                    else if (rule.fillOk && !rule.fillOk(p.fillColor)) flag(rule.fillMsg);
                } else if (rule.fill === "forbid" && p.filled) flag("has a fill");
            } catch (e) {}
        }
        var groups = doc.groupItems;
        for (var g = 0; g < groups.length; g++) {
            try { if (groups[g].clipped && inScope(groups[g]) && onLayerWhere(groups[g], test) && !effHidden(groups[g])) flag("clipping mask"); } catch (eG) {}
        }
        var imgs = [doc.rasterItems, doc.placedItems];
        for (var c = 0; c < imgs.length; c++) {
            for (var k = 0; k < imgs[c].length; k++) {
                try { if (inScope(imgs[c][k]) && onLayerWhere(imgs[c][k], test) && !effHidden(imgs[c][k])) flag("image"); } catch (eI) {}
            }
        }
        return res;
    }
    function reasonsToIssues(res, label, layerLabel, issues) {
        for (var o = 0; o < res.order.length; o++) {
            var why = res.order[o];
            issues.push(mk("bad", label, res.reasons[why] + " item(s) on the " + layerLabel + " layer",
                why.charAt(0).toUpperCase() + why.substr(1), res.first !== null ? "pathItems" : null, res.first));
        }
    }

    // CutContour: layer + spot color (100% M) + stroke / structure rules
    function jCutContour(mode) {
        return function () {
            var issues = [];
            var usedElsewhere = 0;
            var paths = doc.pathItems;
            for (var i = 0; i < paths.length; i++) {
                try {
                    var p = paths[i];
                    if (p.guides || p.clipping || onLayerWhere(p, isCutLayerName)) continue;
                    if (!inScope(p)) continue;
                    var c1 = p.stroked ? p.strokeColor : null, c2 = p.filled ? p.fillColor : null;
                    if ((c1 && c1.typename === "SpotColor" && isCutSpotName(c1.spot.name)) ||
                        (c2 && c2.typename === "SpotColor" && isCutSpotName(c2.spot.name))) usedElsewhere++;
                } catch (e) {}
            }
            var layerExists = layerExistsNamed(isCutLayerName);
            var res = checkLayerPaths(isCutLayerName, {
                closed: true, stroke: "req", strokeOk: isCutStroke,
                strokeMsg: "Stroke isn't the " + SETTINGS.CUT_SPOT_NAME + " spot color at 100%", width1pt: true
            });
            var spotFound = null;
            try {
                for (var sp = 0; sp < doc.spots.length; sp++) {
                    if (isCutSpotName(doc.spots[sp].name)) { spotFound = doc.spots[sp]; break; }
                }
            } catch (eS) {}

            if (mode === "no") {
                if (res.n > 0 || usedElsewhere > 0) {
                    issues.push(mk("warn", "CutContour", "CutContour present",
                        "The specs sheet says this sign type takes no CutContour", res.first !== null ? "pathItems" : null, res.first));
                }
                return issues;
            }
            if (!layerExists) issues.push(mk("bad", "CutContour", "No CutContour layer", "Add a layer named CutContour with the cut path", null, null));
            else if (res.n === 0) issues.push(mk("bad", "CutContour", "CutContour layer is empty", "Nothing on the CutContour layer", null, null));
            if (!spotFound) {
                issues.push(mk("bad", "CutContour", "No spot color named " + SETTINGS.CUT_SPOT_NAME, "Spot color is missing from the Swatches panel", null, null));
            } else {
                try {
                    var sc = spotFound.color;
                    if (sc.typename === "CMYKColor") {
                        if (sc.magenta < 99.5 || sc.cyan > 0.5 || sc.yellow > 0.5 || sc.black > 0.5) {
                            issues.push(mk("bad", "CutContour", spotFound.name,
                                "Spot is C" + Math.round(sc.cyan) + " M" + Math.round(sc.magenta) + " Y" + Math.round(sc.yellow) + " K" + Math.round(sc.black) + ", must be 100% M only", null, null));
                        }
                    } else {
                        issues.push(mk("warn", "CutContour", spotFound.name, "Spot isn't defined in CMYK, can't verify 100% M", null, null));
                    }
                } catch (eC) {}
            }
            reasonsToIssues(res, "CutContour", "CutContour", issues);
            if (usedElsewhere > 0) issues.push(mk("warn", "CutContour", usedElsewhere + " path(s) outside the CutContour layer",
                "Using the " + SETTINGS.CUT_SPOT_NAME + " spot color, they'd cut", null, null));
            return issues;
        };
    }

    // Outline / Holes / White Ink layers. Outline is required when the sign type
    // needs it; Holes and White Ink are only checked when their layer exists.
    // Returns null (row shows "not run") when none of them applies.
    function jProdLayers(needOutline) {
        return function () {
            var issues = [];
            var any = false;
            var blackRule = { closed: true, stroke: "req", strokeOk: isBlack100, strokeMsg: "Stroke isn't 100% black (C0 M0 Y0 K100)", width1pt: true };
            var specs = [
                { label: "Outline", test: isOutlineLayerName, required: needOutline, rule: blackRule },
                { label: "Holes", test: isHolesLayerName, required: false, rule: blackRule },
                { label: "White Ink", test: isWhiteInkLayerName, required: false,
                  rule: { closed: true, fill: "req", fillOk: isWhiteInkFill, fillMsg: "Fill isn't the White Ink spot color at 100%", stroke: "forbid" } }
            ];
            for (var s = 0; s < specs.length; s++) {
                var sp = specs[s];
                var present = layersWithItems(sp.test).length > 0;
                if (!present && !sp.required) continue;
                any = true;
                if (!present) {
                    // The Outline is the cut path of the sign body and normally lives in a
                    // separate production file, so a missing one is only a warning.
                    var hasBBox = layersWithItems(isBBoxLayerName).length > 0;
                    issues.push(mk("warn", sp.label, "No " + sp.label + " layer",
                        hasBBox ? "BoundingBox is present, so the " + sp.label + " (cut path) is probably made in the separate production file"
                                : "No " + sp.label + " layer in this file. If this is the production file, it needs one (closed paths, 1 pt, 100% black)", null, null));
                    continue;
                }
                reasonsToIssues(checkLayerPaths(sp.test, sp.rule), sp.label, sp.label, issues);
            }
            return any ? issues : null;
        };
    }

    // BoundingBox: the sign's format shape on its own layer
    //   "nostroke": required; no fill and no stroke, anything else is wrong
    //   "stroke":   required; clean is fine, a 100% K stroke / fill is a warning
    //               (banners can carry one), any other stroke color is wrong
    //   "no":       not used by this sign type
    function jBBox(mode) {
        return function () {
            var issues = [];
            var n = 0, withFill = 0, withStroke = 0, blackStroke = 0, otherStroke = 0, firstIdx = null;
            var paths = doc.pathItems;
            for (var i = 0; i < paths.length; i++) {
                try {
                    var p = paths[i];
                    if (p.guides || p.clipping) continue;
                    if (!inScope(p)) continue;
                    if (!onLayerWhere(p, isBBoxLayerName)) continue;
                    n++;
                    if (firstIdx === null) firstIdx = i;
                    if (p.filled) withFill++;
                    if (p.stroked) {
                        withStroke++;
                        if (isBlack100(p.strokeColor)) blackStroke++; else otherStroke++;
                    }
                } catch (e) {}
            }
            if (mode === "no") {
                if (n > 0) issues.push(mk("warn", "BoundingBox", "BoundingBox present", "The specs sheet says this sign type takes no BoundingBox", "pathItems", firstIdx));
                return issues;
            }
            if (n === 0) {
                issues.push(mk("bad", "BoundingBox", "No BoundingBox", "Needs a layer named BoundingBox with the sign's format shape", null, null));
                return issues;
            }
            if (mode === "nostroke") {
                if (withFill > 0 || withStroke > 0) {
                    issues.push(mk("bad", "BoundingBox", "BoundingBox has " + (withFill > 0 ? "a fill" : "") + (withFill > 0 && withStroke > 0 ? " and " : "") + (withStroke > 0 ? "a stroke" : ""),
                        "Must have no fill and no stroke", "pathItems", firstIdx));
                }
            } else if (mode === "stroke") {
                if (otherStroke > 0) {
                    issues.push(mk("bad", "BoundingBox", "BoundingBox stroke isn't 100% black", "A stroked BoundingBox must be C0 M0 Y0 K100", "pathItems", firstIdx));
                } else if (blackStroke > 0 || withFill > 0) {
                    issues.push(mk("warn", "BoundingBox", "BoundingBox has a 100% K " + (blackStroke > 0 ? "stroke" : "fill"),
                        "Allowed for some banners, check it's intended", "pathItems", firstIdx));
                }
            }
            return issues;
        };
    }

    function isGrommetLayerName(n) { return normName(n).indexOf("grommet") >= 0; }
    function isBrailleLayerName(n) { return normName(n).indexOf("braille") >= 0; }
    // Banners: grommets are upon request. A Grommets layer = OK, none = check with the client.
    function jGrommets() {
        if (layersWithItems(isGrommetLayerName).length > 0) { setInfo("Grommets layer found"); return []; }
        return [mk("warn", "Grommets", "No Grommets layer", "Grommets are upon request for banners. Check if the client needs them.", null, null)];
    }
    // ADA: braille uses a 1 pt outline. A Braille layer is needed if the sign has braille.
    function jBraille() {
        var layers = layersWithItems(isBrailleLayerName);
        if (layers.length === 0) {
            return [mk("warn", "Braille", "No Braille layer", "Check if braille is needed on this sign. If it is, it goes on a layer named Braille with a 1 pt outline.", null, null)];
        }
        var issues = [], count = 0, bad = 0, firstBad = null;
        var paths = doc.pathItems;
        for (var i = 0; i < paths.length; i++) {
            try {
                var p = paths[i];
                if (p.guides || p.clipping || effHidden(p)) continue;
                if (!inScope(p)) continue;
                if (!onLayerWhere(p, isBrailleLayerName)) continue;
                count++;
                var sw = p.strokeWidth * sf;
                if (!p.stroked || Math.abs(sw - 1) > 0.01) { bad++; if (firstBad === null) firstBad = i; }
            } catch (e) {}
        }
        if (bad > 0) issues.push(mk("warn", "Braille", "Braille layer (" + bad + " path" + (bad > 1 ? "s" : "") + ")", "Braille needs a 1 pt outline", "pathItems", firstBad));
        setInfo(plural(count, "braille path") + " checked");
        return issues;
    }

    // Routed elements: 1 pt outline
    function jRouted() {
        var issues = [];
        var groups = {}, order = [];
        var paths = doc.pathItems;
        for (var i = 0; i < paths.length; i++) {
            try {
                var p = paths[i];
                if (p.guides || p.clipping || effHidden(p)) continue;
                if (!inScope(p)) continue;
                if (!onLayerWhere(p, isRoutedLayerName)) continue;
                var sw = p.strokeWidth * sf;
                if (!p.stroked || Math.abs(sw - 1) > 0.01) {
                    var ln = layerNameOf(p);
                    if (!groups[ln]) { groups[ln] = { count: 0, idx: i }; order.push(ln); }
                    groups[ln].count++;
                }
            } catch (e) {}
        }
        for (var o = 0; o < order.length; o++) {
            issues.push(mk("warn", "Routed Outline", "Layer \"" + order[o] + "\" (" + groups[order[o]].count + ")",
                "Routed elements need a 1 pt outline", "pathItems", groups[order[o]].idx));
        }
        return issues;
    }

    function jNotes(notes) {
        return function () {
            var issues = [];
            for (var i = 0; i < notes.length; i++) issues.push(mk("warn", "Sheet Note", curType ? curType.label : "Note", notes[i], null, null));
            return issues;
        };
    }

    // ---- Registry ---------------------------------------------------
    var STANDARD = [
        { label: "Image DPI", fn: checkDPI },
        { label: "Unused Swatches", fn: checkSwatches, fix: "swatches" },
        { label: "Named Colors", fn: checkColors, labelTool: true },
        { label: "Text (live / fonts)", fn: checkText },
        { label: "File Color Mode", fn: checkColorMode },
        { label: "Open Paths", fn: checkOpenPaths },
        { label: "Clipping Masks", fn: checkClipping },
        { label: "External Links", fn: checkLinks }
    ];

    // ---- Sign types: read from the shared Sign_Types file (same folder as this script)
    var typesPath = (JOBMODE && $.global.__PF_JOB && $.global.__PF_JOB.self) ? $.global.__PF_JOB.self : SELF_PATH;
    var ST = loadSignTypes(typesPath, "Preflight Check", JOBMODE);
    if (!ST) {
        if (JOBMODE) { $.global.__PF_JOB = null; $.global.__PF_RESULT = "({nodoc:true})"; }
        return;
    }
    var SIGN_TYPES = ST.types;
    var DEFAULT_TYPE = ST.defaultType;
    var SIGN_TYPES_VERSION = ST.version + (ST.source === "jsx" ? " (.jsx backup)" : "");
    // Client profiles: Clients_x.x.json next to this script (built-in standard profiles if it is missing).
    CLIENTS = loadClients(typesPath, "preflight", JOBMODE).clients;
    // The sign type as the picked client wants it (standard entry + the client's changes).
    function typeAt(i) { return applyClientToType(SIGN_TYPES[i], CURRENT_CLIENT); }

    // ---- Layer spec (the layers each sign type needs) ----------------------
    function rgbNear(a, b) {
        return !!(a && b) && Math.abs(a[0] - b[0]) <= 3 && Math.abs(a[1] - b[1]) <= 3 && Math.abs(a[2] - b[2]) <= 3;
    }
    function specRGB(colorName) {
        var c = ST.colors ? ST.colors[colorName] : null;
        return (c && c.length === 3) ? c : null;
    }
    function layerRGB(ly) {
        try { var c = ly.color; return [Math.round(c.red), Math.round(c.green), Math.round(c.blue)]; } catch (e) { return null; }
    }
    function rgbText(c) { return c ? ("RGB " + c[0] + ", " + c[1] + ", " + c[2]) : "unknown"; }
    function colorNameOfRGB(c) {
        if (!c) return "unknown";
        for (var k in ST.colors) if (rgbNear(c, ST.colors[k])) return k;
        return rgbText(c);
    }
    function lev(a, b) {
        var m = a.length, n = b.length, d = [], i, j;
        for (i = 0; i <= m; i++) { d[i] = [i]; }
        for (j = 1; j <= n; j++) d[0][j] = j;
        for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
            var cost = (a.charAt(i - 1) === b.charAt(j - 1)) ? 0 : 1;
            var v = d[i - 1][j] + 1, w = d[i][j - 1] + 1, x = d[i - 1][j - 1] + cost;
            d[i][j] = Math.min(v, Math.min(w, x));
        }
        return d[m][n];
    }
    function allLayersList() {
        var out = [];
        walkLayers(doc.layers, function (ly) { out.push(ly); }, 0, 0);
        return out;
    }
    // How one spec layer is present in the file: { ly, how: "exact"|"case"|"near"|"missing" }
    function matchSpecLayer(spec, layers) {
        var want = normName(spec.name), best = null, bestD = 99;
        for (var i = 0; i < layers.length; i++) {
            var nm = "";
            try { nm = layers[i].name; } catch (e) { continue; }
            if (nm === spec.name) return { ly: layers[i], how: "exact" };
        }
        for (var j = 0; j < layers.length; j++) {
            try { if (normName(layers[j].name) === want) return { ly: layers[j], how: "case" }; } catch (e2) {}
        }
        for (var k = 0; k < layers.length; k++) {
            try {
                var n2 = normName(layers[k].name);
                if (n2 === "") continue;
                var dist = lev(n2, want);
                var close = (dist <= 2 && dist < want.length - 1) || (n2.length >= 4 && want.indexOf(n2) === 0) || (want.length >= 4 && n2.indexOf(want) === 0);
                if (close && dist < bestD) { bestD = dist; best = layers[k]; }
            } catch (e3) {}
        }
        if (best) return { ly: best, how: "near" };
        return { ly: null, how: "missing" };
    }
    // Layers of the sign type: missing, misnamed or the wrong colour. The whole file is checked
    // (layers belong to the file, not to an artboard or a selection).
    function jLayers(t) {
        return function () {
            var issues = [];
            var layers = allLayersList(), used = {};
            for (var i = 0; i < t.layers.length; i++) {
                var spec = t.layers[i];
                var m = matchSpecLayer(spec, layers);
                if (m.how === "missing") {
                    issues.push(mk("bad", "Layers", "\"" + spec.name + "\"", "Layer is missing (colour " + spec.color + ")", null, null));
                    continue;
                }
                var cur = "";
                try { cur = m.ly.name; } catch (eN) {}
                if (m.how === "near") issues.push(mk("bad", "Layers", "\"" + cur + "\"", "Looks like a misspelled \"" + spec.name + "\" - rename it to \"" + spec.name + "\"", null, null));
                else if (m.how === "case") issues.push(mk("warn", "Layers", "\"" + cur + "\"", "Name differs in capitals / spaces from \"" + spec.name + "\"", null, null));
                var want = specRGB(spec.color), have = layerRGB(m.ly);
                if (want && have && !rgbNear(want, have))
                    issues.push(mk("bad", "Layers", "\"" + cur + "\"", "Layer colour is " + colorNameOfRGB(have) + ", should be " + spec.color, null, null));
            }
            if (t.layers.length === 0) return null;
            setInfo(t.layers.length + " layer" + (t.layers.length === 1 ? "" : "s") + " in the spec", "");
            return issues;
        };
    }
    function topLayerOf(ly) {
        var p = ly, g = 0;
        while (p && g++ < 60) {
            try { if (p.parent && p.parent.typename === "Document") return p; p = p.parent; } catch (e) { break; }
        }
        return ly;
    }
    // Top-level layers that are not in the spec (any layer with "design" in its name is allowed).
    // Everything on them is deleted by the fix. Checked for the whole file.
    function jExtraLayers(t) {
        return function () {
            var issues = [], keep = {}, all = allLayersList();
            for (var i = 0; i < t.layers.length; i++) {
                var m = matchSpecLayer(t.layers[i], all);
                if (m.ly) { try { keep[topLayerOf(m.ly).name] = true; } catch (e0) {} }
            }
            for (var j = 0; j < doc.layers.length; j++) {
                var ly = doc.layers[j], nm = "";
                try { nm = ly.name; } catch (e1) { continue; }
                if (keep[nm] || normName(nm).indexOf("design") >= 0) continue;
                var n = 0;
                try { n = ly.pageItems.length; } catch (e2) {}
                issues.push(mk("bad", "Extra Layers", "\"" + nm + "\"", "Not in the spec for this sign type (" + n + " item" + (n === 1 ? "" : "s") + " on it) - the fix deletes the layer and everything on it", null, null));
            }
            return issues;
        };
    }
    function elementOk(kind) {
        if (kind === "black") return function (c) { return isBlack100(c); };
        return function (c) {
            if (isCutStroke(c)) return true;
            try { return c.typename === "CMYKColor" && Math.round(c.cyan) === 0 && Math.round(c.magenta) === 100 && Math.round(c.yellow) === 0 && Math.round(c.black) === 0; } catch (e) { return false; }
        };
    }
    function elementMsg(kind) { return kind === "black" ? "stroke is not 100% black" : "stroke is not 100% magenta / CutContour spot"; }
    // Art on the spec layers that has a stroke / colour rule (1 pt, 100% black or magenta). Free layers are not checked.
    function jLayerArt(t) {
        return function () {
            var issues = [], any = false;
            var layers = allLayersList();
            for (var i = 0; i < t.layers.length; i++) {
                var spec = t.layers[i];
                if (!spec.stroke && !spec.element) continue;
                var m = matchSpecLayer(spec, layers);
                if (m.how === "missing") continue;
                any = true;
                var target = normName(m.ly.name);
                var rule = { stroke: "req", width1pt: !!spec.stroke, strokeOk: spec.element ? elementOk(spec.element) : null, strokeMsg: spec.element ? elementMsg(spec.element) : "" };
                var res = checkLayerPaths(function (n) { return normName(n) === target; }, rule);
                reasonsToIssues(res, "Layer Art", spec.name, issues);
            }
            if (!any) return null;
            return issues;
        };
    }

    function buildChecks(t) {
        var list = [];
        if (t.notes && t.notes.length) list.push({ label: "Sheet Notes", fn: jNotes(t.notes) });
        list.push({ label: "Layers", fn: jLayers(t), fix: "layers" });
        list.push({ label: "Extra Layers", fn: jExtraLayers(t), fix: "extralayers" });
        list.push({ label: "Layer Art (stroke / colour)", fn: jLayerArt(t), fix: "layerart" });
        list.push({ label: "Hairline Strokes", fn: jHairlines });
        list.push({ label: "Stacked Duplicates", fn: jDuplicates("warn") });
        list.push({ label: "Items Off Artboard", fn: jOutside });
        list.push({ label: "Artboard Size", fn: jArtboardSize });
        return list;
    }

    // ---- Scan -------------------------------------------------------
    function worst(issues) {
        var s = "ok";
        for (var i = 0; i < issues.length; i++) {
            if (issues[i].sev === "bad") return "bad";
            if (issues[i].sev === "warn") s = "warn";
        }
        return s;
    }
    // ---- Ignored rows (per file, remembered) ----
    var lastMeta = { docName: "", docKey: "unsaved", docPath: "", artNames: [], nObjs: 0 };
    function docKeyNow() {
        if (!JOBMODE) return lastMeta.docKey;
        var k = "";
        try { k = doc.fullName.fsName; } catch (e) { try { k = doc.name; } catch (e2) { k = "unsaved"; } }
        return k;
    }
    var ignoredMap = {};
    function ignoreKey(label) {
        return docKeyNow() + "::" + label;
    }
    function loadIgnored() {
        ignoredMap = {};
        var raw = "";
        try { raw = app.preferences.getStringPreference("signpack/preflight/ignored") || ""; } catch (e) {}
        if (raw === "") return;
        var parts = raw.split("||");
        for (var i = 0; i < parts.length; i++) if (parts[i] !== "") ignoredMap[parts[i]] = true;
    }
    function saveIgnored() {
        var arr = [];
        for (var k in ignoredMap) if (ignoredMap[k]) arr.push(k);
        if (arr.length > 300) arr = arr.slice(arr.length - 300);
        try { app.preferences.setStringPreference("signpack/preflight/ignored", arr.join("||")); } catch (e) {}
    }
    function isIgnored(label) { return ignoredMap[ignoreKey(label)] === true; }

    function runOne(def) {
        var res = { label: def.label, status: "ok", issues: [], info: "", badge: "", fix: def.fix || null, fixDefault: def.fixDefault || null, labelTool: def.labelTool || false, ignored: false };
        if (isIgnored(def.label)) {
            res.status = "off"; res.ignored = true;
            res.info = "Ignored by you for this file. Select this row and press Unignore to check it again.";
            return res;
        }
        setInfo("", "");
        try {
            var out = def.fn();
            res.info = infoNote; res.badge = infoBadge;
            if (out === null) { res.status = "off"; return res; }
            res.issues = out;
            res.status = worst(out);
            if (res.status === "ok" && res.info === "") res.info = "Checked, no problems found";
        } catch (e) {
            res.status = "warn";
            res.issues = [mk("warn", def.label, "This check could not run", "" + e + (e && e.line ? " (line " + e.line + ")" : ""), null, null)];
        }
        return res;
    }

    var stdResults = [], jobResults = [];
    function scanStandard() {
        stdResults = [];
        for (var i = 0; i < STANDARD.length; i++) {
            if (!modeAllows("std", STANDARD[i].label)) continue;
            stdResults.push(runOne(STANDARD[i]));
        }
    }
    function scanJob() {
        jobResults = [];
        var defs = buildChecks(curType);
        for (var i = 0; i < defs.length; i++) {
            if (!modeAllows("job", defs[i].label)) continue;
            jobResults.push(runOne(defs[i]));
        }
    }

    if (JOBMODE) {
        var JB = $.global.__PF_JOB;
        $.global.__PF_JOB = null;
        var JO = {};
        try {
            for (var jc = 0; jc < CLIENTS.length; jc++) if (CLIENTS[jc].label === JB.client) applyClientSettings(CLIENTS[jc]);
            scopeIdx = JB.scopeIdx;
            gapEnabled = JB.gap;
            curType = typeAt(JB.typeIdx);
            refreshDoc();
            loadIgnored();
            JO.docName = "";
            try { JO.docName = doc.name; } catch (eJ1) {}
            JO.docKey = docKeyNow();
            JO.docPath = "";
            try { if (doc.saved) JO.docPath = doc.fullName.path; } catch (eJ2) {}
            JO.artNames = [];
            try { for (var ja = 0; ja < doc.artboards.length; ja++) JO.artNames.push(String(doc.artboards[ja].name)); } catch (eJ3) {}
            JO.nObjs = 0;
            try { JO.nObjs = doc.pageItems.length; } catch (eJ4) {}
            if (!JB.jobOnly) scanStandard();
            scanJob();
            JO.scopeIdx = scopeIdx;
            JO.scopeRect = scopeRect;
            JO.selCount = selCount;
            JO.unused = unusedSwatchNames;
            var jall = (JB.jobOnly ? [] : stdResults).concat(jobResults);
            for (var jr = 0; jr < jall.length; jr++)
                for (var ji = 0; ji < jall[jr].issues.length; ji++) jall[jr].issues[ji].ab = artboardLabelDoc(jall[jr].issues[ji]);
            JO.std = JB.jobOnly ? null : stdResults;
            JO.job = jobResults;
        } catch (eJob) {
            JO = { error: "" + eJob + (eJob && eJob.line ? " (line " + eJob.line + ")" : "") };
        }
        // toSource() leaves some characters raw (line / paragraph separators and other
        // control characters, common in live text and object names). eval() on the
        // palette side then fails with "Unterminated string constant", so escape them.
        $.global.__PF_RESULT = JO.toSource().replace(/[\u0000-\u001f\u2028\u2029]/g, function (ch) {
            return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4);
        });
        return;
    }

    // ============================================================
    //  UI
    // ============================================================
    var POPUP_DEFS = uik().popupDefs;


    var ICON_DATA = {
        ok: "pf_icon_ok.png",
        warn: "pf_icon_warn.png",
        bad: "pf_icon_bad.png",
        off: "pf_icon_off.png"
    };
    // ---- Color square pictures for the Named Colors list ----------
    // Builds a tiny PNG (solid color with a thin grey edge) in memory, so no
    // picture files need to ship with the script. Returns the file bytes as a string.
    var swatchImages = {};
    function swatchPngString(rgb) {
        var W = 24, H = 14;
        function be32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
        var crcTable = [];
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            crcTable[n] = c >>> 0;
        }
        function crc32(bytes) {
            var crc = 0xFFFFFFFF;
            for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
            return (crc ^ 0xFFFFFFFF) >>> 0;
        }
        function chunk(type, data) {
            var t = [type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)];
            var body = t.concat(data);
            return be32(data.length).concat(body, be32(crc32(body)));
        }
        var raw = [];
        for (var y = 0; y < H; y++) {
            raw.push(0);
            for (var x = 0; x < W; x++) {
                if (x === 0 || y === 0 || x === W - 1 || y === H - 1) raw.push(128, 128, 128);
                else raw.push(rgb[0], rgb[1], rgb[2]);
            }
        }
        var a = 1, b = 0;
        for (var j = 0; j < raw.length; j++) { a = (a + raw[j]) % 65521; b = (b + a) % 65521; }
        var len = raw.length;
        var z = [0x78, 0x01, 0x01, len & 255, (len >>> 8) & 255, (~len) & 255, ((~len) >>> 8) & 255].concat(raw, be32(((b << 16) | a) >>> 0));
        var png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].concat(
            chunk("IHDR", be32(W).concat(be32(H), [8, 2, 0, 0, 0])),
            chunk("IDAT", z),
            chunk("IEND", []));
        var s = "";
        for (var q = 0; q < png.length; q++) s += String.fromCharCode(png[q]);
        return s;
    }
    function getSwatchImage(rgb) {
        var key = rgb[0] + "_" + rgb[1] + "_" + rgb[2];
        if (swatchImages[key] !== undefined) return swatchImages[key];
        var im = null;
        try {
            var f = new File(Folder.temp.fsName + "/signpack_pf_sw_" + key + ".png");
            f.encoding = "BINARY";
            if (f.open("w")) { f.write(swatchPngString(rgb)); f.close(); }
            if (f.exists && f.length > 50) im = ScriptUI.newImage(f);
        } catch (eSw) { im = null; }
        swatchImages[key] = im;
        return im;
    }

    var iconFiles = {};
    function getIconFileEarly(status) { return getIconFile(status); }
    // Writes the embedded PNG to the temp folder once, returns the File (or null).
    function getIconFile(status) {
        if (iconFiles[status] !== undefined) return iconFiles[status];
        var f = null;
        try {
            f = assetFile(ICON_DATA[status]);
            if (!f || f.length < 50) f = null;
        } catch (e) { f = null; }
        iconFiles[status] = f;
        return f;
    }

    // Fixed pool of rows ("slots") per panel. Rows are never added/removed after
    // the window opens; each scan just updates the slots in place. Each row has ONE
    // image control whose picture is swapped (no stacked / hidden images).
    var STATUS_KEYS = ["ok", "warn", "bad", "off"];
    var iconImages = {};
    function getIconImage(status) {
        if (iconImages[status] !== undefined) return iconImages[status];
        var im = null;
        try {
            var f = getIconFile(status);
            if (f) im = ScriptUI.newImage(f);
        } catch (e) { im = null; }
        iconImages[status] = im;
        return im;
    }

    try {
        if ($.global.__preflightWin && $.global.__preflightWin instanceof Window) {
            $.global.__preflightWin.close();
        }
    } catch (ePrev) {}

    var win = new Window("palette", "Preflight Check 1.1");
    $.global.__preflightWin = win;
    paintWin(win);   // dark grey first: the UI Kit picks the white logo on a dark window
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = uik().MARGINS;
    win.spacing = uik().SPACING;

    var btnProd = null;     // created with the buttons below
    var titleRow = win.add("group");
    titleRow.orientation = "row";
    titleRow.alignment = ["fill", "top"];
    titleRow.alignChildren = ["left", "center"];
    titleRow.spacing = 10;
    titleRow.margins = 0;
    addHeaderLogo(titleRow, win);
    var titleSpacer = titleRow.add("group");
    titleSpacer.alignment = ["fill", "center"];
    var modeBadge = titleRow.add("statictext", undefined, "PRODUCTION");
    modeBadge.keepColor = true;   // keeps its own orange / blue
    modeBadge.preferredSize.width = 100;
    try { modeBadge.justify = "right"; } catch (eJu) {}
    modeBadge.alignment = ["right", "bottom"];   // right next to the title, on its bottom line
    try { modeBadge.graphics.font = ScriptUI.newFont("dialog", "BOLD", 13); } catch (eMB) {}
    addHeaderTitle(titleRow, "Preflight Check");
    addAccentLine(win);
    function setModeUI() {
        var d = (CURRENT_MODE === "design");
        try {
            modeBadge.text = d ? "DESIGN" : "PRODUCTION";
            modeBadge.graphics.foregroundColor = modeBadge.graphics.newPen(modeBadge.graphics.PenType.SOLID_COLOR, d ? [0.4, 0.7, 1] : [1, 0.65, 0.25], 1);
            win.text = "Preflight Check 1.1 - " + (d ? "Design" : "Production");
            if (btnProd) btnProd.visible = !d;      // designers do not build production files
        } catch (eMU) {}
    }

    // Job type row
    var jobRow = win.add("group");
    jobRow.orientation = "row";
    jobRow.alignChildren = ["left", "center"];
    jobRow.add("statictext", undefined, "Sign type:");
    var jobLabels = [], defaultIdx = 0;
    for (var jl = 0; jl < SIGN_TYPES.length; jl++) {
        jobLabels.push(SIGN_TYPES[jl].label);
        if (SIGN_TYPES[jl].label === DEFAULT_TYPE) defaultIdx = jl;
    }
    var ddJob = jobRow.add("dropdownlist", undefined, jobLabels);
    ddJob.preferredSize.width = 250;
    var savedJob = defaultIdx;
    try {
        var sjl = app.preferences.getStringPreference("signpack/preflight/signtype");
        for (var sj = 0; sj < SIGN_TYPES.length; sj++) if (SIGN_TYPES[sj].label === sjl) savedJob = sj;
    } catch (ePref) {}
    ddJob.selection = savedJob;
    curType = typeAt(savedJob);
    jobRow.add("statictext", undefined, "Client:").margins = [14, 0, 0, 0];
    var clientLabels = [];
    for (var cl = 0; cl < CLIENTS.length; cl++) clientLabels.push(CLIENTS[cl].label);
    var ddClient = jobRow.add("dropdownlist", undefined, clientLabels);
    ddClient.preferredSize.width = 170;
    var savedClient = 0;
    try {
        var scl = app.preferences.getStringPreference("signpack/preflight/client");
        for (var sc = 0; sc < CLIENTS.length; sc++) if (CLIENTS[sc].label === scl) savedClient = sc;
    } catch (ePref2) {}
    ddClient.selection = savedClient;
    applyClientSettings(CLIENTS[savedClient]);
    curType = typeAt(savedJob);
    setModeUI();

    // Summary row: overall icon + counts, artboard selector on the right
    var sumRow = win.add("group");
    sumRow.orientation = "row";
    sumRow.alignChildren = ["left", "center"];
    sumRow.alignment = ["fill", "top"];
    sumRow.spacing = 10;
    var sumIcon = null;
    try {
        var sf0 = getIconFileEarly("off");
        if (sf0) sumIcon = sumRow.add("image", undefined, sf0);
    } catch (eSum) { sumIcon = null; }
    if (!sumIcon) sumIcon = sumRow.add("statictext", undefined, "-");
    sumIcon.preferredSize = [20, 20];
    sumIcon.minimumSize = [20, 20];
    // Verdict banner: coloured bar with one clear sentence (drawn by hand).
    var sumBanner = sumRow.add("button", undefined, "");
    sumBanner.preferredSize = [300, 26];
    sumBanner.msg = "Scanning...";
    sumBanner.status = "off";
    sumBanner.onDraw = function () {
        try {
            var g = this.graphics, w = this.size.width, h = this.size.height, st = this.status;
            var bg = st === "bad" ? [0.34, 0.12, 0.12, 1] : st === "warn" ? [0.36, 0.28, 0.07, 1] : st === "ok" ? [0.09, 0.28, 0.13, 1] : [0.2, 0.2, 0.2, 1];
            var bar = st === "bad" ? [0.93, 0.28, 0.28, 1] : st === "warn" ? [0.97, 0.72, 0.13, 1] : st === "ok" ? TSP_GREEN_HI : [0.5, 0.5, 0.5, 1];
            g.newPath(); g.rectPath(0, 0, w, h); g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, bg));
            g.newPath(); g.rectPath(0, 0, 4, h); g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, bar));
            g.drawString(this.msg, g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, 1], 1), 12, 5, ScriptUI.newFont("dialog", "BOLD", 13));
        } catch (eBn) {}
    };
    sumBanner.alignment = ["fill", "center"];
    sumRow.add("statictext", undefined, "Artboard:");
    var ddArt = sumRow.add("dropdownlist", undefined, ["All artboards"]);
    ddArt.preferredSize.width = 190;
    ddArt.selection = 0;

    // Two collapsible sections, stacked: Standard checks, Sign type checks.
    // Each header is drawn by hand (green bar, title, counts, chevron). Rows live in a body group with a
    // fixed height that is set to 0 when the section is closed.
    var VIEW_ROWS = STANDARD.length;
    var BODY_H = VIEW_ROWS * 30 + 8;
    var winShown = false;
    var sections = [];
    // Some parts of the window stay unpainted until the mouse passes over them (heavy files make Illustrator
    // slow to repaint). Hiding and showing the controls, plus a 1 px size nudge, makes it paint everything.
    function isSectionGroup(c) { for (var i = 0; i < sections.length; i++) if (sections[i].group === c) return true; return false; }
    function forceRepaint() {
        // Setting the window background again (a different shade first) makes Illustrator erase and repaint
        // the whole window, including the margins around the controls.
        try {
            var gw = win.graphics;
            gw.backgroundColor = gw.newBrush(gw.BrushType.SOLID_COLOR, [0.2, 0.2, 0.2, 1]);
            gw.backgroundColor = gw.newBrush(gw.BrushType.SOLID_COLOR, TSP_BG);
        } catch (eBg) {}
        try {
            for (var i = 0; i < win.children.length; i++) {
                var c = win.children[i];
                if (isSectionGroup(c)) continue;
                if (c.visible) { c.visible = false; c.visible = true; }
            }
            for (var j = 0; j < sections.length; j++) { try { sections[j].head.visible = false; sections[j].head.visible = true; sections[j].redraw(); } catch (eHv) {} }
            var w0 = win.size.width, h0 = win.size.height;
            win.size = [w0 + 1, h0];
            win.layout.layout(true);
            win.size = [w0, h0];
            win.layout.layout(true);
            win.update();
        } catch (eFr) {}
    }
    function makeSection(title, bodyOrientation) {
        var sec = { title: title, open: true, bad: 0, warn: 0, total: 0, hover: false };
        sec.group = win.add("group");
        sec.group.orientation = "column";
        sec.group.alignChildren = ["fill", "top"];
        sec.group.alignment = ["fill", "top"];
        sec.group.spacing = 2;
        sec.group.margins = 0;
        sec.head = sec.group.add("button", undefined, "");
        sec.head.preferredSize = [1, 26];
        sec.head.alignment = ["fill", "top"];
        sec.head.helpTip = "Click to open or close.";
        sec.body = sec.group.add("group");
        sec.body.orientation = bodyOrientation;
        sec.body.alignChildren = ["fill", "top"];
        sec.body.alignment = ["fill", "top"];
        sec.body.margins = [8, 6, 8, 2];
        sec.body.spacing = 4;
        sec.body.preferredSize = [1, BODY_H];
        sec.body.minimumSize = [0, BODY_H];
        sec.body.maximumSize = [10000, BODY_H];
        sec.head.onDraw = function () {
            try {
                var g = this.graphics, w = this.size.width, h = this.size.height;
                g.newPath(); g.rectPath(0, 0, w, h);
                var shade = sec.hover ? 0.24 : 0.19;
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [shade, shade, shade, 1]));
                g.newPath(); g.rectPath(0, 0, 4, h);
                var stripe = sec.bad > 0 ? [0.93, 0.28, 0.28, 1] : (sec.warn > 0 ? [0.97, 0.72, 0.13, 1] : (sec.total > 0 ? TSP_GREEN_HI : [0.5, 0.5, 0.5, 1]));
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, stripe));
                var white = g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, 1], 1);
                var fT = ScriptUI.newFont("dialog", "BOLD", 12);
                g.drawString(sec.title, white, 12, 5, fT);
                // chevron: right when closed, down when open
                var cp = g.newPen(g.PenType.SOLID_COLOR, [0.85, 0.85, 0.85, 1], 1.6);
                g.newPath();
                if (sec.open) { g.moveTo(w - 22, h / 2 - 2); g.lineTo(w - 18, h / 2 + 2); g.lineTo(w - 14, h / 2 - 2); }
                else { g.moveTo(w - 20, h / 2 - 4); g.lineTo(w - 16, h / 2); g.lineTo(w - 20, h / 2 + 4); }
                g.strokePath(cp);
                // counts, right-aligned before the chevron
                var fC = ScriptUI.newFont("dialog", "REGULAR", 11);
                var parts = [];
                if (sec.bad > 0) parts.push({ t: sec.bad + (sec.bad === 1 ? " error" : " errors"), c: [0.93, 0.28, 0.28, 1] });
                if (sec.warn > 0) parts.push({ t: sec.warn + (sec.warn === 1 ? " warning" : " warnings"), c: [0.97, 0.72, 0.13, 1] });
                if (!parts.length && sec.total > 0) parts.push({ t: "All clear", c: TSP_GREEN_HI });
                var x = w - 34;
                for (var pi = parts.length - 1; pi >= 0; pi--) {
                    var tw = g.measureString(parts[pi].t, fC)[0];
                    x -= tw;
                    g.drawString(parts[pi].t, g.newPen(g.PenType.SOLID_COLOR, parts[pi].c, 1), x, 6, fC);
                    x -= 12;
                }
            } catch (eHd) {}
        };
        var redrawHead = function () { try { sec.head.notify("onDraw"); } catch (eRd) {} };
        sec.redraw = redrawHead;
        sec.head.addEventListener("mouseover", function () { sec.hover = true; redrawHead(); });
        sec.head.addEventListener("mouseout", function () { sec.hover = false; redrawHead(); });
        sec.head.onClick = function () {
            setSectionOpen(sec, !sec.open);
            // Opening a section shows its first problem in the list below.
            try {
                if (sec.open && sec.getResults) {
                    var rs = sec.getResults(), pick = null;
                    for (var i = 0; i < rs.length && !pick; i++) if (rs[i].status === "bad") pick = rs[i];
                    for (var j = 0; j < rs.length && !pick; j++) if (rs[j].status === "warn") pick = rs[j];
                    if (pick) showDetails(pick);
                }
            } catch (eHc) {}
        };
        sections.push(sec);
        return sec;
    }
    function setSectionOpen(sec, open) {
        if (sec.open === open) return;
        sec.open = open;
        var h = open ? BODY_H : 0;
        sec.body.preferredSize = [1, h];
        sec.body.minimumSize = [0, h];
        sec.body.maximumSize = [10000, h];
        sec.body.visible = open;
        if (winShown) {
            try {
                win.size = [win.size.width, win.size.height + (open ? BODY_H : -BODY_H)];
                win.layout.layout(true);
                forceRepaint();
            } catch (eSz) {}
        }
        sec.redraw();
    }
    var stdSec = makeSection("Standard checks", "column");
    var jobSec = makeSection("Sign type checks", "row");
    stdSec.getResults = function () { return stdResults; };
    jobSec.getResults = function () { return jobResults; };
    var stdPanel = stdSec.body;
    var jobPanel = jobSec.body;
    var jobRows = jobPanel.add("group");
    jobRows.orientation = "column";
    jobRows.alignChildren = ["fill", "top"];
    jobRows.alignment = ["fill", "top"];
    jobRows.spacing = 6;
    var jobScroll = jobPanel.add("scrollbar", undefined, 0, 0, 0);
    jobScroll.alignment = ["right", "fill"];
    jobScroll.preferredSize = [18, BODY_H - 8];
    try { jobScroll.stepdelta = 1; } catch (eSd) {}
    // Both sections start closed (the header shows the error / warning counts); click a header to open it.
    function countStatuses(sec, results) {
        sec.bad = 0; sec.warn = 0; sec.total = 0;
        for (var i = 0; i < results.length; i++) {
            if (results[i].status === "off") continue;
            sec.total++;
            if (results[i].status === "bad") sec.bad++;
            else if (results[i].status === "warn") sec.warn++;
        }
    }
    var sectionsInit = false;
    function refreshSections() {
        countStatuses(stdSec, stdResults);
        countStatuses(jobSec, jobResults);
        for (var si = 0; si < sections.length; si++) {
            var sc = sections[si];
            // Closed when the window opens; later scans keep whatever the user opened.
            if (!sectionsInit) setSectionOpen(sc, false);
            sc.redraw();
        }
        sectionsInit = true;
    }

    var stdSlots, jobSlots;   // created below once the helpers exist

    var detailRow = win.add("group");
    detailRow.orientation = "row";
    detailRow.alignChildren = ["left", "center"];
    detailRow.alignment = ["fill", "top"];
    var detailTitle = detailRow.add("statictext", undefined, "");
    detailTitle.preferredSize.width = 440;
    var chkGap = detailRow.add("checkbox", undefined, "Tight-gap check (slow)");
    chkGap.helpTip = "Compares bounding boxes of top-level items. Only used for cut-type signs (cut vinyl, channel letters, print & cut...).";
    var viewStack = win.add("group");
    viewStack.orientation = "stack";
    viewStack.alignment = ["fill", "top"];
    viewStack.alignChildren = ["fill", "fill"];
    viewStack.margins = 0;
    var list = viewStack.add("listbox", undefined, [], {
        numberOfColumns: 5,
        showHeaders: true,
        columnWidths: [28, 100, 150, 235, 57],
        columnTitles: ["#", "Check", "Item", "Detail", "Artboard"]
    });
    list.preferredSize.width = 580;
    try { list.graphics.font = ScriptUI.newFont("dialog", "REGULAR", 12); } catch (eLf) {}
    list.preferredSize.height = 190;

    // ---- Custom view: colour chips (swatches, named colours) or the big "all clear" mark ----
    var canvas = viewStack.add("button", undefined, "");
    canvas.preferredSize = [580, 190];
    canvas.visible = false;
    var CHIP = 26, CGAP = 5, CPAD = 10, CFOOT = 26;
    var view = { mode: "list", rects: [], map: [], hover: -1, sel: -1, more: 0, title: "", msg: "" };
    function chipLine() {
        var ix = view.hover >= 0 ? view.hover : view.sel;
        if (ix < 0 || !view.map[ix] && view.map[ix] !== 0) return "";
        var is = detailIssues[view.map[ix]];
        return is ? (is.name + (is.desc ? "  -  " + is.desc : (is.detail ? "  -  " + is.detail : ""))) : "";
    }
    canvas.onDraw = function () {
        try {
            var g = this.graphics, w = this.size.width, h = this.size.height;
            g.newPath(); g.rectPath(0, 0, w, h); g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [0.15, 0.15, 0.15, 1]));
            var white = g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, 1], 1);
            var grey = g.newPen(g.PenType.SOLID_COLOR, [0.65, 0.65, 0.65, 1], 1);
            if (view.mode === "clear") {
                var cx = w / 2, cy = h / 2 - 18, r = 28;
                g.newPath(); g.ellipsePath(cx - r, cy - r, r * 2, r * 2);
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, TSP_GREEN));
                var cp = g.newPen(g.PenType.SOLID_COLOR, [1, 1, 1, 1], 4);
                g.newPath(); g.moveTo(cx - 12, cy + 1); g.lineTo(cx - 3, cy + 10); g.lineTo(cx + 14, cy - 9); g.strokePath(cp);
                var fT = ScriptUI.newFont("dialog", "BOLD", 15), fM = ScriptUI.newFont("dialog", "REGULAR", 12);
                var tw = g.measureString(view.title, fT)[0];
                g.drawString(view.title, white, cx - tw / 2, cy + r + 10, fT);
                var mw = g.measureString(view.msg, fM)[0];
                g.drawString(view.msg, grey, cx - mw / 2, cy + r + 34, fM);
                return;
            }
            if (view.mode !== "chips") return;
            var cols = Math.max(1, Math.floor((w - 2 * CPAD + CGAP) / (CHIP + CGAP)));
            var rowsMax = Math.max(1, Math.floor((h - CPAD - CFOOT - CPAD + CGAP) / (CHIP + CGAP)));
            var cap = cols * rowsMax, n = Math.min(view.map.length, cap);
            view.rects = [];
            for (var i = 0; i < n; i++) {
                var col = i % cols, row = Math.floor(i / cols);
                var x = CPAD + col * (CHIP + CGAP), y = CPAD + row * (CHIP + CGAP);
                view.rects.push([x, y, CHIP, CHIP]);
                var rgb = detailIssues[view.map[i]].rgb || [0, 0, 0];
                g.newPath(); g.rectPath(x, y, CHIP, CHIP);
                g.fillPath(g.newBrush(g.BrushType.SOLID_COLOR, [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1]));
                var sel = (i === view.sel), hov = (i === view.hover);
                g.newPath(); g.rectPath(x, y, CHIP, CHIP);
                g.strokePath(g.newPen(g.PenType.SOLID_COLOR, sel ? [1, 1, 1, 1] : (hov ? [0.85, 0.85, 0.85, 1] : [0.38, 0.38, 0.38, 1]), sel ? 3 : 1));
            }
            var fL = ScriptUI.newFont("dialog", "REGULAR", 12);
            var info = chipLine();
            if (info === "") info = "Click a colour to pick it.";
            g.drawString(info, white, CPAD, h - CFOOT + 3, fL);
            var hidden = (view.map.length - n) + view.more;
            if (hidden > 0) {
                var mt = "+" + hidden + " more not shown";
                g.drawString(mt, grey, w - CPAD - g.measureString(mt, fL)[0], h - CFOOT + 3, fL);
            }
        } catch (eCv) {}
    };
    function chipAt(ev) {
        try {
            var x = ev.clientX, y = ev.clientY;
            for (var i = 0; i < view.rects.length; i++) {
                var r = view.rects[i];
                if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return i;
            }
        } catch (eAt) {}
        return -1;
    }
    canvas.addEventListener("mousemove", function (ev) {
        if (view.mode !== "chips") return;
        var i = chipAt(ev);
        if (i !== view.hover) { view.hover = i; try { canvas.notify("onDraw"); } catch (eMm) {} }
    });
    canvas.addEventListener("mouseout", function () {
        if (view.hover !== -1) { view.hover = -1; try { canvas.notify("onDraw"); } catch (eMo) {} }
    });
    canvas.addEventListener("mousedown", function (ev) {
        if (view.mode !== "chips") return;
        var i = chipAt(ev);
        if (i < 0) return;
        view.sel = (view.sel === i) ? -1 : i;
        try {
            if (view.sel >= 0) list.selection = list.items[view.map[view.sel]];
            else list.selection = null;
        } catch (eSl) {}
        try { updateButtons(); } catch (eUb2) {}
        try { canvas.notify("onDraw"); } catch (eMd) {}
    });
    function setView(mode, title, msg) {
        view.mode = mode; view.title = title || ""; view.msg = msg || "";
        view.hover = -1; view.sel = -1;
        list.visible = (mode === "list");
        canvas.visible = (mode !== "list");
        try { canvas.notify("onDraw"); } catch (eSv) {}
    }

    var detailIssues = [];
    var curRes = null;

    // Which artboard an issue sits on (by the center of the item), for the Artboard column
    function artboardLabel(iss) { return (iss && iss.ab) ? iss.ab : ""; }
    function artboardLabelDoc(iss) {
        try {
            if (!iss.collection || iss.idx === null || iss.idx === undefined) return "";
            if (iss.collection === "artboard") return String(doc.artboards[iss.idx].name);
            if (iss.collection === "layer") return "";
            var it = (iss.collection === "pageItems") ? resolveTopIdx(doc, iss.idx) : doc[iss.collection][iss.idx];
            var b = it.geometricBounds;
            var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
            for (var a = 0; a < doc.artboards.length; a++) {
                var r = doc.artboards[a].artboardRect;
                if (cx >= r[0] && cx <= r[2] && cy <= r[1] && cy >= r[3]) return String(doc.artboards[a].name);
            }
            for (var a2 = 0; a2 < doc.artboards.length; a2++) {
                var r2 = doc.artboards[a2].artboardRect;
                if (!(b[2] < r2[0] || b[0] > r2[2] || b[1] < r2[3] || b[3] > r2[1])) return String(doc.artboards[a2].name);
            }
            return "off artboards";
        } catch (e) { return ""; }
    }

    function showDetails(res) {
        curRes = res;
        list.removeAll();
        detailIssues = res.issues;
        detailTitle.text = res.label + ": " + (res.status === "off" ? "not run" : (problemCount(res.issues) === 0 ? (res.info || "nothing to report") : problemCount(res.issues) + " item(s)" + (res.info ? " | " + res.info : "")));
        if (res.status === "off" && res.info) detailTitle.text = res.label + ": " + res.info;
        else if (!res.ignored && (res.status === "bad" || res.status === "warn")) {
            detailTitle.text += res.fix ? "  Press Fix." : "  Fix it by hand (Select item).";
        }
        for (var i = 0; i < res.issues.length; i++) {
            var iss = res.issues[i];
            var it = list.add("item", String(i + 1));
            if (iss.rgb) { try { var swImg = getSwatchImage(iss.rgb); if (swImg) it.image = swImg; } catch (eSwI) {} }
            else if (res.status === "bad" || res.status === "warn") { try { var stImg = getIconImage(res.status); if (stImg) it.image = stImg; } catch (eStI) {} }
            it.subItems[0].text = iss.check;
            it.subItems[1].text = iss.name;
            it.subItems[2].text = iss.detail;
            it.subItems[3].text = artboardLabel(iss);
        }
        // Pick the view: colour chips when the rows are colours, the big green mark when there is nothing to fix.
        var chipMap = [], hiddenRows = 0;
        for (var ci = 0; ci < res.issues.length; ci++) {
            if (res.issues[ci].rgb) chipMap.push(ci);
            else { var mm = /^\.\.\.and (\d+) more/.exec(String(res.issues[ci].name)); if (mm) hiddenRows += parseInt(mm[1], 10); }
        }
        if (chipMap.length > 0) {
            setView("chips");
            view.map = chipMap;
            view.more = hiddenRows;
            view.rects = [];
            if (res.fix === "swatches") detailTitle.text = res.label + ": " + chipMap.length + "  Pick one, or Fix for all.";
            else if (res.labelTool) detailTitle.text = res.label + ": " + chipMap.length + "  Pick a colour, then Add Label.";
            try { canvas.notify("onDraw"); } catch (eCd) {}
        } else if (res.issues.length === 0 && res.status !== "off") {
            setView("clear", "All clear", res.info || "Nothing to report for this check.");
        } else {
            setView("list");
        }
        updateButtons();
    }

    var iconSwapFailed = false;
    function makeSlot(panel) {
        var row = panel.add("group");
        row.orientation = "row";
        row.alignChildren = ["left", "center"];
        row.spacing = 8;
        var slot = { row: row, res: null, icon: null, lbl: null };
        try {
            var f0 = getIconFile("off");
            if (f0) slot.icon = row.add("image", undefined, f0);
        } catch (eImg) { slot.icon = null; }
        if (!slot.icon) slot.icon = row.add("statictext", undefined, "-");
        slot.icon.preferredSize = [20, 20];
        slot.icon.minimumSize = [20, 20];
        slot.lbl = row.add("statictext", undefined, "");
        slot.lbl.preferredSize.width = 380;
        slot.lbl.alignment = ["fill", "center"];
        try { slot.lbl.graphics.font = ScriptUI.newFont("dialog", "REGULAR", 12); } catch (eLb) {}
        var btn = row.add("button", undefined, "View");
        btn.preferredSize = [50, 22];
        btn.helpTip = "Shows the details of this check.";
        slot.btn = btn;
        btn.onClick = function () { if (slot.res) showDetails(slot.res); };
        row.visible = false;
        return slot;
    }
    function makeSlots(panel, n) {
        var out = [];
        for (var i = 0; i < n; i++) out.push(makeSlot(panel));
        return out;
    }
    function markerFor(status) {
        return status === "ok" ? "[OK] " : status === "warn" ? "[!] " : status === "bad" ? "[X] " : "[-] ";
    }
    // What each check looks at (shown as a tooltip on the row and its View button).
    function checkHelp(label) {
        var L = String(label);
        function has(k) { return L.indexOf(k) === 0; }
        if (has("Image DPI")) return "Placed and raster images: warns below " + SETTINGS.DPI_WARN + " ppi, marks red below " + SETTINGS.DPI_BAD + " ppi (effective resolution at the size used in the file).";
        if (has("Unused Swatches")) return "Swatches in the file that nothing uses. Fix removes them.";
        if (has("Named Colors")) return "Spot / named colors in the file. Pick one and use Add Label to put the color and its name in the file.";
        if (has("Text")) return "Live text, missing fonts and overset text.";
        if (has("File Color Mode")) return "The document color mode (CMYK or RGB).";
        if (has("Open Paths")) return "Open paths on the production layers (CutContour, Outline...). Cut paths must be closed.";
        if (has("Clipping Masks")) return "Clipping masks found in the file.";
        if (has("External Links")) return "Linked images: missing, modified or not embedded.";
        if (has("Sheet Notes")) return "Notes from the specs sheet for this sign type (and client).";
        if (has("No Bleed")) return "This sign type has no bleed: art should stay inside the artboard.";
        if (has("Bleed Past CutContour")) return "Printed art must run past the CutContour shape by this amount.";
        if (has("Bleed ")) return "Art must extend past the artboard edge by this amount on every side.";
        if (has("CutContour")) return "Needs a CutContour layer with the CutContour spot color and clean stroke-only closed paths.";
        if (has("No CutContour")) return "This sign type does not use a CutContour. Flags one if it is there.";
        if (has("No BoundingBox")) return "This sign type does not use a BoundingBox. Flags one if it is there.";
        if (has("BoundingBox")) return "Needs a BoundingBox layer with the right fill and stroke for this sign type.";
        if (has("Outline / Holes")) return "The Outline layer (required for rigid-material cut paths). Holes and White Ink are only checked if their layer exists.";
        if (has("Grommets")) return "Grommets are upon request: a Grommets layer is fine, none means check with the client.";
        if (has("Braille")) return "Braille elements should use a 1 pt outline on a Braille layer.";
        if (has("Routed")) return "Routed elements should use a 1 pt outline.";
        if (has("Narrowest Vinyl")) return "The narrowest part of a vinyl piece (for example the stem of a letter) must be at least " + SETTINGS.MIN_VINYL_WIDTH_INCHES + " in.";
        if (has("Thin Shapes")) return "Shapes that are thinner on average than " + SETTINGS.MIN_AVG_THICKNESS_INCHES + " in.";
        if (has("Undersized Items")) return "Items smaller than " + SETTINGS.MIN_ITEM_WIDTH_INCHES + " x " + SETTINGS.MIN_ITEM_HEIGHT_INCHES + " in.";
        if (has("Tiny Islands")) return "Tiny pieces inside compound paths (for example the dot of an \"i\").";
        if (has("Stroke-Only")) return "Artwork that is only a stroke outside the production layers. A stroke does not cut.";
        if (has("Tight Gaps")) return "Items closer than " + SETTINGS.MIN_GAP_INCHES + " in to each other (compares bounding boxes, not true shape distance). Slow.";
        if (has("Pure Black")) return "Fills that are C0 M0 Y0 K100. Check that rich black was not intended.";
        if (has("Transparency")) return "Transparency (opacity, blend modes) on the artwork.";
        if (has("Hairline")) return "Strokes thinner than " + SETTINGS.HAIRLINE_MIN_PT + " pt.";
        if (has("Stacked Duplicates")) return "Identical shapes stacked on top of each other.";
        if (has("Items Off Artboard")) return "Items that sit completely outside every artboard. Only checked with All artboards selected.";
        if (has("Empty Layers")) return "Empty layers, empty text frames and paths with a single anchor point.";
        if (has("Artboard Size")) return "Artboards smaller than " + SETTINGS.ARTBOARD_MIN_INCHES + " in or larger than " + SETTINGS.ARTBOARD_MAX_INCHES + " in: check the size is right.";
        return "Shows the details of this check.";
    }
    function setSlot(slot, res) {
        if (!res) { slot.row.visible = false; slot.res = null; return; }
        slot.res = res;
        slot.row.visible = false;   // hide first so the old picture is erased on repaint
        var prefix = "";
        try {
            var img = getIconImage(res.status);
            if (slot.icon.type === "image" && img) slot.icon.image = img;
            else prefix = markerFor(res.status);
        } catch (eSwap) { prefix = markerFor(res.status); }
        var txt = res.label;
        if (res.ignored) txt += "  (ignored)";
        if (res.status !== "off") {
            var pc = problemCount(res.issues);
            if (pc > 0) txt += "  (" + pc + ")";
            else if (res.badge) txt += "  (" + res.badge + ")";
        }
        slot.lbl.text = prefix + txt;
        try {
            var tip = checkHelp(res.label);
            slot.lbl.helpTip = tip;
            if (slot.btn) slot.btn.helpTip = tip;
        } catch (eTip) {}
        slot.row.visible = true;
    }
    var jobOffset = 0;
    function paintJobSlots() {
        for (var i = 0; i < jobSlots.length; i++) setSlot(jobSlots[i], jobResults[jobOffset + i] || null);
    }
    function refreshJobSlots() {
        var maxOff = jobResults.length - jobSlots.length;
        if (maxOff < 0) maxOff = 0;
        if (jobOffset > maxOff) jobOffset = maxOff;
        if (jobOffset < 0) jobOffset = 0;
        try {
            jobScroll.minvalue = 0;
            jobScroll.maxvalue = maxOff;
            jobScroll.value = jobOffset;
            jobScroll.jumpdelta = (jobSlots.length > 1) ? jobSlots.length - 1 : 1;
            jobScroll.enabled = maxOff > 0;
            jobScroll.visible = maxOff > 0;
        } catch (eSc) {}
        paintJobSlots();
    }
    jobScroll.onChanging = function () {
        var v = Math.round(jobScroll.value);
        if (v === jobOffset) return;
        jobOffset = v;
        paintJobSlots();
    };
    jobScroll.onChange = jobScroll.onChanging;
    function fillSlots(slots, results) {
        for (var i = 0; i < slots.length; i++) setSlot(slots[i], results[i] || null);
    }
    // Problems first: errors, then warnings, then OK, then not run (original order kept inside each group).
    function worstFirst(arr) {
        var rank = { bad: 0, warn: 1, ok: 2, off: 3 }, tmp = [];
        for (var i = 0; i < arr.length; i++) tmp.push({ r: arr[i], k: (rank[arr[i].status] === undefined ? 3 : rank[arr[i].status]), i: i });
        tmp.sort(function (a, b) { return a.k !== b.k ? a.k - b.k : a.i - b.i; });
        var out = [];
        for (var j = 0; j < tmp.length; j++) out.push(tmp[j].r);
        return out;
    }
    function relayout() { /* rows are updated in place, no relayout needed */ }

    function pickInitialDetails() {
        var all = stdResults.concat(jobResults);
        var pick = null;
        for (var i = 0; i < all.length; i++) {
            if (all[i].status === "bad") { pick = all[i]; break; }
        }
        if (!pick) {
            for (var j = 0; j < all.length; j++) {
                if (all[j].status === "warn") { pick = all[j]; break; }
            }
        }
        if (pick) showDetails(pick);
        else { list.removeAll(); detailIssues = []; curRes = null; detailTitle.text = "All clear. Nothing to fix."; setView("clear", "All clear", "Nothing to fix in this file."); updateButtons(); }
    }

    // ---- Scanning notice ----
    var scanWin = null;
    function scanStart() {
        var n = lastMeta.nObjs || 0;
        try {
            scanWin = new Window("palette", "Preflight Check");
            paintWin(scanWin);
            scanWin.orientation = "column";
            scanWin.alignChildren = ["fill", "top"];
            scanWin.margins = 20;
            scanWin.spacing = 8;
            var t1 = scanWin.add("statictext", undefined, "Scanning...");
            try { t1.graphics.font = ScriptUI.newFont("dialog", "BOLD", uik().TITLE_SIZE); } catch (eF) {}
            var msg = "This can take a while on files with a lot of art or a large size.";
            if (n > 0) msg += "\nThis file has about " + n + " objects.";
            var t2 = scanWin.add("statictext", undefined, msg, { multiline: true });
            t2.preferredSize = [360, 44];
            paintStyle(scanWin);
            scanWin.center();
            scanWin.show();
            scanWin.update();
        } catch (eW) { scanWin = null; }
    }
    function scanEnd() {
        try { if (scanWin) scanWin.close(); } catch (e) {}
        scanWin = null;
    }

    // ---- Summary line ----
    function setSummary(status, text) {
        var prefix = "";
        try {
            var img = getIconImage(status);
            if (sumIcon.type === "image" && img) sumIcon.image = img;
            else prefix = markerFor(status);
        } catch (e) { prefix = markerFor(status); }
        sumBanner.msg = text;
        sumBanner.status = status;
        try { sumBanner.notify("onDraw"); } catch (eBd) {}
    }
    function summaryInfo() {
        var all = stdResults.concat(jobResults), nb = 0, nw = 0, no = 0, nf = 0;
        for (var i = 0; i < all.length; i++) {
            if (all[i].status === "bad") nb++;
            else if (all[i].status === "warn") nw++;
            else if (all[i].status === "ok") no++;
            else nf++;
        }
        var st = nb > 0 ? "bad" : (nw > 0 ? "warn" : (no > 0 ? "ok" : "off"));
        var tx;
        if (nb > 0) tx = "Not ready: " + nb + (nb === 1 ? " error" : " errors") + (nw > 0 ? ", " + nw + (nw === 1 ? " warning" : " warnings") : "");
        else if (nw > 0) tx = "Almost ready: " + nw + (nw === 1 ? " warning" : " warnings") + " to check";
        else if (no > 0) tx = (CURRENT_MODE === "design") ? "All checks passed" : "Ready for production";
        else tx = "Nothing checked yet";
        if (scopeIdx < 0 && lastMeta.selCount > 0) tx += "   (checking the selection: " + lastMeta.selCount + " item" + (lastMeta.selCount === 1 ? "" : "s") + ")";
        return { status: st, text: tx };
    }
    function updateSummary() {
        var si = summaryInfo();
        setSummary(si.status, si.text);
    }

    // ---- Artboard selector ----
    var artFilling = false;
    function fillArtboards() {
        try {
            var names = ["All artboards"];
            for (var i = 0; i < lastMeta.artNames.length; i++) names.push((i + 1) + " - " + lastMeta.artNames[i]);
            var same = ddArt.items.length === names.length;
            if (same) for (var j = 0; j < names.length; j++) if (ddArt.items[j].text !== names[j]) { same = false; break; }
            if (same) return;
            var keep = scopeIdx;
            artFilling = true;
            ddArt.removeAll();
            for (var k = 0; k < names.length; k++) ddArt.add("item", names[k]);
            if (keep >= 0 && keep + 1 < names.length) ddArt.selection = keep + 1;
            else { ddArt.selection = 0; scopeIdx = -1; scopeRect = null; }
            artFilling = false;
        } catch (e) { artFilling = false; }
    }

    function noDocument() {
        stdResults = []; jobResults = [];
        fillSlots(stdSlots, stdResults);
        refreshJobSlots();
        list.removeAll();
        detailIssues = [];
        curRes = null;
        setSummary("off", "No open document");
        try { setView("list"); } catch (eNd) {}
        detailTitle.text = "No open document found. Open a file and press Rescan.";
        updateButtons();
    }
    function showByLabel(label) {
        var all = stdResults.concat(jobResults);
        for (var i = 0; i < all.length; i++) if (all[i].label === label) { showDetails(all[i]); return true; }
        return false;
    }
    var jobIdxKeep = -1;
    var scanning = false;
    var jobRestoring = false;
    // The dropdown can lose its selection / text after the scan window closes: put it back.
    function restoreJobDropdown() {
        if (jobIdxKeep < 0) return;
        jobRestoring = true;
        try {
            if (!ddJob.selection || ddJob.selection.index !== jobIdxKeep) ddJob.selection = jobIdxKeep;
            else { ddJob.selection = null; ddJob.selection = jobIdxKeep; }
        } catch (eRj) {}
        jobRestoring = false;
        try { ddJob.parent.layout.layout(true); } catch (eL) {}
    }
    function runMainScan(keepLabel, jobOnly) {
        if (scanning) return;
        if (SELF_PATH === "") { spAlert("Preflight cannot find its own script file, so it cannot scan. Please run it from File > Scripts."); return; }
        if (!ddJob.selection) { try { ddJob.selection = (jobIdxKeep >= 0 ? jobIdxKeep : 0); } catch (eJ) {} }
        if (ddJob.selection) jobIdxKeep = ddJob.selection.index; else jobIdxKeep = (jobIdxKeep >= 0 ? jobIdxKeep : 0);
        curType = typeAt(jobIdxKeep);
        gapEnabled = chkGap.value;
        var clientLabel = "";
        try { clientIdxKeep = ddClient.selection.index; clientLabel = CLIENTS[clientIdxKeep].label; } catch (eC) { if (clientIdxKeep >= 0) clientLabel = CLIENTS[clientIdxKeep].label; }
        var job = { typeIdx: jobIdxKeep, gap: gapEnabled, scopeIdx: scopeIdx, client: clientLabel, jobOnly: jobOnly ? true : false };
        scanning = true;
        scanStart();
        var bt = new BridgeTalk();
        bt.target = "illustrator";
        bt.body = spSendCode("$.global.__PF_JOB = " + job.toSource() + ";$.global.__PF_JOB.self = " + bt_lit(SELF_PATH) + ";$.global.__PF_RESULT = '';" +
            "var __f = new File(" + bt_lit(SELF_PATH) + ");__f.encoding = 'UTF-8';__f.open('r');var __s = __f.read();__f.close();" +
            "__s = __s.replace(/^#.*$/mg, '');eval(__s);$.global.__PF_RESULT;");
        bt.onResult = function (r) {
            scanning = false;
            scanEnd();
            restoreJobDropdown();
            try {
                var o = eval("(" + String(r.body) + ")");
                applyScanResult(o, keepLabel, jobOnly);
            } catch (eR) {
                spAlert("Something went wrong while reading the scan result.\n\nDetails: " + eR + (eR.line ? "  (line " + eR.line + ")" : "") + "\n\nReceived: " + String(r.body).substr(0, 160));
            }
        };
        bt.onError = function (er) {
            scanning = false;
            scanEnd();
            spAlert("The scan could not run:\n" + (er && er.body ? er.body : er));
        };
        bt.send();
    }
    var restoring = false;
    var clientIdxKeep = -1;
    // Something in the redraw (scan popup / relayout) can blank the dropdowns: put the choices back.
    function restoreSelections() {
        restoring = true;
        try { if (!ddJob.selection && jobIdxKeep >= 0) ddJob.selection = jobIdxKeep; } catch (e1) {}
        try { if (!ddClient.selection && clientIdxKeep >= 0) ddClient.selection = clientIdxKeep; } catch (e2) {}
        try { if (!ddArt.selection && ddArt.items.length > 0) ddArt.selection = (scopeIdx >= 0 && scopeIdx + 1 < ddArt.items.length) ? scopeIdx + 1 : 0; } catch (e3) {}
        restoring = false;
    }
    function applyScanResult(o, keepLabel, jobOnly) {
        restoreJobDropdown();
        if (!o || o.nodoc) { noDocument(); return; }
        if (o.error) {
            noDocument();
            detailTitle.text = "The scan failed: " + o.error;
            return;
        }
        lastMeta = o;
        scopeIdx = o.scopeIdx;
        scopeRect = o.scopeRect;
        unusedSwatchNames = o.unused || [];
        fillArtboards();
        if (o.std) stdResults = worstFirst(o.std);
        jobResults = worstFirst(o.job);
        fillSlots(stdSlots, stdResults);
        refreshJobSlots();
        refreshSections();
        relayout();
        updateSummary();
        if (!(keepLabel && showByLabel(keepLabel))) pickInitialDetails();
        restoreSelections();
    }
    function fullScan(keepLabel) { runMainScan(keepLabel, false); }
    function jobScan() { runMainScan(null, true); }
    function safely(fn, what) {
        return function () {
            try { fn(); }
            catch (e) { spAlert("Something went wrong while " + what + ".\n\nDetails: " + e + (e.line ? "  (line " + e.line + ")" : "") + "\n\nTry Rescan. If it happens again, send this message to Joao."); }
        };
    }
    ddJob.onChange = safely(function () {
        if (restoring) return;
        if (jobRestoring) return;
        if (ddJob.selection) jobIdxKeep = ddJob.selection.index;
        jobOffset = 0;
        try { app.preferences.setStringPreference("signpack/preflight/signtype", SIGN_TYPES[jobIdxKeep < 0 ? 0 : jobIdxKeep].label); } catch (eP) {}
        fullScan();   // the Text check depends on the sign type, so re-run everything
    }, "switching sign type");
    chkGap.onClick = safely(jobScan, "running the gap check");
    ddClient.onChange = safely(function () {
        if (restoring || !ddClient.selection) return;
        try { app.preferences.setStringPreference("signpack/preflight/client", CLIENTS[ddClient.selection.index].label); } catch (eP2) {}
        applyClientSettings(CLIENTS[ddClient.selection.index]);
        setModeUI();
        jobOffset = 0;
        fullScan();
    }, "switching client");
    ddArt.onChange = safely(function () {
        if (artFilling || restoring) return;
        scopeIdx = ddArt.selection ? ddArt.selection.index - 1 : -1;
        fullScan();
    }, "switching artboard");

    var btnGroup = win.add("group");
    btnGroup.orientation = "row";
    btnGroup.alignment = ["fill", "top"];
    btnGroup.alignChildren = ["left", "center"];
    btnGroup.spacing = 8;

    function mkBtn(text, w) {
        var b = btnGroup.add("button", undefined, text);
        b.preferredSize = [w, 30];
        return b;
    }
    var btnFocus = mkBtn("Select item", 92);
    var btnFix = mkBtn("Fix", 70);
    var btnIgnore = mkBtn("Ignore", 70);
    var btnRescan = mkBtn("Rescan", 75);
    var btnSave = mkBtn("Save Report", 100);
    var btnProd = mkBtn("Open Helper", 100);
    var btnSpacer = btnGroup.add("group");
    btnSpacer.alignment = ["fill", "center"];
    var btnClose = mkBtn("Close", 70);
    addSignTypesTag(win, SIGN_TYPES_VERSION);
    btnProd.helpTip = "Opens Production Helper (checklist and Make buttons) for the selected sign type.";
    btnProd.onClick = safely(function () {
        var f = findSibling(SELF_PATH, /^Production[ _]Helper(?:[ _]*v?(\d+(?:\.\d+)*))?\.jsx$/i);
        if (!f) {
            spAlert("Production Helper was not found in the same folder as Preflight Check.\nPut both scripts in the same folder and try again.");
            return;
        }
        try { app.preferences.setStringPreference("signpack/prodhelper/signtype", SIGN_TYPES[ddJob.selection.index].label); } catch (ePr) {}
        try { if (ddClient.selection) app.preferences.setStringPreference("signpack/prodhelper/client", CLIENTS[ddClient.selection.index].label); } catch (ePc) {}
        launchScript(f, "signpack_prodhelper");
    }, "opening Production Helper");
    try { setModeUI(); } catch (eSm) {}
    btnFix.helpTip = "Fixes the selected row (only for rows that have a safe fix). Asks before changing anything.\nOn Named Colors it becomes Add Label: puts the selected color and its name in the file.";
    btnFocus.helpTip = "Selects the picked item in Illustrator and centers the view on it. Double-clicking the item in the list does the same.";
    btnRescan.helpTip = "Checks the open file again. Press it after you fix something.";
    btnSave.helpTip = "Saves the results as a PDF or a text file next to the open file (or on the Desktop if it was never saved).";
    btnClose.helpTip = "Closes Preflight Check.";
    ddJob.helpTip = "The sign type decides which checks apply and what the file needs (bleed, CutContour, layers...).";
    ddClient.helpTip = "A client profile can change the limits or the rules for some sign types. Use The Sign Pack unless the job has its own client rules.";
    ddArt.helpTip = "Check all artboards, or only one.";
    list.helpTip = "The problems found for the row you opened with View. Click one, then use Select item to see it in the file.";
    btnIgnore.helpTip = "Ignore the selected row for this file. Press again to check it again.";
    btnRescan.onClick = function () { try { fullScan(); } catch (e) { spAlert("Something went wrong while rescanning.\n\nDetails: " + e + (e.line ? "  (line " + e.line + ")" : "") + "\n\nMake sure a document is open and try again. If it happens again, send this message to Joao."); } };
    btnClose.onClick = function () { win.close(); };

    function updateButtons() {
        var r = curRes;
        btnFocus.enabled = (list.selection !== null && list.selection !== undefined);
        btnIgnore.enabled = !!r;
        btnIgnore.text = (r && r.ignored) ? "Unignore" : "Ignore";
        if (r && r.labelTool) {
            // Named Colors: the Fix button becomes "Add Label" for the selected color
            btnFix.text = "Add Label";
            if (btnFix.useAlt) btnFix.useAlt(true);
            var selRow = list.selection;
            btnFix.enabled = !!(selRow && detailIssues[selRow.index] && detailIssues[selRow.index].spec && !r.ignored);
            return;
        }
        btnFix.text = "Fix";
        if (btnFix.useAlt) btnFix.useAlt(false);
        btnFix.enabled = !!(r && r.fix && !r.ignored && (r.status === "bad" || r.status === "warn"));
    }
    list.onChange = function () { try { updateButtons(); } catch (eUb) {} };

    // ---- Simple dark dialogs ----
    function messageDialog(message, title) { spAlert(message, title || "Preflight Check"); }
    function confirmDialog(message, yesText) { return spConfirm(message, "Preflight Check", yesText); }

    // Runs in Illustrator's MAIN engine via BridgeTalk.
    function focusGeneric(collection, idx) {
        try {
            var d = app.activeDocument;
            if (collection === "artboard") {
                d.artboards.setActiveArtboardIndex(idx);
                app.redraw();
                return;
            }
            if (collection === "layer") {
                d.activeLayer = d.layers[idx];
                app.redraw();
                return;
            }
            var targetItem = null;
            if (collection === "placedItems") targetItem = d.placedItems[idx];
            else if (collection === "rasterItems") targetItem = d.rasterItems[idx];
            else if (collection === "textFrames") targetItem = d.textFrames[idx];
            else if (collection === "pageItems") {
                if (typeof idx === "string") {
                    var mm = idx.match(/^L(\d+):(\d+)$/);
                    targetItem = d.layers[parseInt(mm[1], 10)].pageItems[parseInt(mm[2], 10)];
                } else targetItem = d.pageItems[idx];
            }
            else if (collection === "pathItems") targetItem = d.pathItems[idx];
            else if (collection === "groupItems") targetItem = d.groupItems[idx];
            else if (collection === "compoundPathItems") targetItem = d.compoundPathItems[idx];
            if (!targetItem) { spAlert("Could not find that item. It may have moved, try Rescan."); return; }

            d.selection = null;
            var restoreList = [];
            restoreList.push({ obj: targetItem, locked: targetItem.locked, hidden: targetItem.hidden });
            targetItem.hidden = false;
            targetItem.locked = false;
            var parent = targetItem.parent;
            while (parent && parent.typename !== "Document") {
                var entry = { obj: parent, locked: null, hidden: null };
                if (parent.hasOwnProperty("locked")) { entry.locked = parent.locked; parent.locked = false; }
                if (parent.hasOwnProperty("hidden")) { entry.hidden = parent.hidden; parent.hidden = false; }
                restoreList.push(entry);
                parent = parent.parent;
            }
            targetItem.selected = true;
            var view = d.activeView;
            view.centerPoint = [targetItem.position[0] + targetItem.width / 2, targetItem.position[1] - targetItem.height / 2];
            app.redraw();
            for (var ri = 0; ri < restoreList.length; ri++) {
                var e2 = restoreList[ri];
                try { if (e2.locked !== null) e2.obj.locked = e2.locked; } catch (eR1) {}
                try { if (e2.hidden !== null) e2.obj.hidden = e2.hidden; } catch (eR2) {}
            }
        } catch (e) {
            spAlert("Could not select the item. If the document changed since the scan, run Rescan.\n" + e);
        }
    }

    // Runs in Illustrator's MAIN engine via BridgeTalk (self-contained, no outside variables).
    // Puts a color square + its name at the center of the view; each click stacks one below the last.
    function addColorLabelGeneric(spec, textStr, docName) {
        try {
            var doc = app.activeDocument;
            if (docName && doc.name !== docName) {
                spAlert("Nothing was added: the active document is " + doc.name + ", not " + docName + ".");
                return;
            }
            var col = null;
            var parts = spec.split("|");
            if (parts[0] === "spot") {
                var sc = new SpotColor();
                sc.spot = doc.spots.getByName(parts[1]);
                col = sc;
            } else if (parts[0] === "cmyk") {
                col = new CMYKColor();
                col.cyan = parseFloat(parts[1]); col.magenta = parseFloat(parts[2]);
                col.yellow = parseFloat(parts[3]); col.black = parseFloat(parts[4]);
            } else if (parts[0] === "rgb") {
                col = new RGBColor();
                col.red = parseFloat(parts[1]); col.green = parseFloat(parts[2]);
                col.blue = parseFloat(parts[3]);
            } else if (parts[0] === "gray") {
                col = new GrayColor();
                col.gray = parseFloat(parts[1]);
            } else {
                col = new GrayColor();
                col.gray = 100;
            }

            var view = doc.activeView;
            var size = 100;
            var gap = 30;
            var spacing = 20;

            if (!$.global.__ccLegend) $.global.__ccLegend = { y: 0, cx: null, cy: null };
            var st = $.global.__ccLegend;
            var c = view.centerPoint;
            if (st.cx === null || Math.abs(c[0] - st.cx) > 5 || Math.abs(c[1] - st.cy) > 5) st.y = 0;
            st.cx = c[0]; st.cy = c[1];

            var top = c[1] + (size / 2) - st.y;
            var left = c[0] - 150;

            var rect = doc.pathItems.rectangle(top, left, size, size);
            rect.filled = true;
            rect.fillColor = col;

            var outline;
            if (doc.documentColorSpace === DocumentColorSpace.RGB) {
                outline = new RGBColor();
                outline.red = 0; outline.green = 0; outline.blue = 0;
            } else {
                outline = new CMYKColor();
                outline.cyan = 0; outline.magenta = 0; outline.yellow = 0; outline.black = 100;
            }
            rect.stroked = true;
            rect.strokeColor = outline;
            rect.strokeWidth = 4;

            var txt = doc.textFrames.add();
            txt.contents = textStr;
            try { txt.textRange.characterAttributes.textFont = app.textFonts.getByName("Gotham-Medium"); } catch (e) {}
            try { txt.textRange.characterAttributes.size = 75; } catch (eSz) {}

            var textLeft = left + size + gap;
            var opticalNudge = 6;
            var textTop = (top - (size / 2)) + (txt.height / 2) - opticalNudge;
            txt.position = [textLeft, textTop];

            var group = doc.groupItems.add();
            rect.move(group, ElementPlacement.PLACEATEND);
            txt.move(group, ElementPlacement.PLACEATEND);

            st.y += (size + spacing);
            app.redraw();
        } catch (e) {
            spAlert("Could not create the label.\n" + e);
        }
    }

    // Runs in Illustrator's MAIN engine via BridgeTalk (self-contained, no outside variables).
    function fixGeneric(kind, arg, docName, scopeStr) {
        try {
            var d = app.activeDocument;
            if (docName && d.name !== docName) return "Nothing was changed: the active document is " + d.name + ", not " + docName + ".";
            var sfx = 1;
            try { if (d.scaleFactor) sfx = d.scaleFactor; } catch (e0) {}
            var rect = null;
            if (scopeStr) {
                var q = scopeStr.split(",");
                rect = [parseFloat(q[0]), parseFloat(q[1]), parseFloat(q[2]), parseFloat(q[3])];
            }
            function norm(n) { return ("" + n).toLowerCase().replace(/[\s_\-]/g, ""); }
            function inRect(it) {
                if (!rect) return true;
                try {
                    var b = it.geometricBounds;
                    return !(b[2] < rect[0] || b[0] > rect[2] || b[1] < rect[3] || b[3] > rect[1]);
                } catch (e) { return true; }
            }
            function onLayer(it, test) {
                var p = it, g = 0;
                while (p && g++ < 60) {
                    try {
                        if (p.typename === "Layer" && test(p.name)) return true;
                        if (p.typename === "Document") break;
                        p = p.parent;
                    } catch (e) { break; }
                }
                return false;
            }
            function black() {
                var c = new CMYKColor();
                c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = 100;
                return c;
            }
            var changed = 0, failed = 0;
            if (kind === "swatches") {
                var names = arg.split("|~|");
                for (var n = 0; n < names.length; n++) {
                    if (names[n] === "") continue;
                    try { d.swatches.getByName(names[n]).remove(); changed++; } catch (eS) { failed++; }
                }
                return "Removed " + changed + " unused swatch" + (changed === 1 ? "" : "es") + "." + (failed ? " " + failed + " could not be removed." : "");
            }
            if (kind === "layers" || kind === "layerart" || kind === "extralayers") {
                // arg: entries "name^r,g,b^strokePt^element" joined by "|~|"
                var ents = arg.split("|~|"), specs = [];
                for (var e1 = 0; e1 < ents.length; e1++) {
                    if (ents[e1] === "") continue;
                    var f4 = ents[e1].split("^"), rg = f4[1].split(",");
                    specs.push({ name: f4[0], rgb: [parseInt(rg[0], 10), parseInt(rg[1], 10), parseInt(rg[2], 10)], stroke: f4[2] === "" ? 0 : parseFloat(f4[2]), element: f4[3] });
                }
                var lv = function (a, b) {
                    var m = a.length, n = b.length, dd = [], i, j;
                    for (i = 0; i <= m; i++) dd[i] = [i];
                    for (j = 1; j <= n; j++) dd[0][j] = j;
                    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
                        dd[i][j] = Math.min(dd[i - 1][j] + 1, Math.min(dd[i][j - 1] + 1, dd[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)));
                    return dd[m][n];
                };
                var all = [];
                (function walk(ls) { for (var w = 0; w < ls.length; w++) { all.push(ls[w]); try { if (ls[w].layers.length) walk(ls[w].layers); } catch (eW) {} } })(d.layers);
                var findLayer = function (sp) {
                    var want = norm(sp.name), q, best = null, bd = 99;
                    for (q = 0; q < all.length; q++) if (all[q].name === sp.name) return all[q];
                    for (q = 0; q < all.length; q++) if (norm(all[q].name) === want) return all[q];
                    for (q = 0; q < all.length; q++) {
                        var n2 = norm(all[q].name);
                        if (n2 === "") continue;
                        var dist = lv(n2, want);
                        var close = (dist <= 2 && dist < want.length - 1) || (n2.length >= 4 && want.indexOf(n2) === 0) || (want.length >= 4 && n2.indexOf(want) === 0);
                        if (close && dist < bd) { bd = dist; best = all[q]; }
                    }
                    return best;
                };
                var made = 0, renamed = 0, recol = 0, artFixed = 0, bad = 0;
                if (kind === "extralayers") {
                    var keepN = {};
                    for (var k1 = 0; k1 < specs.length; k1++) {
                        var fl = findLayer(specs[k1]);
                        if (!fl) continue;
                        var tl = fl, gg = 0;
                        while (tl && gg++ < 60) { try { if (tl.parent && tl.parent.typename === "Document") break; tl = tl.parent; } catch (eT) { break; } }
                        try { keepN[tl.name] = true; } catch (eK) {}
                    }
                    var anyKept = false;
                    for (var kk in keepN) anyKept = true;
                    if (!anyKept && specs.length > 0) {
                        var nl0 = d.layers.add();
                        nl0.name = specs[0].name;
                        keepN[specs[0].name] = true;
                    }
                    var gone = 0, items = 0;
                    for (var li2 = d.layers.length - 1; li2 >= 0; li2--) {
                        try {
                            var ly3 = d.layers[li2], nm3 = ly3.name;
                            if (keepN[nm3] || norm(nm3).indexOf("design") >= 0) continue;
                            try { items += ly3.pageItems.length; } catch (eC) {}
                            ly3.locked = false;
                            ly3.visible = true;
                            ly3.remove();
                            gone++;
                        } catch (eX) { bad++; }
                    }
                    try { app.redraw(); } catch (eR2) {}
                    return "Deleted " + gone + " extra layer" + (gone === 1 ? "" : "s") + " (" + items + " item" + (items === 1 ? "" : "s") + " on them)." +
                           (bad ? " " + bad + " could not be deleted." : "") + "\nPress Ctrl+Z in Illustrator to undo.";
                }
                if (kind === "layers") {
                    for (var s1 = 0; s1 < specs.length; s1++) {
                        var sp = specs[s1];
                        try {
                            var ly = findLayer(sp);
                            if (!ly) { ly = d.layers.add(); ly.name = sp.name; made++; }
                            else if (ly.name !== sp.name) { ly.name = sp.name; renamed++; }
                            var cc2 = ly.color, differs = Math.abs(cc2.red - sp.rgb[0]) > 3 || Math.abs(cc2.green - sp.rgb[1]) > 3 || Math.abs(cc2.blue - sp.rgb[2]) > 3;
                            if (differs) {
                                var nc = new RGBColor();
                                nc.red = sp.rgb[0]; nc.green = sp.rgb[1]; nc.blue = sp.rgb[2];
                                ly.color = nc;
                                recol++;
                            }
                        } catch (eL) { bad++; }
                    }
                    try { app.redraw(); } catch (eR0) {}
                    return "Layers fixed: " + made + " created, " + renamed + " renamed, " + recol + " colour" + (recol === 1 ? "" : "s") + " set." +
                           (bad ? " " + bad + " could not be changed." : "") + "\nPress Ctrl+Z in Illustrator to undo.";
                }
                // layerart: stroke of the paths on the layers that have a rule
                var spotC = null;
                for (var s2 = 0; s2 < specs.length; s2++) {
                    var sp2 = specs[s2];
                    if (!sp2.stroke && sp2.element === "") continue;
                    var ly2 = findLayer(sp2);
                    if (!ly2) continue;
                    var col2 = null;
                    if (sp2.element === "black") col2 = black();
                    else if (sp2.element === "magenta") {
                        if (!spotC) {
                            for (var si2 = 0; si2 < d.spots.length; si2++) if (norm(d.spots[si2].name) === "cutcontour") { spotC = d.spots[si2]; break; }
                            if (!spotC) {
                                spotC = d.spots.add();
                                spotC.name = "CutContour";
                                spotC.colorType = ColorModel.SPOT;
                                var mc = new CMYKColor();
                                mc.cyan = 0; mc.magenta = 100; mc.yellow = 0; mc.black = 0;
                                spotC.color = mc;
                            }
                        }
                        col2 = new SpotColor();
                        col2.spot = spotC;
                        col2.tint = 100;
                    }
                    var tgt = norm(ly2.name);
                    var pp = d.pathItems;
                    for (var pi2 = 0; pi2 < pp.length; pi2++) {
                        try {
                            var p2 = pp[pi2];
                            if (p2.guides || p2.clipping || !inRect(p2)) continue;
                            if (!onLayer(p2, function (nm) { return norm(nm) === tgt; })) continue;
                            p2.stroked = true;
                            if (col2) p2.strokeColor = col2;
                            if (sp2.stroke) p2.strokeWidth = sp2.stroke / sfx;
                            artFixed++;
                        } catch (eA) { bad++; }
                    }
                }
                try { app.redraw(); } catch (eR1) {}
                return "Fixed the stroke of " + artFixed + " path" + (artFixed === 1 ? "" : "s") + "." + (bad ? " " + bad + " could not be changed (locked layer or item?)." : "") + "\nPress Ctrl+Z in Illustrator to undo.";
            }
            var test = null, strokeCol = null, what = "";
            if (kind === "cut") {
                test = function (nm) { return norm(nm).indexOf("cutcontour") >= 0; };
                var spot = null;
                for (var si = 0; si < d.spots.length; si++) {
                    if (norm(d.spots[si].name) === "cutcontour") { spot = d.spots[si]; break; }
                }
                if (!spot) {
                    spot = d.spots.add();
                    spot.name = "CutContour";
                    spot.colorType = ColorModel.SPOT;
                    var cc = new CMYKColor();
                    cc.cyan = 0; cc.magenta = 100; cc.yellow = 0; cc.black = 0;
                    spot.color = cc;
                }
                strokeCol = new SpotColor();
                strokeCol.spot = spot;
                strokeCol.tint = 100;
                what = "CutContour layer";
            } else if (kind === "outline") {
                test = function (nm) { var x = norm(nm); return x.indexOf("outline") === 0 || x.indexOf("hole") >= 0; };
                strokeCol = black();
                what = "Outline / Holes layers";
            } else if (kind === "bbox") {
                test = function (nm) { var x = norm(nm); return x.indexOf("boundingbox") >= 0 || x.indexOf("bbox") >= 0; };
                if (arg === "k") strokeCol = black();
                what = "BoundingBox layer";
            } else {
                return "Unknown fix.";
            }
            var paths = d.pathItems;
            for (var i = 0; i < paths.length; i++) {
                try {
                    var p = paths[i];
                    if (p.guides || p.clipping) continue;
                    if (!inRect(p)) continue;
                    if (!onLayer(p, test)) continue;
                    p.filled = false;
                    if (strokeCol) {
                        p.stroked = true;
                        p.strokeColor = strokeCol;
                        p.strokeWidth = 1 / sfx;
                    } else {
                        p.stroked = false;
                    }
                    changed++;
                } catch (eP) { failed++; }
            }
            try { app.redraw(); } catch (eR) {}
            return "Fixed " + changed + " path" + (changed === 1 ? "" : "s") + " on the " + what + "." +
                   (failed ? " " + failed + " could not be changed (locked layer or item?)." : "") +
                   "\nPress Ctrl+Z in Illustrator to undo.";
        } catch (e) {
            return "The fix could not run: " + e;
        }
    }
    function bt_lit(str) {
        return '"' + String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"';
    }
    function runFix(kind, arg, afterLabel) {
        var dn = "";
        dn = lastMeta.docName;
        var sc = "";
        if (scopeRect) sc = scopeRect[0] + "," + scopeRect[1] + "," + scopeRect[2] + "," + scopeRect[3];
        var bt = new BridgeTalk();
        bt.target = "illustrator";
        bt.body = spSendCode("(" + String(fixGeneric) + ")(" + bt_lit(kind) + "," + bt_lit(arg) + "," + bt_lit(dn) + "," + bt_lit(sc) + ");");
        bt.onResult = function (r) {
            try { messageDialog(String(r.body), "Fix result"); } catch (e1) {}
            try { fullScan(afterLabel); } catch (e2) { try { messageDialog("Rescan after fix failed: " + e2, "Preflight"); } catch (e4) {} }
        };
        bt.onError = function (er) {
            try { messageDialog("The fix failed: " + er.body, "Fix result"); } catch (e3) {}
        };
        bt.send(60);
    }
    function askBBoxMode(defaultMode) {
        var result = null;
        var dlg = new Window("dialog", "Fix BoundingBox");
        paintWin(dlg);
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.margins = 20;
        dlg.spacing = 12;
        dlg.add("statictext", undefined, "Both options remove any fill. Choose what the stroke should be:");
        var r1 = dlg.add("radiobutton", undefined, "No stroke (no fill, no stroke)");
        var r2 = dlg.add("radiobutton", undefined, "Stroke 100% K (C0 M0 Y0 K100), 1 pt");
        if (defaultMode === "k") r2.value = true; else r1.value = true;
        var bg = dlg.add("group");
        bg.alignment = ["center", "top"];
        bg.spacing = 12;
        var ok = bg.add("button", undefined, "Fix", { name: "ok" });
        var cn = bg.add("button", undefined, "Close", { name: "cancel" });
        ok.onClick = function () { result = r2.value ? "k" : "none"; dlg.close(); };
        cn.onClick = function () { result = null; dlg.close(); };
        paintStyle(dlg);
        dlg.center();
        dlg.show();
        return result;
    }
    function addLabelClicked() {
        var selRow = list.selection;
        var iss = selRow ? detailIssues[selRow.index] : null;
        if (!iss || !iss.spec) { messageDialog("Select a color in the list first."); return; }
        var bt = new BridgeTalk();
        bt.target = "illustrator";
        bt.body = spSendCode(POPUP_DEFS + "(" + String(addColorLabelGeneric) + ")(" + bt_lit(iss.spec) + "," + bt_lit(iss.name) + "," + bt_lit(lastMeta.docName) + ");");
        bt.send();
    }
    btnFix.onClick = safely(function () {
        if (curRes && curRes.labelTool) { addLabelClicked(); return; }
        if (!curRes || !curRes.fix) return;
        var kind = curRes.fix, label = curRes.label;
        var scopeNote = scopeRect ? "\n\nOnly items on the selected artboard are changed." : "";
        if (kind === "swatches") {
            var selSw = (list.selection !== null && list.selection !== undefined) ? detailIssues[list.selection.index] : null;
            if (selSw && selSw.name && selSw.check === "Unused Swatch") {
                if (!confirmDialog("Delete the swatch \"" + selSw.name + "\" from this file? It is not used by any artwork.\n\nYou can undo with Ctrl+Z.", "Delete swatch")) return;
                runFix("swatches", selSw.name, label);
                return;
            }
            if (unusedSwatchNames.length === 0) { messageDialog("There are no unused swatches to remove."); return; }
            if (!confirmDialog("Delete " + unusedSwatchNames.length + " unused swatch" + (unusedSwatchNames.length === 1 ? "" : "es") +
                " from this file? They are not used by any artwork, so the art does not change.\n\nYou can undo with Ctrl+Z.", "Delete swatches")) return;
            runFix("swatches", unusedSwatchNames.join("|~|"), label);
        } else if (kind === "layers" || kind === "layerart" || kind === "extralayers") {
            var specArg = [];
            for (var sl = 0; sl < curType.layers.length; sl++) {
                var sy = curType.layers[sl], rg = ST.colors[sy.color] || [0, 0, 0];
                specArg.push(sy.name + "^" + rg.join(",") + "^" + (sy.stroke ? sy.stroke : "") + "^" + (sy.element ? sy.element : ""));
            }
            if (kind === "extralayers") {
                if (!confirmDialog("Delete " + curRes.issues.length + " layer" + (curRes.issues.length === 1 ? "" : "s") + " that " + (curRes.issues.length === 1 ? "is" : "are") + " not in the spec for \"" + curType.label + "\", and EVERYTHING on " + (curRes.issues.length === 1 ? "it" : "them") +
                    ".\n\nLayers with \"design\" in the name are kept. Check the list first. You can undo with Ctrl+Z.", "Delete extra layers")) return;
            } else if (kind === "layers") {
                if (!confirmDialog("For the sign type \"" + curType.label + "\": create the missing layers, rename the misnamed ones to the spec name and set the layer colours.\n\n" +
                    "Layers that are not in the spec are not touched. You can undo with Ctrl+Z.", "Fix Layers")) return;
            } else {
                if (!confirmDialog("On the layers that have a stroke rule: set the stroke to the spec (1 pt, 100% black or 100% magenta CutContour spot). Fills are not changed." + scopeNote +
                    "\n\nThis changes how those shapes look. You can undo with Ctrl+Z.", "Fix Layer Art")) return;
            }
            runFix(kind, specArg.join("|~|"), label);
        } else if (kind === "cut") {
            if (!confirmDialog("On the CutContour layer: remove any fill and set the stroke to the CutContour spot color at 100%, 1 pt. " +
                "If the CutContour swatch does not exist, it is created (100% magenta spot).\n\nThis changes how those shapes look. You can undo with Ctrl+Z." + scopeNote, "Fix CutContour")) return;
            runFix("cut", "", label);
        } else if (kind === "outline") {
            if (!confirmDialog("On the Outline and Holes layers: remove any fill and set the stroke to 100% black (C0 M0 Y0 K100), 1 pt.\n\n" +
                "This changes how those shapes look. White Ink layers are not touched. You can undo with Ctrl+Z." + scopeNote, "Fix Outline / Holes")) return;
            runFix("outline", "", label);
        } else if (kind === "bbox") {
            var mode = askBBoxMode(curRes.fixDefault || "none");
            if (mode === null) return;
            if (!confirmDialog("On the BoundingBox layer: remove any fill" + (mode === "k" ? " and set a 100% K stroke, 1 pt." : " and any stroke.") +
                "\n\nYou can undo with Ctrl+Z." + scopeNote, "Fix BoundingBox")) return;
            runFix("bbox", mode, label);
        }
    }, "fixing this row");
    btnIgnore.onClick = safely(function () {
        if (!curRes) return;
        var key = ignoreKey(curRes.label), lbl = curRes.label;
        if (ignoredMap[key]) delete ignoredMap[key]; else ignoredMap[key] = true;
        saveIgnored();
        fullScan(lbl);
    }, "ignoring this row");

    var doFocus = function () {
        if (list.selection !== null) {
            var issue = detailIssues[list.selection.index];
            if (!issue || !issue.collection || issue.idx === null || issue.idx === undefined) {
                spAlert("This item can't be shown in the file. Select it by hand in Illustrator instead.");
                return;
            }
            var bt = new BridgeTalk();
            bt.target = "illustrator";
            bt.body = spSendCode(POPUP_DEFS + "(" + String(focusGeneric) + ')("' + issue.collection + '", ' + (typeof issue.idx === "string" ? '"' + issue.idx + '"' : issue.idx) + ");");
            bt.send();
        }
    };
    btnFocus.onClick = doFocus;
    list.onDoubleClick = doFocus;

    // ---- PDF report writer (plain PDF 1.4, standard Helvetica, ASCII only) ----
    function pdfAscii(t) { return String(t).replace(/[^\x20-\x7e]/g, "?"); }
    function pdfEsc(t) { return pdfAscii(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
    function pdfNum(x) { return String(Math.round(x * 100) / 100); }
    function pdfWrap(text, maxChars) {
        var words = pdfAscii(text).split(" "), lines = [], cur = "";
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            while (w.length > maxChars) {
                if (cur !== "") { lines.push(cur); cur = ""; }
                lines.push(w.substr(0, maxChars));
                w = w.substr(maxChars);
            }
            if (cur === "") cur = w;
            else if ((cur + " " + w).length <= maxChars) cur += " " + w;
            else { lines.push(cur); cur = w; }
        }
        if (cur !== "" || lines.length === 0) lines.push(cur);
        return lines;
    }
    // model: { title, meta:[strings], summary, summaryStatus, sections:[{title, rows:[{status,label,info,ignored,issues:[strings]}]}] }
    function buildPdf(model) {
        var PW = 612, PH = 792, M = 50;
        var pages = [], cur = null, y = 0;
        var COL = {
            ok: "0.18 0.68 0.33", warn: "0.96 0.74 0.10", bad: "0.88 0.20 0.20", off: "0.62 0.62 0.62",
            dark: "0.12 0.12 0.12", grey: "0.40 0.40 0.40", white: "1 1 1", line: "0.80 0.80 0.80"
        };
        function newPage() { cur = []; pages.push(cur); y = PH - M; }
        function txt(x, yy, size, bold, str, col) {
            cur.push("BT /" + (bold ? "F2" : "F1") + " " + size + " Tf " + COL[col || "dark"] + " rg " + pdfNum(x) + " " + pdfNum(yy) + " Td (" + pdfEsc(str) + ") Tj ET");
        }
        function circle(cx, cy, r, col) {
            var k = 0.5523 * r;
            cur.push(COL[col] + " rg " + pdfNum(cx + r) + " " + pdfNum(cy) + " m " +
                pdfNum(cx + r) + " " + pdfNum(cy + k) + " " + pdfNum(cx + k) + " " + pdfNum(cy + r) + " " + pdfNum(cx) + " " + pdfNum(cy + r) + " c " +
                pdfNum(cx - k) + " " + pdfNum(cy + r) + " " + pdfNum(cx - r) + " " + pdfNum(cy + k) + " " + pdfNum(cx - r) + " " + pdfNum(cy) + " c " +
                pdfNum(cx - r) + " " + pdfNum(cy - k) + " " + pdfNum(cx - k) + " " + pdfNum(cy - r) + " " + pdfNum(cx) + " " + pdfNum(cy - r) + " c " +
                pdfNum(cx + k) + " " + pdfNum(cy - r) + " " + pdfNum(cx + r) + " " + pdfNum(cy - k) + " " + pdfNum(cx + r) + " " + pdfNum(cy) + " c f");
        }
        function strokeLines(pts, width) {
            var s = COL.white + " RG " + pdfNum(width) + " w 1 J 1 j " + pdfNum(pts[0][0]) + " " + pdfNum(pts[0][1]) + " m";
            for (var i = 1; i < pts.length; i++) s += " " + pdfNum(pts[i][0]) + " " + pdfNum(pts[i][1]) + " l";
            cur.push(s + " S");
        }
        function icon(cx, cy, r, status) {
            var u = r / 6;
            if (status === "warn") {
                cur.push(COL.warn + " rg " + pdfNum(cx) + " " + pdfNum(cy + r) + " m " + pdfNum(cx + r * 1.1) + " " + pdfNum(cy - r * 0.8) + " l " +
                    pdfNum(cx - r * 1.1) + " " + pdfNum(cy - r * 0.8) + " l f");
                cur.push(COL.dark + " rg " + pdfNum(cx - 0.6 * u) + " " + pdfNum(cy - 1.2 * u) + " " + pdfNum(1.2 * u) + " " + pdfNum(3.6 * u) + " re f");
                cur.push(COL.dark + " rg " + pdfNum(cx - 0.6 * u) + " " + pdfNum(cy - 3.4 * u) + " " + pdfNum(1.2 * u) + " " + pdfNum(1.2 * u) + " re f");
                return;
            }
            circle(cx, cy, r, status);
            if (status === "ok") strokeLines([[cx - 3 * u, cy], [cx - 1 * u, cy - 2.6 * u], [cx + 3.2 * u, cy + 2.8 * u]], 1.5 * u);
            else if (status === "bad") { strokeLines([[cx - 2.4 * u, cy - 2.4 * u], [cx + 2.4 * u, cy + 2.4 * u]], 1.5 * u); strokeLines([[cx - 2.4 * u, cy + 2.4 * u], [cx + 2.4 * u, cy - 2.4 * u]], 1.5 * u); }
            else strokeLines([[cx - 2.8 * u, cy], [cx + 2.8 * u, cy]], 1.5 * u);
        }
        function need(h) { if (y - h < M + 14) newPage(); }

        newPage();
        txt(M, y - 16, 20, true, model.title);
        y -= 38;
        for (var m = 0; m < model.meta.length; m++) { txt(M, y, 10, false, model.meta[m], "grey"); y -= 14; }
        y -= 8;
        icon(M + 10, y - 6, 10, model.summaryStatus);
        txt(M + 28, y - 10, 14, true, model.summary);
        y -= 34;

        for (var s = 0; s < model.sections.length; s++) {
            var sec = model.sections[s];
            need(40);
            txt(M, y - 10, 11, true, sec.title, "grey");
            cur.push(COL.line + " RG 0.6 w " + M + " " + pdfNum(y - 15) + " m " + (PW - M) + " " + pdfNum(y - 15) + " l S");
            y -= 28;
            for (var r = 0; r < sec.rows.length; r++) {
                var row = sec.rows[r];
                need(26);
                icon(M + 8, y - 4, 6.5, row.status);
                txt(M + 24, y - 8, 10.5, true, row.label + (row.ignored ? "  (ignored)" : ""));
                y -= 16;
                var extra = [];
                if (row.info) { var il = pdfWrap(row.info, 105); for (var a = 0; a < il.length; a++) extra.push({ t: il[a], c: "grey", ind: 24 }); }
                var maxIssues = 40;
                for (var q = 0; q < row.issues.length && q < maxIssues; q++) {
                    var wl = pdfWrap(row.issues[q], 100);
                    for (var b = 0; b < wl.length; b++) extra.push({ t: (b === 0 ? "- " : "  ") + wl[b], c: "dark", ind: 30 });
                }
                if (row.issues.length > maxIssues) extra.push({ t: "...and " + (row.issues.length - maxIssues) + " more", c: "grey", ind: 30 });
                for (var e = 0; e < extra.length; e++) {
                    need(12);
                    txt(M + extra[e].ind, y - 7, 8.5, false, extra[e].t, extra[e].c);
                    y -= 11.5;
                }
                y -= 7;
            }
            y -= 6;
        }
        for (var pg = 0; pg < pages.length; pg++) {
            cur = pages[pg];
            txt(PW - M - 60, 28, 8, false, "Page " + (pg + 1) + " of " + pages.length, "grey");
        }

        var out = "%PDF-1.4\n", offs = [];
        function addObj(body) { offs.push(out.length); out += offs.length + " 0 obj\n" + body + "\nendobj\n"; }
        var kids = [];
        for (var k = 0; k < pages.length; k++) kids.push((5 + 2 * k) + " 0 R");
        addObj("<< /Type /Catalog /Pages 2 0 R >>");
        addObj("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages.length + " >>");
        addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
        addObj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
        for (var p2 = 0; p2 < pages.length; p2++) {
            var content = pages[p2].join("\n");
            addObj("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PW + " " + PH + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (6 + 2 * p2) + " 0 R >>");
            addObj("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
        }
        var xref = out.length;
        out += "xref\n0 " + (offs.length + 1) + "\n0000000000 65535 f \n";
        for (var o = 0; o < offs.length; o++) {
            var n = String(offs[o]);
            while (n.length < 10) n = "0" + n;
            out += n + " 00000 n \n";
        }
        out += "trailer\n<< /Size " + (offs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
        return out;
    }

    function timestampSuffix() {
        var d = new Date();
        function p2(n) { return (n < 10 ? "0" : "") + n; }
        return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + "_" + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
    }
    function nowText() {
        var d = new Date();
        function p2(n) { return (n < 10 ? "0" : "") + n; }
        return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
    }
    function statusWord(s) { return s === "ok" ? "OK" : s === "warn" ? "CHECK" : s === "bad" ? "WRONG" : "NOT RUN"; }
    function reportIssueLines(res, limit) {
        var out = [];
        for (var j = 0; j < res.issues.length && j < limit; j++) {
            var iss = res.issues[j];
            var ab = artboardLabel(iss);
            out.push(iss.check + " | " + iss.name + " | " + iss.detail + (ab ? " [Artboard: " + ab + "]" : ""));
        }
        if (res.issues.length > limit) out.push("...and " + (res.issues.length - limit) + " more");
        return out;
    }
    function scopeText() {
        try {
            if (scopeIdx >= 0) return ddArt.selection.text;
            if (lastMeta.selCount > 0) return "Selection (" + lastMeta.selCount + " item" + (lastMeta.selCount === 1 ? "" : "s") + ")";
            return "All artboards";
        } catch (e) { return "All artboards"; }
    }
    function buildReportModel() {
        var si = summaryInfo();
        var model = {
            title: "Preflight Report",
            meta: [
                "File: " + lastMeta.docName,
                "Client: " + CLIENTS[ddClient.selection.index].label + "     Sign type: " + SIGN_TYPES[ddJob.selection.index].label,
                "Artboards: " + scopeText(),
                "Date: " + nowText()
            ],
            summary: si.text,
            summaryStatus: si.status,
            sections: []
        };
        var groups = [["STANDARD CHECKS", stdResults], ["SIGN TYPE CHECKS", jobResults]];
        for (var g = 0; g < groups.length; g++) {
            var rows = [];
            for (var r = 0; r < groups[g][1].length; r++) {
                var res = groups[g][1][r];
                rows.push({ status: res.status, label: res.label, info: res.info, ignored: res.ignored, issues: reportIssueLines(res, 41) });
            }
            model.sections.push({ title: groups[g][0], rows: rows });
        }
        return model;
    }
    function writePdfReport(f) {
        var data = buildPdf(buildReportModel());
        f.encoding = "BINARY";
        f.lineFeed = "Unix";
        if (!f.open("w")) throw new Error("Could not open the file for writing.");
        f.write(data);
        f.close();
    }
    function writeTxtReport(f) {
        var si = summaryInfo();
        f.encoding = "UTF-8";
        f.open("w");
        f.writeln("Preflight Report for: " + lastMeta.docName);
        f.writeln("Client: " + CLIENTS[ddClient.selection.index].label);
        f.writeln("Sign type: " + SIGN_TYPES[ddJob.selection.index].label);
        f.writeln("Artboards: " + scopeText());
        f.writeln("Generated: " + nowText());
        f.writeln("Summary: " + si.text);
        var sections = [["STANDARD CHECKS", stdResults], ["SIGN TYPE CHECKS", jobResults]];
        for (var s2 = 0; s2 < sections.length; s2++) {
            f.writeln("");
            f.writeln("== " + sections[s2][0] + " ==");
            for (var r = 0; r < sections[s2][1].length; r++) {
                var res = sections[s2][1][r];
                f.writeln("[" + statusWord(res.status) + "] " + res.label + (res.ignored ? "  (ignored)" : ""));
                if (res.info) f.writeln("      " + res.info);
                var lines = reportIssueLines(res, 200);
                for (var j = 0; j < lines.length; j++) f.writeln("      " + lines[j]);
            }
        }
        f.close();
    }
    function askReportFormat() {
        var last = "pdf";
        try { last = app.preferences.getStringPreference("signpack/preflight/reportfmt") || "pdf"; } catch (e) {}
        var result = null;
        var dlg = new Window("dialog", "Save Report");
        paintWin(dlg);
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.margins = 20;
        dlg.spacing = 12;
        dlg.add("statictext", undefined, "Save the report as:");
        var rPdf = dlg.add("radiobutton", undefined, "PDF (with the status icons)");
        var rTxt = dlg.add("radiobutton", undefined, "Text file (.txt)");
        if (last === "txt") rTxt.value = true; else rPdf.value = true;
        var bg = dlg.add("group");
        bg.alignment = ["center", "top"];
        bg.spacing = 12;
        var ok = bg.add("button", undefined, "Save", { name: "ok" });
        var cn = bg.add("button", undefined, "Close", { name: "cancel" });
        ok.onClick = function () { result = rPdf.value ? "pdf" : "txt"; dlg.close(); };
        cn.onClick = function () { result = null; dlg.close(); };
        paintStyle(dlg);
        dlg.center();
        dlg.show();
        if (result) { try { app.preferences.setStringPreference("signpack/preflight/reportfmt", result); } catch (e2) {} }
        return result;
    }
    function savedDialog(f) {
        try {
            var dlg = new Window("dialog", "Report saved");
            paintWin(dlg);
            dlg.orientation = "column";
            dlg.alignChildren = ["fill", "top"];
            dlg.margins = 20;
            dlg.spacing = 14;
            var t = dlg.add("statictext", undefined, "Report saved to:\n" + f.fsName, { multiline: true });
            t.preferredSize = [420, 50];
            var bg = dlg.add("group");
            bg.alignment = ["center", "top"];
            bg.spacing = 12;
            var open = bg.add("button", undefined, "Open", {});
            var ok = bg.add("button", undefined, "Close", { name: "ok" });
            open.onClick = function () { try { f.execute(); } catch (e) {} dlg.close(); };
            ok.onClick = function () { dlg.close(); };
            paintStyle(dlg);
            dlg.center();
            dlg.show();
        } catch (e) { spAlert("Report saved to:\n" + f.fsName); }
    }
    btnSave.onClick = safely(function () {
        if (!curRes && stdResults.length === 0) { messageDialog("There is nothing to save yet. Open a file, press Rescan, then save the report."); return; }
        var fmt = askReportFormat();
        if (!fmt) return;
        var docSavedPath = "";
        docSavedPath = lastMeta.docPath || "";
        var base = (docSavedPath !== "") ? docSavedPath : Folder.desktop.fsName;
        var f = new File(base + "/Preflight_Report_" + timestampSuffix() + "." + fmt);
        if (fmt === "pdf") writePdfReport(f); else writeTxtReport(f);
        savedDialog(f);
    }, "saving the report");

    stdSlots = makeSlots(stdPanel, STANDARD.length);
    jobSlots = makeSlots(jobRows, VIEW_ROWS);
    loadIgnored();
    updateButtons();
    fullScan();                 // scan BEFORE showing so the window opens at its final size
    paintStyle(win);
    styleGreenButton(btnFix, BTN_FIX, BTN_ADDLABEL);
    if (btnFix.useAlt) btnFix.useAlt(btnFix.text === "Add Label");
    win.location = uik().pos();
    win.onShow = function () { try { paintWin(win); } catch (eOs) {} };
    win.show();
    winShown = true;
    // Force a full repaint once the window is up (a heavy file can leave parts of the header unpainted).
    forceRepaint();
    TSP_RESULT = "SUCCESS: " + TSP_NAME + ": opened.";
}

main();

// last value of the file = what Sign Pack Tools shows in its status bar
(TSP_RESULT === "" ? ("WARNING: " + TSP_NAME + ": cancelled.") : TSP_RESULT);
