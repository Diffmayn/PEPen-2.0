# PEPen 2.0 - Digital Promotion Leaflet Proofing Tool

A powerful internal tool for marketing teams to preview, edit, and proof digital promotion leaflets. Built specifically for large retail companies handling complex promotional campaigns across multiple product categories.

## 🎯 Purpose

This tool enables marketing teams to:
- **Load and merge** IPR (Image Production Request) and Leaflet XML file pairs
- **Visually preview** promotional leaflets as they would appear digitally
- **Edit content** including headlines, prices, body text, and layouts
- **Switch between views** (single page, spread, mobile, print preview)
- **Export to PDF** for sharing and printing
- **Streamline workflows** without requiring technical knowledge

## 🚀 Quick Start

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone or navigate to the project directory:
```bash
cd "c:\Users\248075\.vscode\cli\PEPen 2.0"
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. (Optional) Start the collaboration server (real-time sync, comments, approval status, versions):

Open a second terminal and run:
```bash
npm run server
```

The collaboration server listens on `http://localhost:4000` and expects the React app on `http://localhost:3000`.

The application will open in your browser at `http://localhost:3000`

## 🌐 Streamlit Hosting (POC)

This repo includes a Streamlit entrypoint that embeds the production React build as a single self-contained HTML file.

### Generate the embedded app

```bash
npm install
npm run build
node scripts/generate_streamlit_embed.js
```

This creates `streamlit_embedded_app.html` (committed for Streamlit deployment).

### Run locally

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

### Deploy (Streamlit Community Cloud)

- App file: `streamlit_app.py`
- Python requirements: `requirements.txt`
- Ensure `streamlit_embedded_app.html` is present in the repo

### Collaboration notes (prototype)

- When collaboration is enabled, the app will prompt for a name (stored in localStorage).
- You can toggle collaboration on/off via the **"Samarbejde"** switch in the top toolbar (unless `REACT_APP_COLLAB` forces it).
- Open the same leaflet/event in two browser tabs to test live sync.
- The backend store is in-memory (restarting the server clears sessions, comments, versions, audit log).

**Environment variables**

- Frontend:
  - `REACT_APP_COLLAB=1` (enable) or `REACT_APP_COLLAB=0` (disable)
  - `REACT_APP_SERVER_URL=http://localhost:4000`
- Backend:
  - `PORT=4000`
  - `CLIENT_ORIGIN=http://localhost:3000`
  - `EXCHANGE_ENABLED=false` (POC uses hardcoded directory; go-live enables Exchange/Graph integration)

## @Mentions (tag kollega via email) – POC

Du kan tagge kollegaer i kommentarer ved at skrive `@` efterfulgt af en email. Når du vælger en email fra listen, bliver den indsat som et klikbart tag (pill-stil) og der bliver sendt en POC-notifikation.

### Sådan tester du

1. Start frontend: `npm start`
2. Start collab server: `npm run server`
3. Åbn kommentarer på et tilbud.
4. Skriv f.eks. `@ren` og vælg `rene@example.dk` fra dropdown.
5. Send kommentaren.

**POC-adfærd**

- Afsender får en toast: `Notifieret: @rene@example.dk` og en console log.
- Modtager får real-time “mention” (Socket.io) og en toast: `Du blev tagget af ...`.
- Mentions-inbox kan åbnes via `@`-ikonet i topbaren (fanen “Mentions”).

### Konfiguration (POC)

- Frontend email-liste/domæner: [src/config/mockEmailDirectory.js](src/config/mockEmailDirectory.js)
- Backend mock directory + endpoint: [server/index.js](server/index.js) (`GET /api/suggest-emails?q=...&limit=12`)

Der bliver kun foreslået “company” domæner (privacy/begrænsning af eksterne emails).

## Go-live (Exchange/Outlook) – design note

