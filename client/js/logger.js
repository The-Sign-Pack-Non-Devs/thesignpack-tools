// ==========================================
// STATUS MESSAGES AT THE BOTTOM OF THE PANEL
// ==========================================
//
// notify(message, type, extras)
//   type:   "info" | "success" | "warning" | "error"
//   extras: { report: "text" }  adds a "Copy report" button to an error

function copyText(text){

    try{

        var box = document.createElement("textarea");

        box.value = text;
        box.style.position = "fixed";
        box.style.left = "-1000px";

        document.body.appendChild(box);

        box.select();

        var ok = document.execCommand("copy");

        box.remove();

        return ok;

    }
    catch(e){

        return false;

    }

}

// Text a person can send to support: tool, versions, system and the message
function buildReport(toolFile, message){

    var host = {};
    var os = "";

    try{ host = cs.getHostEnvironment() || {}; }catch(e){}
    try{ os = cs.getOSInformation() || ""; }catch(e){}

    return [
        "The Sign Pack Tools - error report",
        "Tool: " + toolFile,
        "Library: V" + (typeof LIBRARY !== "undefined" ? LIBRARY.getVersion() : "?"),
        "Illustrator: " + (host.appVersion || "?"),
        "System: " + os,
        "Time: " + new Date().toString(),
        "",
        "Message:",
        message
    ].join("\n");

}

function notify(message, type, extras){

    type = type || "info";

    const bar =
        document.getElementById("statusBar");

    if(!bar)
        return;

    const notification =
        document.createElement("div");

    notification.className =
        "status " + type;

    const text =
        document.createElement("span");

    text.textContent =
        message;

    notification.appendChild(text);

    let wait = 5000;

    if(type === "error" && extras && extras.report){

        const copy =
            document.createElement("button");

        copy.className = "status-btn";

        copy.textContent = "Copy report";

        copy.onclick = function(e){

            e.stopPropagation();

            copy.textContent = copyText(extras.report) ? "Copied" : "Could not copy";

        };

        notification.appendChild(copy);

        wait = 20000;

    }

    bar.appendChild(notification);

    setTimeout(function(){

        notification.remove();

    }, wait);

}
