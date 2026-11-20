const MENU = [

    {
        id: "artboards",
        title: "Artboards",
        icon: "icons/artboards.svg",

        tools: [

            {
                id: "artboards",
                title: "Artboards",
                description: "Create a new artboard for each object selected.",
                version: "1.5",
                help: "",
                tags: ["rename"]
            },

            {
                id: "artboardcontour",
                title: "Artboard's Stroke",
                description: "Create an artboard stroke.",
                help: "",
                tags: []
            },

            {
                id: "makecropmarksai",
                title: "Make CropMarks",
                description: "Create Cropmarks",
                help: "",
                tags: []
            },

            {
                id: "grommets",
                title: "Grommets/Hole Marks",
                description: "Create grommets or holes marks on artboard",
                help: "",
                tags: []
            }

        ]

    },

    {
        id: "prep",
        title: "Prep and check",
        icon: "icons/production.svg",

        tools: [

            {
                id: "helper",
                title: "Production Helper",
                description: "Help you to create a production file",
                version: "1.0",
                help: "",
                tags: ["cutcontour", "outline", "white ink"]
            }, 

            {
                id: "prodpreparation",
                title: "Prod Preparation",
                description: "Clean files, Delete layers...",
                help: {
                    type: "url",
                    url: "https://netorgft7340194.sharepoint.com/sites/TheSignPack2/SitePages/Production---Print-%26-Cut.aspx?web=1#getting-started"
                },
                tags: ["pre", "prod", "pre flight"]
            },

            {
                id: "preflightcheck",
                title: "Preflight Check",
                description: "Checks the file for potential production issues before manufacturing.",
                version: "1.1",
                help: "",
                tags: ["pre flight", "check"]
            },

            {
                id: "reference",
                title: "Create Reference Layer",
                description: "Create the reference layer.",
                help: "",
                tags: ["layer"]
            },

            {
                id: "relink",
                title: "Relink Links",
                description: "Fix missing or wrong links and embedded images",
                version: "1.0",
                help: "",
                tags: ["Image", "links"]
            }

        ]

    },

    {
        id: "export",
        title: "Export",
        icon: "icons/template.svg",

        tools: [

            {
                id: "exportproduction",
                title: "Export Production Files",
                description: "Export Production Files (PDF, AI, EPS, PNG, SVG)",
                version: "3.3",
                help: "",
                tags: ["pdf", "export"]
            },

            {
                id: "flexiexport",
                title: "Flexi-Safe Export",
                description: "Export to open in Flexi without any issues.",
                version: "1.4",
                help: "",
                tags: ["flexi", "export"]
            },

            {
                id: "standardize",
                title: "Standardize PDFs",
                description: "Make the multi-page presentation PDF, all pages the same size",
                version: "2.0",
                help: "",
                tags: ["Presentation", "PDF"]
            }

        ]

    },

    {
        id: "measure",
        title: "Measure and scale",
        icon: "icons/design.svg",

        tools: [

            {
                id: "sqftcalculator",
                title: "SQFT Calculator",
                description: "Calculate the SQFT",
                version: "1.5",
                help: "",
                tags: ["area"]
            },

            {
                id: "sqftcallout",
                title: "SQFT Callout",
                description: "Add a square footage callout at the corner of the selected art.",
                version: "2.2",
                help: "",
                tags: ["sqft", "measure"]
            },

            {
                id: "scaling",
                title: "Scaling",
                description: "Scale objects while maintaining aspect ratio",
                help: "",
                tags: []
            }

        ]

    }

];