POC’en har et feature-flag: `EXCHANGE_ENABLED=true`. Når det slås til, er planen at erstatte mock directory-søgning med Microsoft Graph (anbefalet) eller EWS.

**Anbefalet Graph approach**

- Endpoint: behold `GET /api/suggest-emails`, men brug Graph directory search (prefix/fuzzy) med server-side auth.
- Sikkerhed: kræv auth på API’et, rate-limit, og returnér maks 10–20 forslag (ingen fuld directory dump).
- E-mails: valider at de findes i organisationens directory, og tillad kun firma-domæner.
- Notifikationer: send mail via Graph (Mail.Send) med kontekst (tilbud, side, snippet, deep-link).

Dette repo indeholder kun stubs for go-live (ingen credentials i kode).

## Føtex Principles v11 (layout forslag) – POC

Der er nu et simpelt “Princip”-lag baseret på [Føtex_principles_v11.pdf](F%C3%B8tex_principles_v11.pdf).

**Hvad det gør (i første iteration)**

- Per side kan du vælge **Vælg Princip** (fx `1a`, `2q`, `4c`) og trykke **Anvend**.
- “Anvend” laver et konservativt auto-layout ved at:
  - sortere tilbud efter `Block.priority` (lavest tal = højest prioritet)
  - sætte nogle få blokke til `Fuld bredde` / `Halv bredde` afhængigt af princip-gruppe
- Valgt princip gemmes sammen med layoutet i den samme `layoutByAreaId` struktur (real-time sync via Socket.io når collaboration er aktiv).

**Auto (anbefalet)**

- Hvis du ikke vælger et princip, foreslår UI’et automatisk:
  - `1a` på første og sidste side
  - `4a` hvis siden ser ud til at være ren tekstil (indkøbsgruppe `800/820/860`)

Auto-forslaget bliver kun “skrevet” til layout, når du trykker **Anvend**.

**Validering (advarsler)**

