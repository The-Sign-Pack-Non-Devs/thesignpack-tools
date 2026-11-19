// ============================================================
//  Production Helper 1.0
//  Author: Joao Victor Malz
//  Copyright: (c) 2026 Joao Victor Malz
//  Created for use at The Sign Pack
//
//  Sign Pack toolkit - helps build a production file step by step.
//
//  1. Pick the sign type (same list as Preflight Check).
//  2. It makes a COPY of the open file named
//         <project number>_Production File_v1.ai
//     in the same folder (v2, v3... if that name is taken), keeping all the
//     art in the same place (Large Canvas, artboards and swatches included).
//     The layers you mark in the list are removed from the copy only; the
//     original file is never touched. With no saved file open, it makes a
//     blank file with a standard artboard instead.
//  3. It adds the layers this sign type needs (from the layer spec in
//     Sign_Types_x.x.json: name and layer colour) and the CutContour swatch
//     when the sign type has a CutContour layer.
//  4. A small window stays open with the checklist and notes for the sign
//     type, so you can keep working in Illustrator next to it.
//  5. Rows that can be built (CutContour, BoundingBox, Outline) have a
//     Make... button: it builds them from the selected art (or everything on
//     the active artboard), and ticks the row. "Create" adds the missing
//     layers of the sign type (empty, right colour) to the open file;
//     "Make from art..." opens the Make window with everything ticked. With
//     "Skip (no new file)" it can also save a separate production file
//     (Outline + Holes only).
//
//  CutContour: the art is copied, then Expand Appearance, Outline Stroke and
//  Pathfinder Unite are applied, the result is made a magenta stroke (CutContour),
//  the compound paths are released and each top-level group is grouped on the
//  CutContour layer. Not used with "Use my selected shapes as they are".
//
//  Pro version: a small window (Production Maker) with one button each for CutContour,
//  BoundingBox, Outline and White Ink, made straight away from the selected art (or
//  everything on the active artboard), each with its own stroke size in pt.
//
//  Needs "Sign_Types_x.x.json" in the same folder as this script.
//  "Clients_x.x.json" in the same folder adds the Client list (optional): a client can
//  change the specs of a sign type.
//
//  Note: new layers start empty, so Preflight's "Empty Layers" check may warn until you fill them.
// ============================================================


#target illustrator
#targetengine "signpack_prodhelper"

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
var TSP_NAME = "Production Helper 1.0";
var TSP_RESULT = "";