- Hvis du vælger et princip som ikke passer til siden, vises en lille advarsel under sidens titel (fx “Princip #4 er kun til tekstilsider.”).

## 📁 Project Structure

```
PEPen 2.0/
├── public/
│   └── index.html              # Main HTML file
├── src/
│   ├── components/
│   │   ├── FileUploader.js     # Drag-and-drop file upload
│   │   ├── Toolbar.js          # Top toolbar with actions
│   │   ├── LeafletViewer.js    # Main viewer container
│   │   ├── PageThumbnails.js   # Sidebar page navigation
│   │   ├── PageRenderer.js     # Individual page display
│   │   └── OfferCard.js        # Offer/product card component
│   ├── utils/
│   │   └── xmlParser.js        # XML parsing and merging logic
│   ├── App.js                  # Main application component
│   ├── App.css
│   ├── index.js
│   └── index.css
├── XML Files/                   # Sample XML files
│   ├── PMR_L1526052_IPR_*.xml
│   └── PMR_L1526052_Leaflet_*.xml
├── package.json
└── README.md
```

## 📖 Usage Guide

### 1. Loading XML Files

**Method 1: Drag and Drop**
- Drag both IPR and Leaflet XML files onto the upload area
- Files are detected by naming convention (IPR vs Leaflet)

**Method 2: File Picker**
- Click "Vælg filer" (Choose files)
- Select both XML files (hold Ctrl/Cmd for multiple selection)

**Method 3: Folder-based loading (recommended when you have many events)**
- Click "Indlæs fra mappe"
- Choose a folder containing multiple XML files
- Pick an event from the dropdown and click "Indlæs valgt event"

**Naming Convention**
- IPR file should contain "IPR" in the filename (e.g., `PMR_L1526052_IPR_*.xml`)
- Leaflet file should contain "Leaflet" in the filename (e.g., `PMR_L1526052_Leaflet_*.xml`)
- Both files should share the same promotion event ID (e.g., `L1526052`)

**Browser support note:** Folder loading requires `window.showDirectoryPicker()` (typically works in Edge/Chrome) and only works in a secure context (localhost/HTTPS). The folder scan is recursive (includes subfolders). If multiple files match the same event, the newest timestamped IPR/Leaflet is chosen. If it’s unavailable, use Method 1/2.

### 2. Navigating Pages

- **Sidebar Thumbnails**: Click any page thumbnail to jump to that page
- **Page Information**: Each thumbnail shows page number/name and offer count

### 3. View Modes

Switch between different view modes using the dropdown in the toolbar:

- **Enkelt side** (Single Page): View one page at a time - default view
- **Opslag** (Spread): View two pages side-by-side like an open book
- **Mobil** (Mobile): Preview how the leaflet looks on mobile devices (375px width)
- **Udskrift** (Print): A4 print preview with proper margins

### 4. Technical View

- Toggle **"Teknisk visning"** in the top toolbar to see a read-only breakdown of the underlying page/block/offer data.
- Editing is disabled while Technical View is enabled.

### 5. Zoom Control

- Use the **+** and **-** buttons to zoom in/out (50% - 200%)
- Current zoom level is displayed between the buttons

### 6. Editing Mode

- Click the edit icon to toggle editing mode
- In edit mode you can:
  - Click and edit offer fields (headline/body/price depending on template)
  - Drag blocks to reorder within a page
  - Change block width (Standard / Halv bredde / Fuld bredde)
  - Use **"Nulstil layout"** to revert the current page to the default XML ordering/sizing

Layout changes are stored in your browser (localStorage) per event.

### 7. Exporting

**PDF Export**
- Click "Eksporter PDF" to generate a proof PDF (includes an internal watermark)

**Data/XML Export**
- Export the merged/edited data as JSON
- Export an updated Leaflet XML

## 🔧 Technical Details

### XML Data Structure

The tool processes two types of XML files:

**IPR XML (Image Production Request)**
- Contains image requests with product details
- Structure: `MarketVersion` → `Area` → `ImageRequest`
- Key data: Product images, descriptions, body text, logos

**Leaflet XML**
- Contains layout and pricing information
- Structure: `MarketVersion` → `Area` → `Block` → `Offer` → `Box`
- Key data: Headlines, prices, content templates, layouts

### Merging Logic

1. **Parse both XMLs** to JSON format
2. **Extract Areas** from both files (matched by Area ID)
3. **Match ImageRequests** from IPR with Offers in Leaflet (by OfferID)
4. **Deduplicate images** by PublicID to show only unique images
5. **Combine data** into unified structure with:
   - Headlines from both sources (Leaflet takes priority)
   - Body text merged from products and offers
   - Prices from Leaflet
   - Images from both IPR and Leaflet (deduplicated)
   - Product details from IPR

### Data Cleaning

The following technical elements are **removed** from the UI:
- RequestID, BlockID, TemplateID
- schemaVersion, SenderBusinessSystemID
- LastChangeDateTime, Change elements
- Raw XML structure tags

Only clean, user-friendly content is displayed:
- Product headlines
- Descriptions and body text
- Prices (in DKK)
- Logos
- Product images

## 🎨 Features

### ✅ Implemented (MVP)

- ✅ XML file pair upload (drag-and-drop and file picker)
- ✅ Folder-based loading with event selection (Edge/Chrome)
- ✅ XML parsing and intelligent merging
- ✅ Page thumbnail navigation
- ✅ Multiple view modes (single, spread, mobile, print)
- ✅ Zoom controls (50% - 200%)
- ✅ Clean visual rendering of offers
- ✅ Image display with fallback
- ✅ Danish localization
- ✅ Responsive design
- ✅ Error handling and validation
- ✅ Technical View (read-only debug breakdown)
- ✅ Editing mode (offer fields)
- ✅ Layout editing (reorder + width presets + per-event persistence)
- ✅ Export: PDF, JSON, updated Leaflet XML
- ✅ Collaboration (prototype): presence, approval status, comments, versions + audit log (requires `npm run server`)

### 🚧 In Progress / Coming Soon

- 🚧 Undo/redo functionality
- 🚧 Text formatting tools
- 🚧 Template management
- 🚧 Annotations and comments

## 🧪 Testing

### Sample Data

Use the provided XML files in the `XML Files/` directory:
- `PMR_L1526052_IPR_2026-01-09 14_11_32.xml`
- `PMR_L1526052_Leaflet_2026-01-09 14_11_32.xml`

These files contain real promotional data including:
- **Badetøj (Swimwear)**: Badeshorts, badedragt (page 12)
- **3 FOR 2 campaigns**: Tea bags and storage bags (page 2)
- **Kapitalvarer (Capital goods)**: Grills, tents, fitness equipment (pages 3-6)
- **Jackets and clothing** (page 4)
- **Outdoor plants and garden items** (page 14)

### Test Cases

1. **Load XML Pair**: Upload both files and verify successful parsing
2. **Page Navigation**: Click through all pages in sidebar
3. **View Modes**: Test all 4 view modes
4. **Zoom**: Test zoom in/out functionality
5. **Image Display**: Verify images load correctly with fallbacks
6. **Data Integrity**: Check that headlines, prices, and body text display correctly
7. **Danish Characters**: Verify æ, ø, å characters display properly

## 🐛 Troubleshooting

### Common Issues

**"Please upload exactly 2 XML files"**
- Make sure you're uploading both IPR and Leaflet files
- Check that files have .xml extension

**"Failed to parse XML"**
- Verify XML files are not corrupted
- Check that files match the expected schema version
- Ensure files are properly formatted XML

**Images not loading**
- Some image URLs may require authentication
- Placeholder will show if image fails to load
- Check console for specific image errors

**Page not displaying offers**
- Some pages may be empty in the source XML
- Check that Area contains Blocks with Offers
- Verify OfferID matching between IPR and Leaflet

## 🛠️ Development

### Available Scripts

- `npm start`: Start development server
- `npm build`: Build production version
- `npm test`: Run tests
- `npm eject`: Eject from Create React App (one-way operation)

### Dependencies

**Core:**
- React 18.2.0
- Material-UI 5.14
- xml2js 0.6.2

**PDF/Export:**
- jsPDF 2.5.1
- html2canvas 1.4.1

**UI Components:**
- @mui/material
- @mui/icons-material
- @emotion/react
- @emotion/styled

### Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 📝 Notes

### Design Decisions

1. **Client-side processing**: All XML parsing happens in the browser for security and performance
2. **React + Material-UI**: Modern, maintainable component architecture
3. **Lazy loading**: Only current page is fully rendered to optimize performance
4. **Modular structure**: Easy to extend with new features
5. **Danish-first UI**: Primary language is Danish with English fallback

### Future Enhancements

- Integration with company APIs for direct XML loading
- Collaborative editing with real-time sync
- Version history and change tracking
- Advanced image editing
- Template library management
- Automated QA checks
- Export to multiple formats (PNG, SVG, etc.)

## 🤝 Support

For issues, feature requests, or questions:
1. Check the troubleshooting section above
2. Review the sample XML files for correct format
3. Check browser console for detailed error messages

## 📄 License

Internal tool for [Company Name]. All rights reserved.

---

**Version:** 1.0.0  
**Last Updated:** January 2026  
**Built by:** [Your Name/Team]
- Template library management
- Automated QA checks
- Export to multiple formats (PNG, SVG, etc.)

## 🤝 Support

For issues, feature requests, or questions:
1. Check the troubleshooting section above
2. Review the sample XML files for correct format
3. Check browser console for detailed error messages

## 📄 License

Internal tool for [Company Name]. All rights reserved.

---

**Version:** 1.0.0  
**Last Updated:** January 2026  
**Built by:** [Your Name/Team]