(function () {
    // ---- UI Kit: logo, popups and standard sizes live in ONE shared file ----
    // Needs "UI_Kit_x.x.jsx" in the same folder as this script (the highest version
    // is used). If it is missing the script still works: plain system popups, no logo.
    var UIK_SELF = "";
    try {
        UIK_SELF = $.global.__SELF_OVERRIDE ? $.global.__SELF_OVERRIDE : $.fileName;
        // The Make window runs in Illustrator's main engine, where $.fileName is not the script: use the job's path.
        if ($.global.__PH_JOB && $.global.__PH_JOB.self) UIK_SELF = $.global.__PH_JOB.self;
    } catch (eUS) {}
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
    var TITLE_PNG = "ph_title_helper.png";
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
            var base = $.global.__TSP_ASSET_BASE || SELF_PATH || UIK_SELF || $.fileName;
            var f = new File(File(base).parent.fsName + "/assets/" + name);
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
    var TITLE_MAKER_PNG = "ph_title_maker.png";
    function addMakerTitle(parent) {
        var im = null;
        if (STYLED_UI) {
            try {
                var tf = assetFile(TITLE_MAKER_PNG);
                if (tf && tf.length > 50) im = parent.add("image", undefined, tf);
            } catch (eTm) { im = null; }
        }
        if (!im) {
            im = parent.add("statictext", undefined, "Production Maker");
            try { im.graphics.font = ScriptUI.newFont("dialog", "BOLD", uik().TITLE_SIZE); } catch (eFm) {}
        }
        im.alignment = ["right", "center"];
        return im;
    }
    var TITLE_MAKER_SMALL_PNG = "ph_title_maker_small.png";
    // Small header of the Maker window (70 percent): the small wordmark and the small title
    function addMakerSmallHeader(row, win) {
        var ok = false;
        if (STYLED_UI) {
            try {
                var wf = assetFile(WORDMARK_SMALL);
                var tf = assetFile(TITLE_MAKER_SMALL_PNG);
                if (wf && wf.length > 50 && tf && tf.length > 50) {
                    row.alignChildren = ["left", "bottom"];
                    row.add("image", undefined, wf);
                    var sp = row.add("group");
                    sp.alignment = ["fill", "bottom"];
                    var ti = row.add("image", undefined, tf);
                    ti.alignment = ["right", "bottom"];
                    ok = true;
                }
            } catch (eMh) { ok = false; }
        }
        if (!ok) {
            addHeaderLogo(row, win);
            var sp2 = row.add("group");
            sp2.alignment = ["fill", "center"];
            addMakerTitle(row);
        }
    }
    // The checklist stays open next to Illustrator, so its header is smaller (70 percent) to keep the window thin.
    var WORDMARK_SMALL = "ph_wordmark_small.png";
    var TITLE_SMALL_PNG = "ph_title_helper_small.png";
    function addSmallHeader(row, win) {
        var ok = false;
        if (STYLED_UI) {
            try {
                var wf = assetFile(WORDMARK_SMALL);
                var tf = assetFile(TITLE_SMALL_PNG);
                if (wf && wf.length > 50 && tf && tf.length > 50) {
                    row.alignChildren = ["left", "bottom"];
                    row.add("image", undefined, wf);
                    var sp = row.add("group");
                    sp.alignment = ["fill", "bottom"];
                    var ti = row.add("image", undefined, tf);
                    ti.alignment = ["right", "bottom"];
                    ok = true;
                }
            } catch (eSh) { ok = false; }
        }
        if (!ok) {
            addHeaderLogo(row, win);
            var sp2 = row.add("group");
            sp2.alignment = ["fill", "center"];
            addHeaderTitle(row, "Production Helper");
        }
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
    var BTN_CREATE = { key: "create", w: 76, h: 28, n: "ph_btn_create_n.png", h2: "ph_btn_create_h.png", p: "ph_btn_create_p.png", d: "ph_btn_create_d.png" };
    var BTN_CREATEPF = { key: "createpf", w: 172, h: 28, n: "ph_btn_createpf_n.png", h2: "ph_btn_createpf_h.png", p: "ph_btn_createpf_p.png", d: "ph_btn_createpf_d.png" };
    var BTN_MK_CUT = { key: "mkcut", w: 124, h: 28, n: "ph_btn_mkcut_n.png", h2: "ph_btn_mkcut_h.png", p: "ph_btn_mkcut_p.png", d: "ph_btn_mkcut_d.png" };
    var BTN_MK_BOX = { key: "mkbox", w: 124, h: 28, n: "ph_btn_mkbox_n.png", h2: "ph_btn_mkbox_h.png", p: "ph_btn_mkbox_p.png", d: "ph_btn_mkbox_d.png" };
    var BTN_MK_OUT = { key: "mkout", w: 124, h: 28, n: "ph_btn_mkout_n.png", h2: "ph_btn_mkout_h.png", p: "ph_btn_mkout_p.png", d: "ph_btn_mkout_d.png" };
    var BTN_MK_WHITE = { key: "mkwhite", w: 124, h: 28, n: "ph_btn_mkwhite_n.png", h2: "ph_btn_mkwhite_h.png", p: "ph_btn_mkwhite_p.png", d: "ph_btn_mkwhite_d.png" };
    var BTN_MAKEALL = { key: "makeall", w: 124, h: 28, n: "ph_btn_makeall_n.png", h2: "ph_btn_makeall_h.png", p: "ph_btn_makeall_p.png", d: "ph_btn_makeall_d.png" };



    var SCRIPT_NAME = "Production Helper 1.0";
    var WEBSITE = "https://www.thesignpack.com/";
    var STD_WIDTH_IN = 24;          // standard artboard when there is no file to copy
    var STD_HEIGHT_IN = 36;
    var START_VERSION = 1;

    // layers marked for removal by default (names ignore caps / spaces / dashes)
    var REMOVE_KEYS = ["cutcontour", "boundingbox", "bbox", "outline", "hole", "whiteink", "grommet", "braille", "rout",
                       "measure", "reference", "dimension"];

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
                spAlert(title + "\n\n" + lines.join("\n"));
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

    // Sign types: read from the shared Sign_Types file (same folder as this script)
    // (When the checklist's Make... button starts this script in Illustrator's main engine,
    //  $.global.__PH_JOB is set: it only runs the Make window and returns.)
    var PH_JOB = $.global.__PH_JOB;
    $.global.__PH_JOB = null;
    var SELF_PATH = "";
    try { SELF_PATH = $.global.__SELF_OVERRIDE ? $.global.__SELF_OVERRIDE : $.fileName; $.global.__SELF_OVERRIDE = null; } catch (eSP) {}
    var ST = loadSignTypes(PH_JOB ? PH_JOB.self : SELF_PATH, "Production Helper", false);
    if (!ST) { if (PH_JOB) $.global.__PH_RESULT = ""; return; }
    var SIGN_TYPES = ST.types;
    var DEFAULT_TYPE = ST.defaultType;
    var SIGN_TYPES_VERSION = ST.version + (ST.source === "jsx" ? " (.jsx backup)" : "");
    // Client profiles: Clients_x.x.json next to this script (built-in standard profile if it is missing).
    var CLIENTS = loadClients(PH_JOB ? PH_JOB.self : SELF_PATH, "helper", !!PH_JOB).clients;
    if (PH_JOB) {
        $.global.__PH_RESULT = makerMain(PH_JOB) || "";
        return;
    }

    // ============================================================
    //  MAKE: builds CutContour / BoundingBox / Outline (and, optionally, the separate
    //  production file). Always runs in Illustrator's MAIN engine, started from the
    //  checklist window. pre = { typeLabel, want, noSeparate }. Returns what was made.
    // ============================================================
    // ---- Layer spec helpers (new file, "Create layers" and the Make window share them) ----
    function phNorm(n) { return ("" + n).toLowerCase().replace(/[\s_\-]/g, ""); }
    function phRGB(colorName) {
        var c = ST.colors ? ST.colors[colorName] : null;
        return (c && c.length === 3) ? c : null;
    }
    function phSetLayerColor(ly, colorName) {
        var c = phRGB(colorName);
        if (!c) return;
        try {
            var rc = new RGBColor();
            rc.red = c[0]; rc.green = c[1]; rc.blue = c[2];
            ly.color = rc;
        } catch (e) {}
    }
    function phFindLayer(d, name) {
        for (var i = 0; i < d.layers.length; i++) if (phNorm(d.layers[i].name) === phNorm(name)) return d.layers[i];
        return null;
    }
    function phTypeHasLayer(t, key) {
        for (var i = 0; i < t.layers.length; i++) if (phNorm(t.layers[i].name) === key) return true;
        return false;
    }
    function phTypeHasCut(t) {
        for (var i = 0; i < t.layers.length; i++) if (phNorm(t.layers[i].name) === "cutcontour" || t.layers[i].element === "magenta") return true;
        return false;
    }
    function phEnsureCutSpot(d) {
        for (var i = 0; i < d.spots.length; i++) if (phNorm(d.spots[i].name) === "cutcontour") return false;
        var sp = d.spots.add();
        sp.name = "CutContour";
        sp.colorType = ColorModel.SPOT;
        var mc = new CMYKColor();
        mc.cyan = 0; mc.magenta = 100; mc.yellow = 0; mc.black = 0;
        sp.color = mc;
        return true;
    }
    // Adds the layers of the sign type that are missing (the first one in the spec ends on top)
    // with the spec colour. Layers that already exist are not touched. Returns the names added.
    function phEnsureLayers(d, t) {
        var added = [];
        for (var i = t.layers.length - 1; i >= 0; i--) {
            var sp = t.layers[i];
            if (phFindLayer(d, sp.name)) continue;
            var ly = d.layers.add();
            ly.name = sp.name;
            phSetLayerColor(ly, sp.color);
            added.unshift(sp.name);
        }
        return added;
    }

    function phLev(a, b) {
        var m = a.length, n = b.length, d = [], i, j;
        for (i = 0; i <= m; i++) d[i] = [i];
        for (j = 1; j <= n; j++) d[0][j] = j;
        for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, Math.min(d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)));
        return d[m][n];
    }
    // Deletes the top-level layers that are not in the spec (and everything on them).
    // Kept: layers with the spec name (or a close misspelling of it) and any layer with "design" in the name.
    function phRemoveExtras(d, t, tempName) {
        var gone = [];
        for (var i = d.layers.length - 1; i >= 0; i--) {
            var ly = d.layers[i], nm = "";
            try { nm = ly.name; } catch (e0) { continue; }
            var n = phNorm(nm), keep = (n === phNorm(tempName)) || n.indexOf("design") >= 0;
            for (var k = 0; k < t.layers.length && !keep; k++) {
                var w = phNorm(t.layers[k].name), dist = phLev(n, w);
                if (n === w || (n !== "" && ((dist <= 2 && dist < w.length - 1) || (n.length >= 4 && w.indexOf(n) === 0) || (w.length >= 4 && n.indexOf(w) === 0)))) keep = true;
            }
            if (keep) continue;
            try { ly.locked = false; ly.visible = true; ly.remove(); gone.push(nm); } catch (e1) {}
        }
        return gone;
    }

    function makerMain(pre) {
    var CUT_LAYER = "CutContour";
    var CUT_SPOT = "CutContour";
    var BOX_LAYER = "Bounding Box";
    var OUT_LAYER = "Outline";
    var TAG_PREFIX = "PM ";                 // items made by this script are named "PM ..."
    var KEEP_IN_CUTFILE = ["outline", "hole", "rout"];
    var STROKE_REAL_PT = 1;                 // real points (divided by the scale factor on Large Canvas)
    var DIRECT = !!(pre && pre.direct);     // started from the Maker window: no Make window, just do it
    function mkStroke(k, def) {
        var v = def;
        try { if (pre && pre.strokes && pre.strokes[k] !== undefined && !isNaN(pre.strokes[k])) v = pre.strokes[k]; } catch (eMs) {}
        return v;
    }

    if (app.documents.length === 0) { spAlert("Please open a document first."); return; }
    var MK_CLIENT = findClientByLabel(CLIENTS, (pre && pre.clientLabel) ? pre.clientLabel : "");
    function mkType(i) { return applyClientToType(SIGN_TYPES[i], MK_CLIENT); }
    var doc = app.activeDocument;
    var sf = 1;
    try { if (doc.scaleFactor) sf = doc.scaleFactor; } catch (eSf) {}
    var MK_TYPE = null;
    for (var mti = 0; mti < SIGN_TYPES.length; mti++) if (pre && SIGN_TYPES[mti].label === pre.typeLabel) MK_TYPE = mkType(mti);

    // "Create layers": only adds the layers of the sign type (empty, spec colours) to the open file.
    if (pre && pre.want === "layers") {
        if (!MK_TYPE) return "";
        var lrAdded = [], lrSpot = false;
        try {
            lrAdded = phEnsureLayers(doc, MK_TYPE);
            if (phTypeHasCut(MK_TYPE)) lrSpot = phEnsureCutSpot(doc);
            app.redraw();
        } catch (eLr) {
            spAlert("The layers could not be created.\n\nDetails: " + eLr + (eLr.line ? " (line " + eLr.line + ")" : ""), "Production Helper");
            return "";
        }
        spAlert((lrAdded.length > 0 ? "Layers created: " + lrAdded.join(", ") + "." : "All the layers of this sign type are already in the file.") +
                (lrSpot ? "\nSwatch added: CutContour (spot, 100% M)." : "") + "\n\nRun Preflight Check to confirm names and colours. Ctrl+Z undoes it.", "Production Helper - Create layers");
        return "layers";
    }

    // ---------- small helpers ----------
    function getPref(key, def) {
        try { return app.preferences.getStringPreference("signpack/productionmaker/" + key) || def; } catch (e) { return def; }
    }
    function setPref(key, val) {
        try { app.preferences.setStringPreference("signpack/productionmaker/" + key, String(val)); } catch (e) {}
    }
    function normName(n) { return ("" + n).toLowerCase().replace(/[\s_\-]/g, ""); }
    function isCutLayerName(n) { return normName(n).indexOf("cutcontour") >= 0; }
    function isBBoxLayerName(n) { var x = normName(n); return x.indexOf("boundingbox") >= 0 || x.indexOf("bbox") >= 0; }
    function isOutlineLayerName(n) { return normName(n).indexOf("outline") === 0; }
    function isHolesLayerName(n) { return normName(n).indexOf("hole") >= 0; }
    function isWhiteInkLayerName(n) { return normName(n).indexOf("whiteink") >= 0; }
    function isProdLayerName(n) {
        return isCutLayerName(n) || isBBoxLayerName(n) || isOutlineLayerName(n) || isHolesLayerName(n) || isWhiteInkLayerName(n) || normName(n) === "pmtemp";
    }
    function onProdLayer(it) {
        var p = it, guard = 0;
        while (p && guard++ < 60) {
            try {
                if (p.typename === "Layer" && isProdLayerName(p.name)) return true;
                if (p.typename === "Document") break;
                p = p.parent;
            } catch (e) { break; }
        }
        return false;
    }
    function inDoc(inches) { return inches * 72 / sf; }           // inches -> doc units
    function cmyk(c, m, y, k) { var x = new CMYKColor(); x.cyan = c; x.magenta = m; x.yellow = y; x.black = k; return x; }
    function black() { return cmyk(0, 0, 0, 100); }
    function parseNum(s, def) { var v = parseFloat(String(s).replace(",", ".")); return isNaN(v) ? def : v; }

    function getLayer(name, test) {
        for (var i = 0; i < doc.layers.length; i++) {
            if (test(doc.layers[i].name)) return doc.layers[i];
        }
        var lay = doc.layers.add();
        lay.name = name;
        try {
            if (MK_TYPE) for (var k = 0; k < MK_TYPE.layers.length; k++) if (normName(MK_TYPE.layers[k].name) === normName(name)) phSetLayerColor(lay, MK_TYPE.layers[k].color);
        } catch (eCol) {}
        return lay;
    }
    function openLayer(lay) {
        var st = { locked: lay.locked, visible: lay.visible };
        lay.locked = false;
        lay.visible = true;
        return st;
    }
    // boxes (optional): when the script runs on a selection, only the earlier lines whose centre sits inside one of
    // the selected items' boxes are replaced; lines of other elements stay. Without boxes everything it made is removed.
    var REPLACE_BOXES = null;
    function removePrevious(lay, boxes) {
        var n = 0;
        for (var i = lay.pageItems.length - 1; i >= 0; i--) {
            try {
                var it = lay.pageItems[i];
                if (String(it.name).indexOf(TAG_PREFIX) !== 0) continue;
                if (boxes) {
                    if (!it.parent || it.parent.typename !== "Layer") continue;
                    var gb = it.geometricBounds;
                    var cx = (gb[0] + gb[2]) / 2, cy = (gb[1] + gb[3]) / 2, hit = false;
                    for (var b = 0; b < boxes.length; b++) {
                        var bx = boxes[b];
                        if (cx >= bx[0] && cx <= bx[2] && cy <= bx[1] && cy >= bx[3]) { hit = true; break; }
                    }
                    if (!hit) continue;
                }
                it.remove(); n++;
            } catch (e) {}
        }
        return n;
    }

    // CutContour spot: find or create (100% M)
    function getCutSpotColor() {
        var spot = null;
        for (var i = 0; i < doc.spots.length; i++) {
            if (normName(doc.spots[i].name) === normName(CUT_SPOT)) { spot = doc.spots[i]; break; }
        }
        if (!spot) {
            spot = doc.spots.add();
            spot.name = CUT_SPOT;
            spot.colorType = ColorModel.SPOT;
            spot.color = cmyk(0, 100, 0, 0);
        }
        var sc = new SpotColor();
        sc.spot = spot;
        sc.tint = 100;
        return sc;
    }

    // True bounds of an item (clip-mask aware)
    function realBounds(item) {
        try {
            if (item.hidden) return null;
            if (item.typename === "PathItem" && item.guides) return null;
            if (item.typename === "GroupItem") {
                if (item.clipped) {
                    for (var c = 0; c < item.pageItems.length; c++) {
                        var pi = item.pageItems[c];
                        if (pi.typename === "PathItem" && pi.clipping) return pi.visibleBounds;
                        if (pi.typename === "CompoundPathItem" && pi.pathItems.length > 0 && pi.pathItems[0].clipping) return pi.visibleBounds;
                    }
                }
                var u = null;
                for (var g = 0; g < item.pageItems.length; g++) {
                    var cb = realBounds(item.pageItems[g]);
                    if (!cb) continue;
                    if (!u) u = [cb[0], cb[1], cb[2], cb[3]];
                    else {
                        if (cb[0] < u[0]) u[0] = cb[0];
                        if (cb[1] > u[1]) u[1] = cb[1];
                        if (cb[2] > u[2]) u[2] = cb[2];
                        if (cb[3] < u[3]) u[3] = cb[3];
                    }
                }
                if (u) return u;
            }
            return item.visibleBounds;
        } catch (e) { return null; }
    }
    function unionBounds(items) {
        var u = null;
        for (var i = 0; i < items.length; i++) {
            var b = realBounds(items[i]);
            if (!b) continue;
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

    // ---------- gather the art to work on ----------
    // Returns { items: [...], usedSelection: bool, skipped: n }
    function gatherArt() {
        var out = { items: [], usedSelection: false, skipped: 0 };
        var sel = [];
        try { sel = doc.selection; } catch (e0) { sel = []; }
        if (sel && sel.length > 0) {
            out.usedSelection = true;
            for (var s = 0; s < sel.length; s++) {
                if (onProdLayer(sel[s])) { out.skipped++; continue; }
                out.items.push(sel[s]);
            }
            return out;
        }
        var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
        for (var i = 0; i < doc.pageItems.length; i++) {
            try {
                var it = doc.pageItems[i];
                var par = it.parent;
                if (!par || par.typename !== "Layer") continue;          // top-level items only
                if (it.hidden || it.locked) continue;
                if (it.typename === "PathItem" && (it.guides || it.clipping)) continue;
                if (!par.visible || par.locked) continue;
                if (onProdLayer(it)) continue;
                var b = realBounds(it);
                if (!b) continue;
                var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
                if (cx >= ab[0] && cx <= ab[2] && cy <= ab[1] && cy >= ab[3]) out.items.push(it);
            } catch (e) {}
        }
        return out;
    }

    // ---------- silhouette: unite everything into one outline shape ----------
    // Works on duplicates in a temporary layer. Returns an array of result items
    // (selected in the document), or null if nothing could be built.
    // (Used by Outline. CutContour has its own routine: buildCutContour.)
    function buildSilhouette(items, offsetDoc, tmpLayer) {
        var shapes = [], roots = [];

        function makeRect(b) {
            return tmpLayer.pathItems.rectangle(b[1], b[0], b[2] - b[0], b[1] - b[3]);
        }
        function flatten(it) {
            var t = it.typename;
            if (t === "TextFrame") {
                try { var g = it.createOutline(); flatten(g); }
                catch (eT) { var tb = it.visibleBounds; var r = makeRect(tb); try { it.remove(); } catch (eR) {} shapes.push(r); }
                return;
            }
            if (t === "PathItem") {
                if (it.guides || it.clipping) { try { it.remove(); } catch (e1) {} return; }
                shapes.push(it);
                return;
            }
            if (t === "CompoundPathItem") { shapes.push(it); return; }
            if (t === "GroupItem") {
                if (it.clipped) {
                    var cp = null;
                    for (var k = 0; k < it.pageItems.length; k++) {
                        var pi = it.pageItems[k];
                        if (pi.typename === "PathItem" && pi.clipping) { cp = pi; break; }
                        if (pi.typename === "CompoundPathItem" && pi.pathItems.length > 0 && pi.pathItems[0].clipping) { cp = pi; break; }
                    }
                    if (cp) {
                        var c2 = cp.duplicate(tmpLayer, ElementPlacement.PLACEATEND);
                        try {
                            if (c2.typename === "PathItem") c2.clipping = false;
                            else for (var q = 0; q < c2.pathItems.length; q++) c2.pathItems[q].clipping = false;
                        } catch (eC) {}
                        shapes.push(c2);
                        try { it.remove(); } catch (eG) {}
                        return;
                    }
                }
                var kids = [];
                for (var j = 0; j < it.pageItems.length; j++) kids.push(it.pageItems[j]);
                for (var j2 = 0; j2 < kids.length; j2++) flatten(kids[j2]);
                return;
            }
            // images, symbols, meshes, plug-in art: use the bounding rectangle
            var b = null;
            try { b = it.visibleBounds; } catch (eB) {}
            if (b) shapes.push(makeRect(b));
            try { it.remove(); } catch (eRm) {}
        }

        for (var i = 0; i < items.length; i++) {
            try {
                var dup = items[i].duplicate(tmpLayer, ElementPlacement.PLACEATEND);
                roots.push(dup);
                flatten(dup);
            } catch (eD) {}
        }
        if (shapes.length === 0) return null;

        var grp = tmpLayer.groupItems.add();
        var fillBlack = black();
        for (var s = 0; s < shapes.length; s++) {
            try {
                var sh = shapes[s];
                if (sh.typename === "PathItem") { sh.filled = true; sh.fillColor = fillBlack; sh.stroked = false; }
                else if (sh.pathItems.length > 0) { sh.pathItems[0].filled = true; sh.pathItems[0].fillColor = fillBlack; sh.pathItems[0].stroked = false; }
                sh.move(grp, ElementPlacement.PLACEATEND);
            } catch (eM) {}
        }
        for (var r = 0; r < roots.length; r++) {
            try { if (roots[r].typename === "GroupItem" && roots[r] !== grp && roots[r].pageItems.length === 0) roots[r].remove(); } catch (eE) {}
        }
        if (grp.pageItems.length === 0) return null;

        function selectItems(list) {
            doc.selection = null;
            for (var z = 0; z < list.length; z++) { try { list[z].selected = true; } catch (eS) {} }
        }
        function currentSelection() {
            var arr = [];
            for (var z = 0; z < doc.selection.length; z++) arr.push(doc.selection[z]);
            return arr;
        }
        function unite() {
            try {
                app.executeMenuCommand("Live Pathfinder Add");
                app.executeMenuCommand("expandStyle");
            } catch (eU) {}
        }

        selectItems([grp]);
        unite();
        var result = currentSelection();
        if (result.length === 0) return null;

        if (offsetDoc !== 0) {
            var xml = '<LiveEffect name="Adobe Offset Path"><Dict data="R mlim 4 R ofst ' + offsetDoc + ' I jntp 2 "/></LiveEffect>';
            for (var o = 0; o < result.length; o++) { try { result[o].applyEffect(xml); } catch (eO) { throw new Error("Offset Path effect failed: " + eO); } }
            selectItems(result);
            try { app.executeMenuCommand("expandStyle"); } catch (eX) {}
            result = currentSelection();
            if (result.length > 1 || (result.length === 1 && result[0].typename === "GroupItem")) {
                selectItems(result);
                unite();
                result = currentSelection();
            }
        }
        return result;
    }

    // Sharp corners and square ends, plain line: a cut line must follow the art's own shape,
    // never a round join that came from the art or from the document defaults.
    function sharpLine(p) {
        try { p.strokeJoin = StrokeJoin.MITERENDJOIN; } catch (e1) {}
        try { p.strokeCap = StrokeCap.BUTTENDCAP; } catch (e2) {}
        try { p.strokeMiterLimit = 10; } catch (e3) {}
        try { p.strokeDashes = []; } catch (e4) {}
    }

    // Style every path inside an item
    function walkPaths(it, fn) {
        try {
            if (it.typename === "PathItem") fn(it);
            else if (it.typename === "CompoundPathItem") { for (var i = 0; i < it.pathItems.length; i++) fn(it.pathItems[i]); }
            else if (it.typename === "GroupItem") { for (var j = 0; j < it.pageItems.length; j++) walkPaths(it.pageItems[j], fn); }
        } catch (e) {}
    }
    function styleStroke(it, color, tag) {
        var n = 0, open = 0;
        walkPaths(it, function (p) {
            p.filled = false;
            p.stroked = true;
            p.strokeColor = color;
            p.strokeWidth = STROKE_REAL_PT / sf;
            sharpLine(p);
            try { p.name = tag; } catch (e1) {}
            n++;
            if (!p.closed) open++;
        });
        try { it.name = tag; } catch (e2) {}
        return { n: n, open: open };
    }

    // Builds the silhouette and puts it on a production layer (cut line / outline)
    // cutMode (CutContour): the shapes are outlined before the merge (see buildSilhouette) and, after the
    // merge, the compound paths are released and everything is grouped on the layer.
    // ---------- CutContour: the manual way, one top-level group at a time ----------
    // For each selected (or top-level) item: copy it onto the CutContour layer as it is (groups kept),
    // select it, Expand Appearance, Outline Stroke, Pathfinder Unite, CutContour color + stroke only,
    // Release Compound Path (the group stays). Illustrator errors are kept in CUT_ERRORS.
    var CUT_ERRORS = [];
    function selList(list) {
        doc.selection = null;
        for (var z = 0; z < list.length; z++) { try { list[z].selected = true; } catch (eS) {} }
    }
    function curSel() {
        var arr = [];
        try { for (var z = 0; z < doc.selection.length; z++) arr.push(doc.selection[z]); } catch (eC) {}
        return arr;
    }
    function cutCmd(label, cmd) {
        try { app.executeMenuCommand(cmd); } catch (eCm) { CUT_ERRORS.push(label + ": " + (eCm && eCm.message ? eCm.message : eCm)); }
    }
    // Text gets Create Outlines in place; images/symbols become a rectangle; guides are dropped
    function prepCopy(it) {
        var t = it.typename;
        if (t === "TextFrame") {
            try { return it.createOutline(); }
            catch (eT) { return rectFor(it); }
        }
        if (t === "GroupItem") {
            var kids = [];
            for (var k = 0; k < it.pageItems.length; k++) kids.push(it.pageItems[k]);
            for (var k2 = 0; k2 < kids.length; k2++) prepCopy(kids[k2]);
            return it;
        }
        if (t === "PathItem") { if (it.guides) { try { it.remove(); } catch (eG) {} return null; } return it; }
        if (t === "CompoundPathItem") return it;
        return rectFor(it);
    }
    function rectFor(it) {
        try {
            var b = it.visibleBounds;
            var r = it.parent.pathItems.rectangle(b[1], b[0], b[2] - b[0], b[1] - b[3]);
            r.filled = true; r.fillColor = black(); r.stroked = false;
            try { it.remove(); } catch (eR) {}
            return r;
        } catch (eB) { return null; }
    }
    function findCompounds(it, out) {
        try {
            if (it.typename === "CompoundPathItem") out.push(it);
            else if (it.typename === "GroupItem") { for (var a = 0; a < it.pageItems.length; a++) findCompounds(it.pageItems[a], out); }
        } catch (eF) {}
    }
    function buildCutContour(items, lay, color, tag) {
        var tot = { n: 0, open: 0, failed: 0 };
        for (var vi = 0; vi < items.length; vi++) {
            try {
                var dup = items[vi].duplicate(lay, ElementPlacement.PLACEATEND);
                dup = prepCopy(dup);
                if (!dup) { tot.failed++; continue; }
                if (dup.typename !== "GroupItem") {
                    var wrap = lay.groupItems.add();
                    dup.move(wrap, ElementPlacement.PLACEATEND);
                    dup = wrap;
                }
                selList([dup]);
                cutCmd("Expand Appearance", "expandStyle");
                cutCmd("Outline Stroke", "Live Outline Stroke");
                cutCmd("Expand", "expandStyle");
                cutCmd("Pathfinder Unite", "Live Pathfinder Add");
                cutCmd("Expand", "expandStyle");
                var res = curSel();
                var top;
                if (res.length === 1 && res[0].typename === "GroupItem") top = res[0];
                else if (res.length === 0) { top = dup; }
                else {
                    top = lay.groupItems.add();
                    for (var ri = 0; ri < res.length; ri++) { try { res[ri].move(top, ElementPlacement.PLACEATEND); } catch (eRm) {} }
                }
                try { styleStroke(top, color, tag); } catch (eSt) {}
                var cps = [];
                findCompounds(top, cps);
                if (cps.length > 0) {
                    selList(cps);
                    cutCmd("Release Compound Path", "noCompoundPath");
                }
                try { doc.selection = null; } catch (eNs) {}
                var rs = styleStroke(top, color, tag);
                tot.n += rs.n; tot.open += rs.open;
            } catch (eV) { tot.failed++; }
        }
        return tot;
    }
    function makeShapeLayer(items, layerName, layerTest, color, tag, offsetInches, cutMode) {
        var lay = getLayer(layerName, layerTest);
        var st = openLayer(lay);
        var removed = removePrevious(lay, REPLACE_BOXES);
        var made = { n: 0, open: 0, removed: removed, layer: lay.name };
        if (cutMode) {
            // CutContour works straight on its own layer, one top-level item at a time
            try {
                CUT_ERRORS = [];
                var rcV = buildCutContour(items, lay, color, tag);
                made.n += rcV.n; made.open += rcV.open;
                if (made.n === 0) throw new Error("Could not build an outline from this art." + (CUT_ERRORS.length > 0 ? " Illustrator said: " + CUT_ERRORS.join("; ") : ""));
                if (rcV.failed > 0) CUT_ERRORS.push(rcV.failed + " item(s) could not be outlined");
            } finally {
                try { doc.selection = null; } catch (e0c) {}
                try { lay.locked = st.locked; } catch (e2c) {}
            }
            return made;
        }
        var tmp = doc.layers.add();
        tmp.name = "PM_TEMP";
        try {
            var res = buildSilhouette(items, inDoc(offsetInches), tmp);
            if (!res) throw new Error("Could not build an outline from this art.");
            for (var i = 0; i < res.length; i++) {
                res[i].move(lay, ElementPlacement.PLACEATEND);
                var r = styleStroke(res[i], color, tag);
                made.n += r.n; made.open += r.open;
            }
        } finally {
            try { doc.selection = null; } catch (e0) {}
            try { tmp.locked = false; tmp.remove(); } catch (e1) {}
            try { lay.locked = st.locked; } catch (e2) {}
        }
        return made;
    }

    // White Ink spot: find or create (display color cyan, same as the plugin's script)
    var WHITE_LAYER = "White Ink";
    var WHITE_SPOT = "White Ink";
    function getWhiteSpotColor() {
        var spot = null;
        for (var i = 0; i < doc.spots.length; i++) {
            if (normName(doc.spots[i].name) === normName(WHITE_SPOT)) { spot = doc.spots[i]; break; }
        }
        if (!spot) {
            spot = doc.spots.add();
            spot.name = WHITE_SPOT;
            spot.colorType = ColorModel.SPOT;
            spot.color = cmyk(100, 0, 0, 0);
        }
        var sc = new SpotColor();
        sc.spot = spot;
        sc.tint = 100;
        return sc;
    }

    // Copies of the chosen art, exactly as drawn (no tracing, no distance), styled by styleFn(item).
    // Text is outlined on the copy. Images/symbols become a rectangle when imgAsRect, else are skipped.
    // Returns { n, open, skipped } and leaves the copies in one named group on the layer.
    function copyAsIs(items, layerName, layerTest, tag, styleFn, imgAsRect) {
        var lay = getLayer(layerName, layerTest);
        var st = openLayer(lay);
        var removed = removePrevious(lay, REPLACE_BOXES);
        var grp = lay.groupItems.add();
        var res = { n: 0, open: 0, skipped: 0, removed: removed, layer: lay.name };
        function styleIt(it) {
            var r = styleFn(it);
            if (r) { res.n += r.n; res.open += r.open; }
        }
        function take(it) {
            var t = it.typename;
            if (t === "TextFrame") {
                var d = it.duplicate(grp, ElementPlacement.PLACEATEND);
                var o = d.createOutline();
                styleIt(o);
                return;
            }
            if (t === "PathItem") {
                if (it.guides || it.clipping) return;
                styleIt(it.duplicate(grp, ElementPlacement.PLACEATEND));
                return;
            }
            if (t === "CompoundPathItem") { styleIt(it.duplicate(grp, ElementPlacement.PLACEATEND)); return; }
            if (t === "GroupItem") {
                if (it.clipped) {
                    for (var k = 0; k < it.pageItems.length; k++) {
                        var pi = it.pageItems[k];
                        var isClip = (pi.typename === "PathItem" && pi.clipping) ||
                                     (pi.typename === "CompoundPathItem" && pi.pathItems.length > 0 && pi.pathItems[0].clipping);
                        if (isClip) {
                            var c2 = pi.duplicate(grp, ElementPlacement.PLACEATEND);
                            try {
                                if (c2.typename === "PathItem") c2.clipping = false;
                                else for (var q = 0; q < c2.pathItems.length; q++) c2.pathItems[q].clipping = false;
                            } catch (eC) {}
                            styleIt(c2);
                            return;
                        }
                    }
                }
                for (var j = 0; j < it.pageItems.length; j++) take(it.pageItems[j]);
                return;
            }
            if (imgAsRect) {
                var b = null;
                try { b = it.visibleBounds; } catch (eB) {}
                if (b) {
                    var r = grp.pathItems.rectangle(b[1], b[0], b[2] - b[0], b[1] - b[3]);
                    styleIt(r);
                    return;
                }
            }
            res.skipped++;
        }
        try {
            for (var i = 0; i < items.length; i++) { try { take(items[i]); } catch (eT) { res.skipped++; } }
            if (grp.pageItems.length === 0) { try { grp.remove(); } catch (eG) {} }
            else { try { grp.name = tag; } catch (eN) {} }
        } finally {
            try { lay.locked = st.locked; } catch (eL) {}
        }
        return res;
    }

    function makeBoundingBox(items, usedSelection, strokeK) {
        var lay = getLayer(BOX_LAYER, isBBoxLayerName);
        var st = openLayer(lay);
        var b = null;
        if (usedSelection || items.length > 0) b = unionBounds(items);
        if (!b) {
            var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
            b = [ab[0], ab[1], ab[2], ab[3]];
        }
        // With a selection: replace only the earlier box of this element (centre inside the selected art's box)
        var removed = removePrevious(lay, REPLACE_BOXES ? REPLACE_BOXES.concat([b]) : null);
        var rect = lay.pathItems.rectangle(b[1], b[0], b[2] - b[0], b[1] - b[3]);
        rect.filled = false;
        if (strokeK) {
            rect.stroked = true;
            rect.strokeColor = black();
            rect.strokeWidth = STROKE_REAL_PT / sf;
            sharpLine(rect);
        } else {
            rect.stroked = false;
        }
        rect.name = TAG_PREFIX + "BoundingBox";
        try { lay.locked = st.locked; } catch (e) {}
        return { removed: removed, w: (b[2] - b[0]) * sf / 72, h: (b[1] - b[3]) * sf / 72 };
    }

    // ---------- separate production file ----------
    function pruneLayers(layers) {
        // keeps layers whose name matches (or that hold a matching sub-layer); returns true if anything is kept
        var kept = false;
        for (var i = layers.length - 1; i >= 0; i--) {
            var ly = layers[i], nm = normName(ly.name), keep = false;
            for (var k = 0; k < KEEP_IN_CUTFILE.length; k++) if (nm.indexOf(KEEP_IN_CUTFILE[k]) >= 0) { keep = true; break; }
            if (keep) { kept = true; continue; }
            var subKept = false;
            try { if (ly.layers.length > 0) subKept = pruneLayers(ly.layers); } catch (eS) {}
            if (subKept) { kept = true; continue; }
            try { ly.remove(); } catch (eR) {}
        }
        return kept;
    }
    function restyleBlack(container) {
        function walk(it) {
            try {
                if (it.typename === "PathItem") {
                    it.filled = false;
                    it.stroked = true;
                    it.strokeColor = black();
                    it.strokeWidth = STROKE_REAL_PT / sf;
                    sharpLine(it);
                } else if (it.typename === "CompoundPathItem") {
                    for (var i = 0; i < it.pathItems.length; i++) walk(it.pathItems[i]);
                } else if (it.typename === "GroupItem") {
                    for (var j = 0; j < it.pageItems.length; j++) walk(it.pageItems[j]);
                } else if (it.typename === "TextFrame") {
                    var g = it.createOutline();
                    walk(g);
                }
            } catch (e) {}
        }
        var list = [];
        for (var p = 0; p < container.pageItems.length; p++) list.push(container.pageItems[p]);
        for (var q = 0; q < list.length; q++) walk(list[q]);
        for (var s = 0; s < container.layers.length; s++) restyleBlack(container.layers[s]);
    }
    function unlockAll(layers) {
        for (var i = 0; i < layers.length; i++) {
            try {
                layers[i].locked = false;
                layers[i].visible = true;
                if (layers[i].layers.length > 0) unlockAll(layers[i].layers);
            } catch (e) {}
        }
    }
    function saveCutFile(destPath, alsoPdf, presetName) {
        var destFolder = new Folder(destPath);
        if (!destFolder.exists) { if (!destFolder.create()) throw new Error("The production file folder does not exist and could not be created."); }
        var hasPath = true;
        try { var testPath = doc.fullName; } catch (eNP) { hasPath = false; }
        if (!hasPath) throw new Error("Save this file once first, so the production file can be made from it.");
        doc.save();
        var src = doc.fullName;
        var baseName = decodeURI(doc.name).replace(/\.[^\.]+$/, "").replace(/[\/\\:*?"<>|]/g, "-");
        var outBase = baseName + " CUT";
        var prev = app.userInteractionLevel;
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
        var tempAi = new File(destFolder.fsName + "/_pm_temp.ai");
        var cutDoc = null;
        var aiOut = null;
        try {
            if (!src.copy(tempAi)) throw new Error("Could not copy the file to the production folder.");
            cutDoc = app.open(tempAi);
            unlockAll(cutDoc.layers);
            var kept = pruneLayers(cutDoc.layers);
            if (!kept) throw new Error("No Outline / Holes layer found to put in the production file.");
            for (var l = 0; l < cutDoc.layers.length; l++) restyleBlack(cutDoc.layers[l]);
            aiOut = new File(destFolder.fsName + "/" + outBase + ".ai");
            var aiOpts = new IllustratorSaveOptions();
            aiOpts.pdfCompatible = true;
            cutDoc.saveAs(aiOut, aiOpts);
            if (alsoPdf) {
                var pdfOut = new File(destFolder.fsName + "/" + outBase + ".pdf");
                var pdfOpts = new PDFSaveOptions();
                pdfOpts.viewAfterSaving = false;
                if (presetName && presetName !== "") pdfOpts.pDFPreset = presetName;
                cutDoc.saveAs(pdfOut, pdfOpts);
            }
            cutDoc.close(SaveOptions.DONOTSAVECHANGES);
            cutDoc = null;
            try { tempAi.remove(); } catch (eT) {}
        } catch (eCf) {
            try { if (cutDoc) cutDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (e1) {}
            try { if (tempAi.exists) tempAi.remove(); } catch (e2) {}
            app.userInteractionLevel = prev;
            try { doc.activate(); } catch (e3) {}
            throw eCf;
        }
        app.userInteractionLevel = prev;
        try { doc.activate(); } catch (e4) {}
        return aiOut.fsName;
    }

    // Removes only what this script made on the Outline layer; drops the layer if it ends up empty
    function removeMadeOutline() {
        var n = 0;
        for (var i = doc.layers.length - 1; i >= 0; i--) {
            var lay = doc.layers[i];
            if (!isOutlineLayerName(lay.name)) continue;
            try { lay.locked = false; } catch (e0) {}
            n += removePrevious(lay);
            try { if (lay.pageItems.length === 0 && lay.layers.length === 0) lay.remove(); } catch (e1) {}
        }
        return n;
    }

    function getPdfPresets() {
        var arr = [];
        try {
            var l = app.PDFPresetsList;
            for (var i = 0; i < l.length; i++) arr.push(String(l[i]));
        } catch (e) {}
        if (arr.length === 0) arr = ["[High Quality Print]", "[Press Quality]", "[Smallest File Size]"];
        return arr;
    }

    // ============================================================
    //  UI
    // ============================================================
    var presets = getPdfPresets();
    var win = new Window("dialog", SCRIPT_NAME + " - Make");
    paintWin(win);   // dark grey first: the UI Kit picks the white logo on a dark window
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = uik().MARGINS;
    win.spacing = uik().SPACING;

    var headRow = win.add("group");
    headRow.alignment = ["fill", "top"];
    headRow.alignChildren = ["left", "center"];
    headRow.spacing = 10;
    headRow.margins = 0;
    addHeaderLogo(headRow, win);
    var logoSpacer = headRow.add("group");
    logoSpacer.alignment = ["fill", "center"];
    addHeaderTitle(headRow, "Production Helper");
    addAccentLine(win);
    win.add("statictext", undefined, "Make production layers");
    addSignTypesTag(win, SIGN_TYPES_VERSION);

    var typeRow = win.add("group");
    typeRow.add("statictext", undefined, "Sign type:");
    var labels = [];
    for (var ti = 0; ti < SIGN_TYPES.length; ti++) labels.push(SIGN_TYPES[ti].label);
    var ddType = typeRow.add("dropdownlist", undefined, labels);
    ddType.preferredSize.width = 300;
    var savedType = getPref("signtype", "");
    if (savedType === "") { try { savedType = app.preferences.getStringPreference("signpack/preflight/signtype") || ""; } catch (eP) {} }
    if (savedType === "") savedType = DEFAULT_TYPE;
    var typeIdx = 0;
    for (var tj = 0; tj < SIGN_TYPES.length; tj++) if (SIGN_TYPES[tj].label === savedType) typeIdx = tj;
    if (pre && pre.typeLabel) {
        for (var tk = 0; tk < SIGN_TYPES.length; tk++) if (SIGN_TYPES[tk].label === pre.typeLabel) typeIdx = tk;
    }
    ddType.selection = typeIdx;
    if (pre && pre.typeLabel) ddType.enabled = false;     // the checklist is already set for this sign type
    if (MK_CLIENT) {
        var mkClientTxt = typeRow.add("statictext", undefined, "Client: " + MK_CLIENT.label);
        mkClientTxt.margins = [14, 0, 0, 0];
    }

    var typeNote = win.add("statictext", undefined, "", { multiline: true });
    typeNote.preferredSize = [480, 32];

    var pCut = win.add("panel", undefined, "CutContour (vinyl cut line)");
    pCut.orientation = "column"; pCut.alignChildren = ["left", "top"]; pCut.margins = 14; pCut.spacing = 6;
    var chkCut = pCut.add("checkbox", undefined, "Create the CutContour (spot color, 1 pt, stroke only)");

    var pBox = win.add("panel", undefined, "BoundingBox");
    pBox.orientation = "column"; pBox.alignChildren = ["left", "top"]; pBox.margins = 14; pBox.spacing = 6;
    var chkBox = pBox.add("checkbox", undefined, "Create the BoundingBox layer");
    var rbBoxNone = pBox.add("radiobutton", undefined, "No fill, no stroke");
    var rbBoxK = pBox.add("radiobutton", undefined, "100% K stroke, 1 pt (banners, lightboxes)");
    rbBoxNone.value = true;

    var pOut = win.add("panel", undefined, "Outline (rigid materials: ACM, aluminum, acrylic)");
    pOut.orientation = "column"; pOut.alignChildren = ["left", "top"]; pOut.margins = 14; pOut.spacing = 6;
    var chkOut = pOut.add("checkbox", undefined, "Create the Outline (100% K, 1 pt, no fill)");
    var outRow = pOut.add("group");
    outRow.add("statictext", undefined, "Outline distance from the art edge:");
    var txtOutOff = outRow.add("edittext", undefined, "0");
    txtOutOff.characters = 6;
    outRow.add("statictext", undefined, "in");
    var SEP = !(pre && pre.noSeparate);
    var chkFile, chkRemove, btnFolder, txtFolder, chkPdf, ddPreset, docFolder = "";
    if (SEP) {
    chkFile = pOut.add("checkbox", undefined, "Also save the separate production file (Outline + Holes layers only)");
    var chkRemove = pOut.add("checkbox", undefined, "Remove the Outline from this file after saving the production file");
    chkRemove.value = true;
    var folderRow = pOut.add("group");
    var btnFolder = folderRow.add("button", undefined, "Browse...");
    var docFolder = "";
    try { docFolder = doc.path.fsName; } catch (eDp) {}
    var txtFolder = folderRow.add("edittext", undefined, docFolder);
    txtFolder.characters = 34;
    var pdfRow = pOut.add("group");
    var chkPdf = pdfRow.add("checkbox", undefined, "Also save as PDF");
    pdfRow.add("statictext", undefined, "Preset:");
    var ddPreset = pdfRow.add("dropdownlist", undefined, presets);
    var lastPreset = getPref("pdfpreset", "");
    var pIdx = 0;
    for (var pi2 = 0; pi2 < presets.length; pi2++) if (presets[pi2] === lastPreset) pIdx = pi2;
    ddPreset.selection = pIdx;
    chkPdf.value = true;
    btnFolder.onClick = function () {
        var f = Folder.selectDialog("Choose the production file folder", new Folder(txtFolder.text));
        if (f) txtFolder.text = f.fsName;
    };

    } else {
        // The production file made by Production Helper already is the production file:
        // no separate file option here.
        chkFile = { value: false, enabled: false };
        chkRemove = { value: false, enabled: false };
        btnFolder = { enabled: false };
        txtFolder = { text: "", enabled: false };
        chkPdf = { value: false, enabled: false };
        ddPreset = { selection: null, enabled: false };
    }

    var pSel = win.add("panel", undefined, "Using your selection exactly");
    pSel.orientation = "column"; pSel.alignChildren = ["left", "top"]; pSel.margins = 14; pSel.spacing = 6;
    var chkAsIs = pSel.add("checkbox", undefined, "Use my selected shapes as they are for CutContour, Outline and BoundingBox");
    var chkAsIsKeep = pSel.add("checkbox", undefined, "Keep the original art (untick to remove it)");
    chkAsIsKeep.value = true;
    chkAsIs.value = false;

    var pWhite = win.add("panel", undefined, "White Ink (from your selection)");
    pWhite.orientation = "column"; pWhite.alignChildren = ["left", "top"]; pWhite.margins = 14; pWhite.spacing = 6;
    var chkWhite = pWhite.add("checkbox", undefined, "Create the White Ink (spot color \"White Ink\" 100%, fill only)");
    var chkWhiteKeep = pWhite.add("checkbox", undefined, "Keep the original art (untick to replace it with the White Ink)");
    chkWhiteKeep.value = false;
    chkWhite.value = false;

    var preArt = gatherArt();
    var selOk = preArt.usedSelection && preArt.items.length > 0;

    var hint = win.add("statictext", undefined,
        "Uses the selected art. With nothing selected, it uses everything on the active artboard. " +
        "The open file is saved first when a production file is made.", { multiline: true });
    hint.preferredSize = [480, 44];

    function sync() {
        rbBoxNone.enabled = chkBox.value;
        rbBoxK.enabled = chkBox.value;
        txtOutOff.enabled = chkOut.value && !chkAsIs.value;
        chkAsIsKeep.enabled = chkAsIs.value;
        chkWhiteKeep.enabled = chkWhite.value;
        chkFile.enabled = chkOut.value;
        var fOn = chkOut.value && chkFile.value;
        btnFolder.enabled = fOn;
        txtFolder.enabled = fOn;
        chkRemove.enabled = fOn;
        chkPdf.enabled = fOn;
        ddPreset.enabled = fOn && chkPdf.value;
    }
    function applyType() {
        var t = mkType(ddType.selection.index);
        MK_TYPE = t;
        chkCut.value = phTypeHasCut(t);
        chkBox.value = phTypeHasLayer(t, "boundingbox");
        rbBoxK.value = false;
        rbBoxNone.value = true;
        chkOut.value = phTypeHasLayer(t, "outline");
        chkFile.value = false;
        var names = [];
        for (var q = 0; q < t.layers.length; q++) names.push(t.layers[q].name);
        typeNote.text = "Layers of this sign type: " + names.join(", ") + "." +
                        (MK_CLIENT && MK_CLIENT.signTypes[t.label] ? " (Client: " + MK_CLIENT.label + ")" : "");
        sync();
    }
    ddType.onChange = applyType;
    chkCut.onClick = sync; chkBox.onClick = sync; chkOut.onClick = sync; chkFile.onClick = sync; chkPdf.onClick = sync; chkRemove.onClick = sync;
    applyType();
    if (pre && pre.want) {
        chkCut.value = (pre.want === "cut");
        chkBox.value = (pre.want === "bbox");
        chkOut.value = (pre.want === "outline");
        sync();
    }

    var txtReason = win.add("statictext", undefined, "");
    txtReason.alignment = ["fill", "top"];
    txtReason.preferredSize.width = 480;

    var bg = win.add("group");
    bg.alignment = ["right", "top"];
    bg.spacing = 10;
    var go = false;
    var btnGo = bg.add("button", undefined, "Create", { name: "ok" });
    btnGo.preferredSize.width = 120;
    var btnCancel = bg.add("button", undefined, "Close", { name: "cancel" });
    btnCancel.preferredSize.width = 90;
    btnGo.onClick = function () { go = true; win.close(); };
    btnCancel.onClick = function () { win.close(); };

    // Create stays grey until something is ticked; the line above says why.
    function refreshGo() {
        var any = chkCut.value || chkBox.value || chkOut.value || chkWhite.value;
        var needSel = chkWhite.value || (chkAsIs.value && (chkCut.value || chkBox.value || chkOut.value));
        var ok = any && !(needSel && !selOk);
        btnGo.enabled = ok;
        txtReason.text = !any ? "Tick at least one thing to create." :
            ((needSel && !selOk) ? "Select the art first (not on a production layer), then open this window again." : "");
    }
    function syncAll() { sync(); refreshGo(); }
    chkCut.onClick = syncAll; chkBox.onClick = syncAll; chkOut.onClick = syncAll;
    chkFile.onClick = syncAll; chkPdf.onClick = syncAll; chkRemove.onClick = syncAll;
    chkAsIs.onClick = syncAll; chkWhite.onClick = syncAll;
    ddType.onChange = function () { applyType(); refreshGo(); };
    refreshGo();

    // ---------- tooltips ----------
    ddType.helpTip = "The sign type decides which options are ticked for you. You can still change them.";
    chkCut.helpTip = "Draws a CutContour path around the art on its own layer, using the CutContour spot color.";
    chkBox.helpTip = "Creates a BoundingBox layer with a rectangle around the art.";
    rbBoxNone.helpTip = "The BoundingBox has no fill and no stroke.";
    rbBoxK.helpTip = "The BoundingBox has a 100% K stroke, 1 pt.";
    chkAsIs.helpTip = "Copies your selected shapes onto the layers exactly as drawn. Nothing is traced and the distance boxes are not used. Rounded shapes stay rounded, square shapes stay square.";
    chkAsIsKeep.helpTip = "Leave this ticked to keep your original art. Untick it and the original is removed once the copies are made.";
    chkWhite.helpTip = "Copies your selected shapes onto a White Ink layer, filled with the White Ink spot color at 100%, no stroke. Text is outlined on the copy.";
    chkWhiteKeep.helpTip = "Untick it (the default) and the original art is removed once the White Ink is made. Ctrl+Z brings it back.";
    chkOut.helpTip = "Creates the Outline layer: a 100% K, 1 pt path with no fill, used as the cut path for rigid materials.";
    txtOutOff.helpTip = "How far the Outline sits outside the art edge, in inches. 0 = right at the edge.";
    chkFile.helpTip = "Saves a separate file that has only the Outline and Holes layers.";
    chkRemove.helpTip = "Takes the Outline off this file after the production file is saved.";
    btnFolder.helpTip = "Choose where the production file is saved.";
    txtFolder.helpTip = "Folder where the production file is saved.";
    chkPdf.helpTip = "Also saves a PDF of the production file.";
    ddPreset.helpTip = "The PDF preset used for that PDF.";
    btnGo.helpTip = "Creates what is ticked above.";
    btnCancel.helpTip = "Closes this window without creating anything.";

    if (DIRECT) {
        // Maker: tick only what was asked for, then run without showing this window
        chkCut.value = (pre.want === "cut"); chkBox.value = (pre.want === "bbox");
        chkOut.value = (pre.want === "outline"); chkWhite.value = (pre.want === "white");
        chkAsIs.value = false; chkFile.value = false;
        var boxStroke = mkStroke("bbox", 0);
        rbBoxK.value = (boxStroke > 0); rbBoxNone.value = !(boxStroke > 0);
        txtOutOff.text = "0";
        syncAll();
        if (!btnGo.enabled) { spAlert(txtReason.text, "Production Maker"); return ""; }
        go = true;
    } else {
        paintStyle(win);
        styleGreenButton(btnGo, BTN_CREATE);
        win.location = uik().pos();
        win.show();
    }
    if (!go) return;

    // ============================================================
    //  RUN
    // ============================================================
    var doCut = chkCut.value, doBox = chkBox.value, doOut = chkOut.value, doFile = chkOut.value && chkFile.value;
    var doWhite = chkWhite.value, asIs = chkAsIs.value;
    if (!doCut && !doBox && !doOut && !doWhite) { spAlert("Nothing was created because nothing was ticked. Tick at least one option and try again."); return; }
    setPref("signtype", SIGN_TYPES[ddType.selection.index].label);
    if (ddPreset.selection) setPref("pdfpreset", ddPreset.selection.text);

    var lines = [];
    var problems = [];
    var made = [];
    var art = gatherArt();
    REPLACE_BOXES = null;
    if (art.usedSelection) {
        REPLACE_BOXES = [];
        for (var rbi = 0; rbi < art.items.length; rbi++) { try { REPLACE_BOXES.push(art.items[rbi].visibleBounds); } catch (eRb) {} }
        if (REPLACE_BOXES.length === 0) REPLACE_BOXES = null;
    }
    var needArt = doCut || doOut || doWhite || (asIs && doBox);
    if (needArt && art.items.length === 0) {
        spAlert("There is no art to work from.\n\nSelect the art first, or make sure it is on the active artboard (not on a production layer).");
        return;
    }
    lines.push("Worked on " + (art.usedSelection ? art.items.length + " selected item(s)" : "everything on the active artboard (" + art.items.length + " item(s))") + ".");
    if (art.skipped > 0) lines.push(art.skipped + " selected item(s) on production layers were ignored.");

    try {
        if (doCut) {
            try {
                STROKE_REAL_PT = mkStroke("cut", 1);
                var cutOff = 0;
                var cutCol = getCutSpotColor();
                var cc = asIs ? copyAsIs(art.items, CUT_LAYER, isCutLayerName, TAG_PREFIX + "CutContour", function (g) { return styleStroke(g, cutCol, TAG_PREFIX + "CutContour"); }, true)
                              : makeShapeLayer(art.items, CUT_LAYER, isCutLayerName, cutCol, TAG_PREFIX + "CutContour", cutOff, true);
                lines.push("CutContour: " + cc.n + " path(s) on layer \"" + cc.layer + "\", " + (asIs ? "copied from your selection as drawn" : "at the art edge") + "." +
                           (cc.removed > 0 ? " Replaced " + cc.removed + " from the last run." : ""));
                if (!asIs && CUT_ERRORS.length > 0) problems.push("CutContour: Illustrator gave an error: " + CUT_ERRORS.join("; "));
                if (asIs) lines.push("CutContour: As-is is ON, so the art was copied untouched (no outline).");
                if (cc.n > 0) made.push("cut");
                if (cc.open > 0) problems.push("CutContour has " + cc.open + " open path(s). Preflight will flag them.");
            } catch (eCut) { problems.push("The CutContour could not be created: " + eCut); }
        }
        if (doBox) {
            if (mkStroke("bbox", 0) > 0) STROKE_REAL_PT = mkStroke("bbox", 0); else STROKE_REAL_PT = 1;
            try {
                if (asIs) {
                    var boxK = rbBoxK.value;
                    var bx = copyAsIs(art.items, BOX_LAYER, isBBoxLayerName, TAG_PREFIX + "BoundingBox", function (g) {
                        var cnt = { n: 0, open: 0 };
                        walkPaths(g, function (p) {
                            p.filled = false;
                            if (boxK) { p.stroked = true; p.strokeColor = black(); p.strokeWidth = STROKE_REAL_PT / sf; sharpLine(p); }
                            else p.stroked = false;
                            try { p.name = TAG_PREFIX + "BoundingBox"; } catch (eN2) {}
                            cnt.n++;
                        });
                        return cnt;
                    }, true);
                    lines.push("BoundingBox: " + bx.n + " path(s) copied from your selection as drawn, " + (boxK ? "100% K stroke" : "no fill, no stroke") + "." +
                               (bx.removed > 0 ? " Replaced " + bx.removed + " from the last run." : ""));
                    if (bx.n > 0) made.push("bbox");
                } else {
                    var bb = makeBoundingBox(art.items, art.usedSelection, rbBoxK.value);
                    lines.push("BoundingBox: " + (Math.round(bb.w * 100) / 100) + " x " + (Math.round(bb.h * 100) / 100) + " in, " + (rbBoxK.value ? "100% K stroke" : "no fill, no stroke") + "." +
                               (bb.removed > 0 ? " Replaced " + bb.removed + " from the last run." : ""));
                    made.push("bbox");
                }
            } catch (eBox) { problems.push("The BoundingBox could not be created: " + eBox); }
        }
        if (doOut) {
            try {
                STROKE_REAL_PT = mkStroke("out", 1);
                var outOff = asIs ? 0 : parseNum(txtOutOff.text, 0);
                var oo = asIs ? copyAsIs(art.items, OUT_LAYER, isOutlineLayerName, TAG_PREFIX + "Outline", function (g) { return styleStroke(g, black(), TAG_PREFIX + "Outline"); }, true)
                              : makeShapeLayer(art.items, OUT_LAYER, isOutlineLayerName, black(), TAG_PREFIX + "Outline", outOff);
                lines.push("Outline: " + oo.n + " path(s) on layer \"" + oo.layer + "\", " + (asIs ? "copied from your selection as drawn" : (outOff > 0 ? outOff + " in from the art" : "at the art edge")) + "." +
                           (oo.removed > 0 ? " Replaced " + oo.removed + " from the last run." : ""));
                if (oo.n > 0) made.push("outline");
                if (oo.open > 0) problems.push("Outline has " + oo.open + " open path(s). Preflight will flag them.");
            } catch (eOut) { problems.push("The Outline could not be created: " + eOut); doFile = false; }
        }
        if (doWhite) {
            try {
                var wCol = getWhiteSpotColor();
                var ww = copyAsIs(art.items, WHITE_LAYER, isWhiteInkLayerName, TAG_PREFIX + "White Ink", function (g) {
                    var cnt = { n: 0, open: 0 };
                    walkPaths(g, function (p) {
                        p.filled = true;
                        p.fillColor = wCol;
                        p.stroked = false;
                        try { p.opacity = 100; } catch (eOp) {}
                        try { p.name = TAG_PREFIX + "White Ink"; } catch (eN3) {}
                        cnt.n++;
                    });
                    return cnt;
                }, false);
                lines.push("White Ink: " + ww.n + " shape(s) on layer \"" + ww.layer + "\", filled with the White Ink spot color." +
                           (ww.removed > 0 ? " Replaced " + ww.removed + " from the last run." : ""));
                if (ww.skipped > 0) problems.push(ww.skipped + " item(s) could not get White Ink (images, symbols or similar). Make a shape for them and run it again.");
                if (ww.n > 0) made.push("white");
            } catch (eWhite) { problems.push("The White Ink could not be created: " + eWhite); doWhite = false; }
        }
        // original art: removed only at the very end, after every copy has been made
        var dropOrig = (doWhite && !chkWhiteKeep.value) || (asIs && (doCut || doBox || doOut) && !chkAsIsKeep.value);
        if (dropOrig && art.usedSelection) {
            var gone = 0;
            for (var ro = 0; ro < art.items.length; ro++) {
                try { art.items[ro].remove(); gone++; } catch (eRo) {}
            }
            lines.push("Original art removed (" + gone + " item(s)). Ctrl+Z brings it back.");
        }
        if (doFile) {
            try {
                var saved = saveCutFile(txtFolder.text, chkPdf.value, ddPreset.selection ? ddPreset.selection.text : "");
                lines.push("Production file saved: " + saved);
                if (chkRemove.value) {
                    try {
                        var removedN = removeMadeOutline();
                        lines.push("Outline removed from this file (" + removedN + " item(s)). Press Ctrl+S to save the file without it.");
                    } catch (eRmv) { problems.push("The Outline could not be removed from this file: " + eRmv); }
                }
            } catch (eFile) { problems.push("The production file could not be saved: " + eFile); }
        }
    } catch (eAll) {
        problems.push("Something went wrong and the work stopped here: " + eAll + (eAll.line ? " (line " + eAll.line + ")" : "") + ". Check the layers, then try again.");
    }
    try { app.redraw(); } catch (eRd) {}

    var msg = lines.join("\n");
    if (problems.length > 0) msg += "\n\nProblems:\n- " + problems.join("\n- ");
    else msg += "\n\nRun Preflight Check to confirm. Ctrl+Z undoes the changes in the file.";
    if (!DIRECT || problems.length > 0) spAlert(msg, SCRIPT_NAME + (problems.length > 0 ? " - check this" : ""));
    return made.join(",");
    }

    // ---------- checklist text for a sign type ----------
    // returns [{ title, hint }]
    function stepsFor(t) {
        var s = [];
        var names = [];
        for (var q = 0; q < t.layers.length; q++) names.push(t.layers[q].name);
        s.push({ title: "Create the layers", make: "layers", hint: "Layers: " + names.join(", ") + ". Press Create to add the ones that are missing, with the right colour." });
        for (var i = 0; i < t.layers.length; i++) {
            var ly = t.layers[i], key = phNorm(ly.name);
            var rule = "";
            if (ly.stroke || ly.element) {
                rule = "Stroke " + (ly.stroke ? ly.stroke + " pt" : "any") + ", " +
                       (ly.element === "black" ? "100% black (C0 M0 Y0 K100)" : (ly.element === "magenta" ? "100% magenta / CutContour spot" : "any colour")) + ".";
            } else {
                rule = "Free layer: the art keeps its own colours.";
            }
            var title = "Layer " + ly.name + " (" + ly.color + ")";
            var step = { title: title, hint: rule };
            if (key === "cutcontour") { step.make = "cut"; step.hint += " Press Make... to build it from the art."; }
            else if (key === "boundingbox") { step.make = "bbox"; step.hint += " Press Make... to build it from the art."; }
            else if (key === "outline") { step.make = "outline"; step.hint += " Press Make... to build it from the art."; }
            s.push(step);
        }
        s.push({ title: "Text outlined / fonts checked", hint: "No missing fonts or live text left by mistake." });
        s.push({ title: "Run Preflight Check", launch: "preflight", hint: "Fix everything marked wrong, then check the yellow ones." });
        return s;
    }

    // ---------- helpers ----------
    function getPref(key, def) {
        try { return app.preferences.getStringPreference("signpack/prodhelper/" + key) || def; } catch (e) { return def; }
    }
    function setPref(key, val) {
        try { app.preferences.setStringPreference("signpack/prodhelper/" + key, String(val)); } catch (e) {}
    }
    function normName(n) { return ("" + n).toLowerCase().replace(/[\s_\-]/g, ""); }
    function shouldRemoveByDefault(name) {
        var n = normName(name);
        for (var i = 0; i < REMOVE_KEYS.length; i++) if (n.indexOf(REMOVE_KEYS[i]) >= 0) return true;
        return false;
    }
    function layerNamed(d, name) {
        for (var i = 0; i < d.layers.length; i++) if (normName(d.layers[i].name) === normName(name)) return d.layers[i];
        return null;
    }
    function openUrl(url) {
        // Illustrator has no system.callSystem: Windows opens a temporary .url shortcut, Mac uses app.system.
        var done = false;
        try {
            if ($.os.indexOf("Windows") !== -1) {
                var sc = new File(Folder.temp.fsName + "/thesignpack_link.url");
                sc.encoding = "UTF-8";
                if (sc.open("w")) {
                    sc.write("[InternetShortcut]\r\nURL=" + url + "\r\n");
                    sc.close();
                    done = sc.execute();
                }
            } else {
                app.system('open "' + url + '"');
                done = true;
            }
        } catch (eOu) { done = false; }
        if (!done) {
            try { spAlert("Could not open the browser from here.\n\nOpen this address yourself:\n" + url, SCRIPT_NAME); } catch (eOu2) {}
        }
    }
    function firstDigits(name) {
        var m = decodeURI(name).match(/^(\d{4,})/);
        return m ? m[1] : "";
    }
    function findProjectNumber(f) {
        var p = firstDigits(f.name);
        if (p) return p;
        var cur = f.parent;
        for (var i = 0; i < 15 && cur; i++) {
            p = firstDigits(cur.name);
            if (p) return p;
            cur = cur.parent;
        }
        return "";
    }
    // Copies a file; returns null when it worked, or a text reason. Falls back to a byte copy.
    function copyFile(src, dst) {
        if (src.copy(dst)) return null;
        var why = "File.copy failed";
        try {
            src.encoding = "BINARY"; dst.encoding = "BINARY";
            if (!src.open("r")) return "Could not read the original (" + src.error + "). If it is on iCloud or OneDrive, make sure it is downloaded to this computer.";
            var data = src.read();
            src.close();
            if (!dst.open("w")) return "Could not write the new file (" + dst.error + ").";
            dst.write(data);
            dst.close();
            if (dst.exists && dst.length > 0) return null;
            why = "The new file came out empty";
        } catch (e) { why = "" + e; }
        return why + ". If the original is on iCloud or OneDrive, make sure it is downloaded to this computer.";
    }
    function cmyk(c, m, y, k) { var x = new CMYKColor(); x.cyan = c; x.magenta = m; x.yellow = y; x.black = k; return x; }

    // ---------- close an older palette of this script ----------
    try { if ($.global.__PH_WIN) { $.global.__PH_WIN.close(); } } catch (eOld) {}
    $.global.__PH_WIN = null;

    // ---------- the document we start from ----------
    var srcDoc = null, srcFile = null, srcDirty = false;
    if (app.documents.length > 0) {
        try { srcDoc = app.activeDocument; } catch (eD) { srcDoc = null; }
    }
    var hasSrcFile = false;
    if (srcDoc) {
        try { srcFile = srcDoc.fullName; hasSrcFile = true; } catch (eF) { hasSrcFile = false; }
        try { srcDirty = !srcDoc.saved; } catch (eS) {}
    }

    // ============================================================
    //  MAKER: the small window that opens first. Each button builds one thing from the selected art
    //  (or everything on the active artboard) through the Make code in Illustrator's main engine.
    //  "Pro" opens the full Production Helper and is remembered.
    // ============================================================
    function showMaker() {
        try { if ($.global.__phMakerWin && $.global.__phMakerWin instanceof Window) $.global.__phMakerWin.close(); } catch (ePm) {}
        var mw = new Window("palette", "Production Maker");
        $.global.__phMakerWin = mw;
        paintWin(mw);   // dark grey first: the UI Kit picks the white logo on a dark window
        mw.orientation = "column";
        mw.alignChildren = ["fill", "top"];
        mw.margins = uik().MARGINS;
        mw.spacing = uik().SPACING;

        var mHead = mw.add("group");
        mHead.alignment = ["fill", "top"];
        mHead.alignChildren = ["left", "center"];
        mHead.spacing = 10;
        mHead.margins = 0;
        addMakerSmallHeader(mHead, mw);
        addAccentLine(mw);

        var mRows = mw.add("group");
        mRows.orientation = "column";
        mRows.alignChildren = ["left", "center"];
        mRows.spacing = 8;
        var mDefs = [
            { want: "cut", def: BTN_MK_CUT, key: "cut", def0: "1", tip: "CutContour (spot color, stroke only)" },
            { want: "bbox", def: BTN_MK_BOX, key: "bbox", def0: "0", tip: "BoundingBox. Stroke 0 = no stroke; above 0 = 100% K stroke" },
            { want: "outline", def: BTN_MK_OUT, key: "out", def0: "1", tip: "Outline (100% K, no fill)" },
            { want: "white", def: BTN_MK_WHITE, key: "", def0: "", tip: "White Ink (spot color, fill only). Needs selected art" }
        ];
        var mBtns = [], mEdits = {};
        var mStatus;
        for (var md = 0; md < mDefs.length; md++) {
            (function (d) {
                var row = mRows.add("group");
                row.alignChildren = ["left", "center"];
                row.spacing = 10;
                var b = row.add("button", undefined, d.def.key === "mkcut" ? "CutContour" : (d.def.key === "mkbox" ? "BoundingBox" : (d.def.key === "mkout" ? "Outline" : "White Ink")));
                b.preferredSize = [d.def.w, d.def.h];
                b.helpTip = d.tip + ". Works on the selected art, or on everything on the active artboard.";
                styleGreenButton(b, d.def);
                if (d.key !== "") {
                    row.add("statictext", undefined, "Stroke");
                    var ed = row.add("edittext", undefined, getPref("mk_" + d.key, d.def0));
                    ed.characters = 4;
                    ed.helpTip = "Stroke size in pt.";
                    row.add("statictext", undefined, "pt");
                    mEdits[d.key] = ed;
                    ed.onChange = function () { setPref("mk_" + d.key, ed.text); };
                }
                b.onClick = function () { makerRun(d); };
                mBtns.push(b);
            })(mDefs[md]);
        }
        mStatus = mw.add("statictext", undefined, "");
        mStatus.alignment = ["fill", "top"];
        mStatus.preferredSize.width = 300;
        mStatus.keepColor = true;
        try { mStatus.graphics.foregroundColor = mStatus.graphics.newPen(mStatus.graphics.PenType.SOLID_COLOR, [0.65, 0.65, 0.65, 1], 1); } catch (eSc) {}

        var mBusy = false;
        function makerRun(d) {
            if (mBusy) return;
            if (SELF_PATH === "") { spAlert("Production Helper cannot find its own script file. Please run it from File > Scripts.", "Production Maker"); return; }
            var sv = { cut: 1, bbox: 0, out: 1 };
            for (var k in mEdits) {
                var v = parseFloat(String(mEdits[k].text).replace(",", "."));
                if (isNaN(v) || v < 0 || (k !== "bbox" && v === 0) || v > 100) {
                    spAlert("The stroke must be a number in pt" + (k === "bbox" ? " (0 = no stroke)." : ", above 0.") + "\nCheck the " + (k === "cut" ? "CutContour" : (k === "bbox" ? "BoundingBox" : "Outline")) + " stroke.", "Production Maker");
                    return;
                }
                sv[k] = v;
                setPref("mk_" + k, mEdits[k].text);
            }
            var tLabel = "";
            var cLabel = getPref("client", "");
            mBusy = true;
            mStatus.text = "Working...";
            var bt = new BridgeTalk();
            bt.target = "illustrator";
            bt.body = spSendCode("$.global.__PH_JOB = {self:" + bt_lit2(SELF_PATH) + ",typeLabel:" + bt_lit2(tLabel) + ",clientLabel:" + bt_lit2(cLabel) + ",want:" + bt_lit2(d.want) +
                      ",noSeparate:true,direct:true,strokes:{cut:" + sv.cut + ",bbox:" + sv.bbox + ",out:" + sv.out + "}};$.global.__PH_RESULT = '';" +
                      "var __f = new File(" + bt_lit2(SELF_PATH) + ");__f.encoding = 'UTF-8';__f.open('r');var __s = __f.read();__f.close();" +
                      "__s = __s.replace(/^#.*$/mg, '');eval(__s);$.global.__PH_RESULT;");
            bt.onResult = function (r) {
                mBusy = false;
                var res = String(r.body);
                mStatus.text = (res === "" || res === "undefined") ? "Nothing was made." : "Done: " + res.replace(/,/g, ", ").replace("bbox", "BoundingBox").replace("cut", "CutContour").replace("outline", "Outline").replace("white", "White Ink") + ".";
            };
            bt.onError = function (er) {
                mBusy = false;
                mStatus.text = "";
                spAlert("It could not run.\n\nDetails: " + (er && er.body ? er.body : er), "Production Maker");
            };
            bt.send();
        }

        var mBottom = mw.add("group");
        mBottom.alignment = ["fill", "top"];
        mBottom.alignChildren = ["left", "center"];
        var btnPro = mBottom.add("button", undefined, "Helper");
        btnPro.helpTip = "Goes back to the Production Helper (new file, layers, checklist and notes). The script opens in the Helper next time.";
        var mBsp = mBottom.add("group");
        mBsp.alignment = ["fill", "center"];
        var btnMClose = mBottom.add("button", undefined, "Close");
        btnMClose.preferredSize = [56, 24];
        btnMClose.helpTip = "Closes this window.";
        btnMClose.onClick = function () { mw.close(); };
        btnPro.onClick = function () {
            setPref("promode", "0");
            mw.close();
            launchScript(new File(SELF_PATH), "signpack_prodhelper");
        };

        paintStyle(mw);
        mw.location = uik().pos();
        mw.show();
    }
    function bt_lit2(str) {
        return '"' + String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"';
    }

    // The Helper is the default; "Pro version" (remembered) opens the small Production Maker window
    if (getPref("promode", "0") === "1") {
        showMaker();
        TSP_RESULT = "SUCCESS: " + TSP_NAME + ": Maker opened.";
        return;
    }

    if (srcDoc && !hasSrcFile) {
        spAlert("This file has not been saved yet. Save it first, or close it to start from a blank file.");
        TSP_RESULT = "ERROR: " + TSP_NAME + ": save the file first.";
        return;
    }

    // ============================================================
    //  Setup dialog
    // ============================================================
    var dlg = new Window("dialog", SCRIPT_NAME);
    paintWin(dlg);   // dark grey first: the UI Kit picks the white logo on a dark window
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 16;
    dlg.spacing = 10;

    var headRow2 = dlg.add("group");
    headRow2.alignment = ["fill", "top"];
    headRow2.alignChildren = ["left", "center"];
    headRow2.spacing = 10;
    headRow2.margins = 0;
    addHeaderLogo(headRow2, dlg);
    var logoSpacer = headRow2.add("group");
    logoSpacer.alignment = ["fill", "center"];
    addHeaderTitle(headRow2, "Production Helper");
    addAccentLine(dlg);
    addSignTypesTag(dlg, SIGN_TYPES_VERSION);

    var typeRow = dlg.add("group");
    typeRow.add("statictext", undefined, "Sign type:").preferredSize.width = 70;
    var labels = [];
    for (var ti = 0; ti < SIGN_TYPES.length; ti++) labels.push(SIGN_TYPES[ti].label);
    var ddType = typeRow.add("dropdownlist", undefined, labels);
    ddType.preferredSize.width = 300;
    var savedType = getPref("signtype", "");
    if (savedType === "") { try { savedType = app.preferences.getStringPreference("signpack/preflight/signtype") || ""; } catch (eP) {} }
    if (savedType === "") savedType = DEFAULT_TYPE;
    var typeIdx = 0;
    for (var tj = 0; tj < SIGN_TYPES.length; tj++) if (SIGN_TYPES[tj].label === savedType) typeIdx = tj;
    ddType.selection = typeIdx;

    var clientRow = dlg.add("group");
    clientRow.add("statictext", undefined, "Client:").preferredSize.width = 70;
    var clientLabels = [];
    for (var ci = 0; ci < CLIENTS.length; ci++) clientLabels.push(CLIENTS[ci].label);
    var ddClient = clientRow.add("dropdownlist", undefined, clientLabels);
    ddClient.preferredSize.width = 300;
    var savedClient = getPref("client", "");
    var clientIdx = 0;
    for (var cj = 0; cj < CLIENTS.length; cj++) if (CLIENTS[cj].label === savedClient) clientIdx = cj;
    ddClient.selection = clientIdx;

    var projRow = dlg.add("group");
    projRow.add("statictext", undefined, "Project number:");
    var txtProj = projRow.add("edittext", undefined, hasSrcFile ? findProjectNumber(srcFile) : "");
    txtProj.characters = 12;

    var srcTxt = dlg.add("statictext", undefined, "", { multiline: true });
    srcTxt.preferredSize = [460, 34];
    var lb = null, sizeRow = null, txtW = null, txtH = null, chkSave = null;

    if (hasSrcFile) {
        srcTxt.text = "A copy of \"" + decodeURI(srcFile.name) + "\" is made in the same folder. The original is not changed.";
        dlg.add("statictext", undefined, "Layers to REMOVE from the copy (click to select, Ctrl/Shift for several):");
        var names = [];
        for (var li = 0; li < srcDoc.layers.length; li++) names.push(srcDoc.layers[li].name);
        lb = dlg.add("listbox", undefined, names, { multiselect: true });
        lb.preferredSize = [460, Math.min(220, 24 + names.length * 20)];
        var sel = [];
        for (var ni = 0; ni < names.length; ni++) if (shouldRemoveByDefault(names[ni])) sel.push(ni);
        if (sel.length > 0) lb.selection = sel;
        if (srcDirty) {
            chkSave = dlg.add("checkbox", undefined, "Save the open file first (it has unsaved changes)");
            chkSave.value = true;
        }
    } else {
        srcTxt.text = "No saved file is open, so a blank file is made. You will choose where to save it.";
        sizeRow = dlg.add("group");
        sizeRow.add("statictext", undefined, "Artboard size (in):  width");
        txtW = sizeRow.add("edittext", undefined, String(STD_WIDTH_IN));
        txtW.characters = 6;
        sizeRow.add("statictext", undefined, "height");
        txtH = sizeRow.add("edittext", undefined, String(STD_HEIGHT_IN));
        txtH.characters = 6;
    }

    var txtReason = dlg.add("statictext", undefined, "");
    txtReason.alignment = ["fill", "top"];
    txtReason.preferredSize.width = 460;

    var bg = dlg.add("group");
    bg.alignment = ["right", "top"];
    bg.spacing = 10;
    var go = false, skip = false;
    var btnGo = bg.add("button", undefined, "Create Production File", { name: "ok" });
    btnGo.preferredSize.width = 170;
    var btnSkip = bg.add("button", undefined, "Skip (no new file)");
    btnSkip.preferredSize.width = 130;
    var btnToMaker = bg.add("button", undefined, "Pro version");
    btnToMaker.preferredSize.width = 90;
    btnToMaker.helpTip = "For when you know what you are doing and do not need the notes: opens the small Production Maker window. The script opens in Pro next time until you press Helper there.";
    var switchMaker = false;
    btnToMaker.onClick = function () { switchMaker = true; dlg.close(); };
    var btnCancel = bg.add("button", undefined, "Close", { name: "cancel" });
    btnCancel.preferredSize.width = 80;
    btnGo.onClick = function () { go = true; dlg.close(); };

    // Create Production File stays grey until a project number is typed.
    function refreshGo() {
        var has = (txtProj.text.replace(/\s+/g, "") !== "");
        btnGo.enabled = has;
        txtReason.text = has ? "" : "Type the project number to create the file (or use Skip).";
    }
    txtProj.onChanging = refreshGo;
    txtProj.onChange = refreshGo;
    refreshGo();

    // ---------- tooltips ----------
    ddType.helpTip = "The sign type decides which production layers are added to the new file.";
    ddClient.helpTip = "A client profile can change the rules for some sign types. Leave it on The Sign Pack unless the job is for a client with its own rules.";
    txtProj.helpTip = "Used to name the new file: <project number>_Production File_v1.ai";
    if (lb) lb.helpTip = "Layers picked here are deleted from the COPY only. The original file is not changed.";
    if (chkSave) chkSave.helpTip = "Saves your open file before the copy is made, so the copy includes your latest changes.";
    if (txtW) txtW.helpTip = "Width of the new blank file, in inches.";
    if (txtH) txtH.helpTip = "Height of the new blank file, in inches.";
    btnGo.helpTip = "Makes the production file and goes to the checklist.";
    btnSkip.helpTip = "Goes to the checklist using the open file. No new file is made.";
    btnCancel.helpTip = "Closes without doing anything.";
    btnSkip.onClick = function () { skip = true; dlg.close(); };
    btnCancel.onClick = function () { dlg.close(); };
    paintStyle(dlg);
    styleGreenButton(btnGo, BTN_CREATEPF);
    dlg.location = [90, 140];
    dlg.show();
    if (switchMaker) {
        setPref("promode", "1");
        launchScript(new File(SELF_PATH), "signpack_prodhelper");
        TSP_RESULT = "SUCCESS: " + TSP_NAME + ": switched to Pro.";
        return;
    }
    if (!go && !skip) { TSP_RESULT = "WARNING: " + TSP_NAME + ": cancelled."; return; }

    var client = CLIENTS[ddClient.selection ? ddClient.selection.index : 0];
    var type = applyClientToType(SIGN_TYPES[ddType.selection.index], client);
    setPref("signtype", type.label);
    setPref("client", client.label);
    var report = [], warnings = [], fileName = "", newDoc = null;
    var prevInteraction = app.userInteractionLevel;
    if (!skip) {
    var proj = txtProj.text.replace(/\s+/g, "");
    if (proj === "") { spAlert("Please type the project number first. It is used to name the new file."); TSP_RESULT = "ERROR: " + TSP_NAME + ": type the project number first."; return; }

    // layers to remove (by index, same order in the copy)
    var removeIdx = [];
    if (lb && lb.selection) {
        var rs = (lb.selection instanceof Array) ? lb.selection : [lb.selection];
        for (var r = 0; r < rs.length; r++) removeIdx.push(rs[r].index);
    }

    // ============================================================
    //  Make the file
    // ============================================================
    try {
        app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
        var fileName = "";
        if (hasSrcFile) {
            if (chkSave && chkSave.value) srcDoc.save();
            var dest = srcFile.parent;
            var v = START_VERSION, outFile;
            do {
                fileName = proj + "_Production File_v" + v + ".ai";
                outFile = new File(dest.fsName + "/" + fileName);
                v++;
            } while (outFile.exists && v < 500);
            var why = copyFile(srcFile, outFile);
            if (why) throw new Error(why);
            newDoc = app.open(outFile);
            report.push("Copy of the original saved as " + fileName);
        } else {
            var wIn = parseFloat(String(txtW.text).replace(",", ".")), hIn = parseFloat(String(txtH.text).replace(",", "."));
            if (isNaN(wIn) || isNaN(hIn) || wIn <= 0 || hIn <= 0 || wIn > 200 || hIn > 200) throw new Error("The artboard size is not valid (use inches, up to 200).");
            var folder = Folder.selectDialog("Where should the production file be saved?");
            if (!folder) { app.userInteractionLevel = prevInteraction; TSP_RESULT = "WARNING: " + TSP_NAME + ": cancelled."; return; }
            var v2 = START_VERSION, outFile2;
            do {
                fileName = proj + "_Production File_v" + v2 + ".ai";
                outFile2 = new File(folder.fsName + "/" + fileName);
                v2++;
            } while (outFile2.exists && v2 < 500);
            newDoc = app.documents.add(DocumentColorSpace.CMYK, wIn * 72, hIn * 72);
            newDoc.saveAs(outFile2, new IllustratorSaveOptions());
            report.push("Blank file " + wIn + " x " + hIn + " in saved as " + fileName);
        }
        newDoc.activate();

        // temp layer so the last real layer can be removed
        var temp = newDoc.layers.add();
        temp.name = "PH_TEMP";
        var removed = 0, failed = 0;
        for (var ri = removeIdx.length - 1; ri >= 0; ri--) {
            var idx = removeIdx[ri] + 1;                       // +1: the temp layer is on top
            try {
                var ly = newDoc.layers[idx];
                ly.locked = false;
                ly.visible = true;
                ly.remove();
                removed++;
            } catch (eRm) { failed++; }
        }
        if (removeIdx.length > 0) report.push("Removed " + removed + " layer(s) from the copy.");
        if (failed > 0) warnings.push(failed + " layer(s) could not be removed.");

        // layers of this sign type (from the layer spec): added empty, with the spec colour
        var added = phEnsureLayers(newDoc, type);
        if (added.length > 0) report.push("Layers added: " + added.join(", ") + ".");

        // layers that are not in the spec go away, with everything on them ("design" layers stay)
        var extras = phRemoveExtras(newDoc, type, "PH_TEMP");
        if (extras.length > 0) report.push("Extra layers deleted from the copy: " + extras.reverse().join(", ") + ".");

        // CutContour swatch (spot, 100% M) when the sign type has a CutContour layer
        if (phTypeHasCut(type)) {
            if (phEnsureCutSpot(newDoc)) report.push("Swatch added: CutContour (spot, 100% M).");
        }

        // the temp layer: remove it, or keep it as the design layer if nothing else is left
        if (newDoc.layers.length > 1) {
            try { temp.remove(); } catch (eT) { warnings.push("Could not remove the temporary layer PH_TEMP."); }
        } else {
            temp.name = "Design";
        }
        newDoc.save();
    } catch (eMake) {
        app.userInteractionLevel = prevInteraction;
        spAlert("The production file could not be made. Nothing else was changed.\n\nDetails: " + eMake + (eMake.line ? " (line " + eMake.line + ")" : ""), SCRIPT_NAME);
        TSP_RESULT = "ERROR: " + TSP_NAME + ": the production file could not be made.";
        return;
    }
    app.userInteractionLevel = prevInteraction;
    }   // end of "if (!skip)"

    // ============================================================
    //  The checklist window (stays open; it never touches the document)
    // ============================================================
    var steps = stepsFor(type);
    var win = new Window("palette", SCRIPT_NAME);
    paintWin(win);   // dark grey first: the UI Kit picks the white logo on a dark window
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = uik().MARGINS;
    win.spacing = uik().SPACING;

    var titleRow = win.add("group");
    titleRow.alignment = ["fill", "top"];
    titleRow.alignChildren = ["left", "center"];
    titleRow.spacing = 10;
    titleRow.margins = 0;
    addSmallHeader(titleRow, win);
    addAccentLine(win);
    var title = win.add("statictext", undefined, type.label);
    try { title.graphics.font = ScriptUI.newFont("dialog", "BOLD", uik().TITLE_SIZE); } catch (eF2) {}
    addSignTypesTag(win, SIGN_TYPES_VERSION);
    win.add("statictext", undefined, "Client: " + client.label);
    var fileTxt = win.add("statictext", undefined, skip ? "(no new file made)" : fileName);
    var progTxt = win.add("statictext", undefined, "");

    var pnl = win.add("panel", undefined, "Checklist");
    pnl.orientation = "column";
    pnl.alignChildren = ["fill", "top"];
    pnl.margins = 12;
    pnl.spacing = 8;
    var boxes = [];
    function updateProgress() {
        var n = 0;
        for (var i = 0; i < boxes.length; i++) if (boxes[i].value) n++;
        progTxt.text = n + " of " + boxes.length + " done";
    }
    var boxByKey = {};
    function bt_lit(str) {
        return '"' + String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") + '"';
    }
    // Runs the Make window inside Illustrator's main engine (the document is only reachable there).
    var making = false;
    function runMake(want) {
        if (making) return;
        if (SELF_PATH === "") { spAlert("Production Helper cannot find its own script file. Please run it from File > Scripts.", SCRIPT_NAME); return; }
        making = true;
        var bt = new BridgeTalk();
        bt.target = "illustrator";
        bt.body = spSendCode("$.global.__PH_JOB = {self:" + bt_lit(SELF_PATH) + ",typeLabel:" + bt_lit(type.label) + ",clientLabel:" + bt_lit(client.label) + ",want:" + bt_lit(want || "") +
                  ",noSeparate:" + (skip ? "false" : "true") + "};$.global.__PH_RESULT = '';" +
                  "var __f = new File(" + bt_lit(SELF_PATH) + ");__f.encoding = 'UTF-8';__f.open('r');var __s = __f.read();__f.close();" +
                  "__s = __s.replace(/^#.*$/mg, '');eval(__s);$.global.__PH_RESULT;");
        bt.onResult = function (r) {
            making = false;
            var parts = String(r.body).split(",");
            for (var pi = 0; pi < parts.length; pi++) {
                if (boxByKey[parts[pi]]) boxByKey[parts[pi]].value = true;
            }
            updateProgress();
        };
        bt.onError = function (er) {
            making = false;
            spAlert("The Make window could not open.\n\nDetails: " + (er && er.body ? er.body : er), SCRIPT_NAME);
        };
        bt.send();
    }
    for (var si = 0; si < steps.length; si++) {
        var rowG = pnl.add("group");
        rowG.orientation = "row";
        rowG.alignChildren = ["left", "center"];
        rowG.alignment = ["fill", "top"];
        var cb = rowG.add("checkbox", undefined, steps[si].title);
        cb.preferredSize.width = 290;
        cb.onClick = updateProgress;
        cb.helpTip = "Tick it yourself when this step is done. Ticking does not run anything.";
        boxes.push(cb);
        if (steps[si].launch === "preflight") {
            var pb = rowG.add("button", undefined, "Open...");
            pb.preferredSize = [70, 22];
            pb.helpTip = "Opens Preflight Check for this sign type and client.";
            pb.onClick = function () {
                var f = findSibling(SELF_PATH, /^Preflight[ _]Check(?:[ _]*v?(\d+(?:\.\d+)*))?\.jsx$/i);
                if (!f) {
                    spAlert("Preflight Check was not found in the same folder as Production Helper.\nPut both scripts in the same folder and try again.", SCRIPT_NAME);
                    return;
                }
                try { app.preferences.setStringPreference("signpack/preflight/signtype", type.label); } catch (ePf) {}
                try { app.preferences.setStringPreference("signpack/preflight/client", client.label); } catch (ePc) {}
                launchScript(f, "signpack_preflight");
            };
        }
        if (steps[si].make) {
            boxByKey[steps[si].make] = cb;
            (function (key) {
                var mb = rowG.add("button", undefined, key === "layers" ? "Create" : "Make...");
                mb.preferredSize = [70, 22];
                mb.helpTip = key === "layers" ? "Adds the missing layers of this sign type to the open file." : "Opens the Make window for this step.";
                mb.onClick = function () { runMake(key); };
            })(steps[si].make);
        }
        var hint = pnl.add("statictext", undefined, steps[si].hint, { multiline: true });
        hint.preferredSize = [360, 16 * Math.max(1, Math.ceil(String(steps[si].hint).length * 6.6 / 340)) + 4];
        hint.margins = [20, 0, 0, 0];
    }
    updateProgress();

    var noteLines = [];
    var typeNotes = type.notes || [];
    for (var ni2 = 0; ni2 < typeNotes.length; ni2++) noteLines.push("- " + typeNotes[ni2]);
    if (noteLines.length > 0) {
        var pn = win.add("panel", undefined, "Notes from the specs sheet");
        pn.orientation = "column";
        pn.alignChildren = ["fill", "top"];
        pn.margins = 12;
        var nt = pn.add("statictext", undefined, noteLines.join("\n"), { multiline: true });
        var ntLines = 0;
        for (var nl = 0; nl < noteLines.length; nl++) ntLines += Math.max(1, Math.ceil(noteLines[nl].length * 6.6 / 340));
        nt.preferredSize = [360, 16 * ntLines + 6];
    }

    var summary = report.join("\n");
    if (warnings.length > 0) summary += "\nCheck: " + warnings.join(" ");
    var repTxt = win.add("statictext", undefined, summary, { multiline: true });
    var repLines = 0;
    for (var rl = 0; rl < report.length; rl++) repLines += Math.max(1, Math.ceil(String(report[rl]).length * 6.6 / 380));
    for (var wl = 0; wl < warnings.length; wl++) repLines += Math.max(1, Math.ceil(String(warnings[wl]).length * 6.6 / 380));
    repTxt.preferredSize = [380, 16 * repLines + 8];

    var btnRow = win.add("group");
    btnRow.alignment = ["right", "top"];
    var btnMakeAll = btnRow.add("button", undefined, "Make from art...");
    btnMakeAll.helpTip = "Opens the Make window with the layers of this sign type ticked, to build them from the art.";
    btnMakeAll.onClick = function () { runMake(""); };
    var btnToMaker2 = btnRow.add("button", undefined, "Pro version");
    btnToMaker2.helpTip = "For when you know what you are doing and do not need the notes: opens the small Production Maker window. The script opens in Pro next time until you press Helper there.";
    btnToMaker2.onClick = function () {
        setPref("promode", "1");
        win.close();
        launchScript(new File(SELF_PATH), "signpack_prodhelper");
    };
    var btnWeb = btnRow.add("button", undefined, "thesignpack.com");
    var btnClose = btnRow.add("button", undefined, "Close");
    btnWeb.onClick = function () { openUrl(WEBSITE); };
    btnWeb.helpTip = "Opens thesignpack.com in your browser.";
    btnClose.helpTip = "Closes the checklist.";
    btnClose.onClick = function () { win.close(); };

    paintStyle(win);
    styleGreenButton(btnMakeAll, BTN_MAKEALL);
    $.global.__PH_WIN = win;
    win.location = uik().pos();       // at the side, slightly left and up from the DPI Inspector
    win.show();
    TSP_RESULT = "SUCCESS: " + TSP_NAME + ": checklist opened" + (skip ? "." : ", production file made.");
})();

// last value of the file = what Sign Pack Tools shows in its status bar
(TSP_RESULT === "" ? ("WARNING: " + TSP_NAME + ": cancelled.") : TSP_RESULT);
